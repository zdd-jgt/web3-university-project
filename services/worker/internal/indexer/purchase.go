// Package indexer derives entitlement records from CourseMarket purchase logs.
// It intentionally does not decide course completion or issue certificates.
package indexer

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/yideng/web3-university-worker/internal/storage"
)

const courseMarketABI = `[
  {"type":"event","name":"CoursePurchased","anonymous":false,"inputs":[
    {"name":"buyer","type":"address","indexed":true},
    {"name":"courseId","type":"uint256","indexed":true},
    {"name":"priceYD","type":"uint256","indexed":false},
    {"name":"payoutWallet","type":"address","indexed":true},
    {"name":"teacherAmount","type":"uint256","indexed":false},
    {"name":"treasury","type":"address","indexed":false},
    {"name":"platformAmount","type":"uint256","indexed":false},
    {"name":"purchasedAt","type":"uint64","indexed":false}
  ]}
]`

const purchaseStreamName = "course-market-purchases/v1"

type LogSource interface {
	LatestBlock(ctx context.Context) (uint64, error)
	BlockHash(ctx context.Context, block uint64) (string, error)
	PurchaseLogs(ctx context.Context, from uint64, to uint64) ([]storage.PurchaseObservation, error)
}

type CheckpointStore interface {
	LoadCheckpoint(ctx context.Context, stream storage.PurchaseStream) (storage.Checkpoint, error)
	ApplyPurchaseRange(ctx context.Context, stream storage.PurchaseStream, rewindFrom uint64, observations []storage.PurchaseObservation, nextBlock uint64, checkpointHash string, now time.Time) error
}

type PurchaseIndexer struct {
	store         CheckpointStore
	source        LogSource
	stream        storage.PurchaseStream
	startBlock    uint64
	confirmations uint64
	reorgDepth    uint64
	now           func() time.Time
}

func NewPurchaseIndexer(store CheckpointStore, source LogSource, chainID int64, marketAddress string, startBlock, confirmations, reorgDepth uint64) (*PurchaseIndexer, error) {
	if store == nil || source == nil {
		return nil, errors.New("purchase indexer dependencies are required")
	}
	stream := storage.PurchaseStream{ChainID: chainID, ContractAddress: strings.ToLower(strings.TrimSpace(marketAddress)), Name: purchaseStreamName}
	if err := stream.Validate(); err != nil {
		return nil, err
	}
	if confirmations == 0 || reorgDepth == 0 {
		return nil, errors.New("confirmations and reorg depth must be positive")
	}
	return &PurchaseIndexer{store: store, source: source, stream: stream, startBlock: startBlock, confirmations: confirmations, reorgDepth: reorgDepth, now: func() time.Time { return time.Now().UTC() }}, nil
}

// Sync applies only sufficiently confirmed blocks. It always replays a small
// canonical overlap, so a short chain reorganization revokes stale facts and
// reconstructs the entitlement projection in one database transaction.
func (indexer *PurchaseIndexer) Sync(ctx context.Context) error {
	head, err := indexer.source.LatestBlock(ctx)
	if err != nil {
		return fmt.Errorf("read chain head: %w", err)
	}
	if head+1 < indexer.confirmations {
		return nil
	}
	safeHead := head - (indexer.confirmations - 1)
	if safeHead < indexer.startBlock {
		return nil
	}
	checkpoint, err := indexer.store.LoadCheckpoint(ctx, indexer.stream)
	if err != nil {
		return err
	}
	nextBlock := indexer.startBlock
	if checkpoint.Exists && checkpoint.NextBlock > nextBlock {
		nextBlock = checkpoint.NextBlock
	}
	if nextBlock > safeHead+1 {
		nextBlock = safeHead + 1
	}
	rewindFrom := indexer.startBlock
	if nextBlock > indexer.reorgDepth && nextBlock-indexer.reorgDepth > rewindFrom {
		rewindFrom = nextBlock - indexer.reorgDepth
	}
	logs, err := indexer.source.PurchaseLogs(ctx, rewindFrom, safeHead)
	if err != nil {
		return fmt.Errorf("read course purchase logs: %w", err)
	}
	checkpointHash, err := indexer.source.BlockHash(ctx, safeHead)
	if err != nil {
		return fmt.Errorf("read safe block hash: %w", err)
	}
	if err := indexer.store.ApplyPurchaseRange(ctx, indexer.stream, rewindFrom, logs, safeHead+1, checkpointHash, indexer.now()); err != nil {
		return fmt.Errorf("apply course purchase range: %w", err)
	}
	return nil
}

