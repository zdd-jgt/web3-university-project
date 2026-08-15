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

const catalogStreamName = "course-catalog/v1"

const courseCatalogABI = `[
 {"type":"event","name":"CourseConfigured","anonymous":false,"inputs":[{"name":"courseId","type":"uint256","indexed":true},{"name":"priceYD","type":"uint256","indexed":false},{"name":"payoutWallet","type":"address","indexed":true},{"name":"metadataHash","type":"bytes32","indexed":false},{"name":"version","type":"uint64","indexed":false}]},
 {"type":"event","name":"CourseStatusChanged","anonymous":false,"inputs":[{"name":"courseId","type":"uint256","indexed":true},{"name":"previousStatus","type":"uint8","indexed":false},{"name":"newStatus","type":"uint8","indexed":false},{"name":"version","type":"uint64","indexed":false}]}
]`

type CatalogEvent struct {
	Configured     *storage.CatalogConfigured
	StatusCourseID *big.Int
	Published      *bool
}
type CatalogSource interface {
	LatestBlock(context.Context) (uint64, error)
	BlockHash(context.Context, uint64) (string, error)
	CatalogEvents(context.Context, uint64, uint64) ([]CatalogEvent, error)
}
type CatalogStore interface {
	LoadCheckpoint(context.Context, storage.PurchaseStream) (storage.Checkpoint, error)
	PublishApprovedCatalogCourse(context.Context, storage.PurchaseStream, storage.CatalogConfigured, time.Time) (bool, error)
	ProjectCatalogCourseStatus(context.Context, storage.PurchaseStream, *big.Int, bool, time.Time) (bool, error)
	SaveCheckpoint(context.Context, storage.PurchaseStream, uint64, string, time.Time) error
}
type CatalogIndexer struct {
	store                       CatalogStore
	source                      CatalogSource
	stream                      storage.PurchaseStream
	start, confirmations, depth uint64
	now                         func() time.Time
}

func NewCatalogIndexer(store CatalogStore, source CatalogSource, chainID int64, address string, start, confirmations, depth uint64) (*CatalogIndexer, error) {
	if store == nil || source == nil || confirmations == 0 || depth == 0 {
		return nil, errors.New("catalog indexer dependencies are invalid")
	}
	stream := storage.PurchaseStream{ChainID: chainID, ContractAddress: strings.ToLower(strings.TrimSpace(address)), Name: catalogStreamName}
	if err := stream.Validate(); err != nil {
		return nil, err
	}
	return &CatalogIndexer{store: store, source: source, stream: stream, start: start, confirmations: confirmations, depth: depth, now: func() time.Time { return time.Now().UTC() }}, nil
}
func (i *CatalogIndexer) Sync(ctx context.Context) error {
	head, err := i.source.LatestBlock(ctx)
	if err != nil {
		return err
	}
	if head+1 < i.confirmations {
		return nil
	}
	safe := head - (i.confirmations - 1)
	if safe < i.start {
		return nil
	}
	cp, err := i.store.LoadCheckpoint(ctx, i.stream)
	if err != nil {
		return err
	}
	next := i.start
	if cp.Exists && cp.NextBlock > next {
		next = cp.NextBlock
	}
	if next > safe+1 {
		next = safe + 1
	}
	from := i.start
	if next > i.depth && next-i.depth > from {
		from = next - i.depth
	}
	events, err := i.source.CatalogEvents(ctx, from, safe)
	if err != nil {
		return fmt.Errorf("read catalog events: %w", err)
	}
	now := i.now()
	for _, event := range events {
		if event.Configured != nil {
			if _, err := i.store.PublishApprovedCatalogCourse(ctx, i.stream, *event.Configured, now); err != nil {
				return err
			}
		}
		if event.StatusCourseID != nil && event.Published != nil {
			if _, err := i.store.ProjectCatalogCourseStatus(ctx, i.stream, event.StatusCourseID, *event.Published, now); err != nil {
				return err
			}
		}
	}
	hash, err := i.source.BlockHash(ctx, safe)
	if err != nil {
		return err
	}
	return i.store.SaveCheckpoint(ctx, i.stream, safe+1, hash, now)
}

type EthereumCatalogSource struct {
	client             *ethclient.Client
	address            common.Address
	abi                abi.ABI
	configured, status common.Hash
}

func NewEthereumCatalogSource(client *ethclient.Client, address string) (*EthereumCatalogSource, error) {
	if client == nil || !common.IsHexAddress(address) || common.HexToAddress(address) == (common.Address{}) {
		return nil, errors.New("valid course catalog address is required")
	}
	parsed, err := abi.JSON(strings.NewReader(courseCatalogABI))
	if err != nil {
		return nil, err
	}
	return &EthereumCatalogSource{client: client, address: common.HexToAddress(address), abi: parsed, configured: parsed.Events["CourseConfigured"].ID, status: parsed.Events["CourseStatusChanged"].ID}, nil
}
func (s *EthereumCatalogSource) LatestBlock(ctx context.Context) (uint64, error) {
	return s.client.BlockNumber(ctx)
}
func (s *EthereumCatalogSource) BlockHash(ctx context.Context, b uint64) (string, error) {
	h, e := s.client.HeaderByNumber(ctx, new(big.Int).SetUint64(b))
	if e != nil {
		return "", e
	}
	return h.Hash().Hex(), nil
}
func (s *EthereumCatalogSource) CatalogEvents(ctx context.Context, from, to uint64) ([]CatalogEvent, error) {
	logs, err := s.client.FilterLogs(ctx, ethereum.FilterQuery{FromBlock: new(big.Int).SetUint64(from), ToBlock: new(big.Int).SetUint64(to), Addresses: []common.Address{s.address}, Topics: [][]common.Hash{{s.configured, s.status}}})
	if err != nil {
		return nil, err
	}
	out := make([]CatalogEvent, 0, len(logs))
	for _, log := range logs {
		e, err := s.decode(log)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}
func (s *EthereumCatalogSource) decode(log types.Log) (CatalogEvent, error) {
	if log.Address != s.address || log.Removed || len(log.Topics) < 2 {
		return CatalogEvent{}, errors.New("unexpected catalog log")
	}
	id := new(big.Int).SetBytes(log.Topics[1].Bytes())
	if id.Sign() <= 0 {
		return CatalogEvent{}, errors.New("invalid catalog course ID")
	}
	if log.Topics[0] == s.configured {
		if len(log.Topics) != 3 {
			return CatalogEvent{}, errors.New("invalid configured log")
		}
		v, err := s.abi.Events["CourseConfigured"].Inputs.NonIndexed().Unpack(log.Data)
		if err != nil {
			return CatalogEvent{}, err
		}
		price := v[0].(*big.Int)
		metadata := common.Hash(v[1].([32]byte)).Hex()
		payout := common.BytesToAddress(log.Topics[2].Bytes()).Hex()
		return CatalogEvent{Configured: &storage.CatalogConfigured{ChainCourseID: id, PriceYD: price, PayoutWallet: payout, MetadataHash: metadata}}, nil
	}
	if log.Topics[0] == s.status {
		if len(log.Topics) != 2 {
			return CatalogEvent{}, errors.New("invalid status log")
		}
		v, err := s.abi.Events["CourseStatusChanged"].Inputs.NonIndexed().Unpack(log.Data)
		if err != nil {
			return CatalogEvent{}, err
		}
		status := v[1].(uint8)
		if status != 1 && status != 2 {
			return CatalogEvent{}, errors.New("invalid catalog status")
		}
		published := status == 1
		return CatalogEvent{StatusCourseID: id, Published: &published}, nil
	}
	return CatalogEvent{}, errors.New("unknown catalog event")
}