// EthereumPurchaseSource adapts go-ethereum without exposing RPC details to
// indexer tests or the storage layer.
type EthereumPurchaseSource struct {
	client     *ethclient.Client
	market     common.Address
	purchaseID common.Hash
}

func NewEthereumPurchaseSource(client *ethclient.Client, marketAddress string) (*EthereumPurchaseSource, error) {
	if client == nil {
		return nil, errors.New("ethereum client is required")
	}
	if !common.IsHexAddress(marketAddress) || common.HexToAddress(marketAddress) == (common.Address{}) {
		return nil, errors.New("valid course market address is required")
	}
	parsed, err := abi.JSON(strings.NewReader(courseMarketABI))
	if err != nil {
		return nil, fmt.Errorf("parse course market ABI: %w", err)
	}
	return &EthereumPurchaseSource{client: client, market: common.HexToAddress(marketAddress), purchaseID: parsed.Events["CoursePurchased"].ID}, nil
}

func (source *EthereumPurchaseSource) LatestBlock(ctx context.Context) (uint64, error) {
	return source.client.BlockNumber(ctx)
}

func (source *EthereumPurchaseSource) BlockHash(ctx context.Context, block uint64) (string, error) {
	header, err := source.client.HeaderByNumber(ctx, new(big.Int).SetUint64(block))
	if err != nil {
		return "", err
	}
	return header.Hash().Hex(), nil
}

func (source *EthereumPurchaseSource) PurchaseLogs(ctx context.Context, from uint64, to uint64) ([]storage.PurchaseObservation, error) {
	if from > to {
		return nil, errors.New("log range is invalid")
	}
	logs, err := source.client.FilterLogs(ctx, ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(from), ToBlock: new(big.Int).SetUint64(to),
		Addresses: []common.Address{source.market}, Topics: [][]common.Hash{{source.purchaseID}},
	})
	if err != nil {
		return nil, err
	}
	observations := make([]storage.PurchaseObservation, 0, len(logs))
	for _, log := range logs {
		observation, err := decodePurchaseLog(source.market, source.purchaseID, log)
		if err != nil {
			return nil, err
		}
		observations = append(observations, observation)
	}
	return observations, nil
}

func decodePurchaseLog(market common.Address, purchaseID common.Hash, log types.Log) (storage.PurchaseObservation, error) {
	if log.Address != market || len(log.Topics) != 4 || log.Topics[0] != purchaseID || log.Removed {
		return storage.PurchaseObservation{}, errors.New("unexpected CoursePurchased log")
	}
	buyer := common.BytesToAddress(log.Topics[1].Bytes()).Hex()
	courseID := new(big.Int).SetBytes(log.Topics[2].Bytes())
	if courseID.Sign() <= 0 || log.TxHash == (common.Hash{}) || log.BlockHash == (common.Hash{}) {
		return storage.PurchaseObservation{}, errors.New("invalid CoursePurchased log")
	}
	return storage.PurchaseObservation{
		TxHash: log.TxHash.Hex(), LogIndex: log.Index, BlockNumber: log.BlockNumber, BlockHash: log.BlockHash.Hex(), BuyerWallet: buyer, ChainCourseID: courseID,
	}, nil
}
