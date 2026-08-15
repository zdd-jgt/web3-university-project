package indexer

import (
	"context"
	"errors"
	"math/big"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/yideng/web3-university-worker/internal/storage"
)

func TestSyncReplaysOverlapAndPersistsConfirmedRange(t *testing.T) {
	store := &fakeCheckpointStore{}
	source := &fakeLogSource{
		head: 104,
		logs: []storage.PurchaseObservation{{
			TxHash: "0xaaa", LogIndex: 1, BlockNumber: 102, BlockHash: "0xbbb", BuyerWallet: "0x1111111111111111111111111111111111111111", ChainCourseID: big.NewInt(7),
		}},
	}
	indexer := mustIndexer(t, store, source, 100, 2, 12)
	indexer.now = func() time.Time { return time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC) }

	if err := indexer.Sync(context.Background()); err != nil {
		t.Fatalf("Sync() error = %v", err)
	}
	if source.from != 100 || source.to != 103 {
		t.Fatalf("log range = %d..%d, want 100..103", source.from, source.to)
	}
	if store.rewindFrom != 100 || store.nextBlock != 104 || store.hash != "0xsafe" {
		t.Fatalf("persisted range = rewind %d, next %d, hash %q", store.rewindFrom, store.nextBlock, store.hash)
	}
	if len(store.observations) != 1 || store.observations[0].ChainCourseID.Cmp(big.NewInt(7)) != 0 {
		t.Fatalf("observations = %#v", store.observations)
	}
}

func TestSyncUsesCheckpointAndConfiguredReorgOverlap(t *testing.T) {
	store := &fakeCheckpointStore{checkpoint: storage.Checkpoint{Exists: true, NextBlock: 250, BlockHash: "0xold"}}
	source := &fakeLogSource{head: 260}
	indexer := mustIndexer(t, store, source, 100, 2, 12)

	if err := indexer.Sync(context.Background()); err != nil {
		t.Fatalf("Sync() error = %v", err)
	}
	if source.from != 238 || source.to != 259 {
		t.Fatalf("log range = %d..%d, want 238..259", source.from, source.to)
	}
}

func TestSyncDoesNotAdvanceCheckpointWhenRPCLogReadFails(t *testing.T) {
	store := &fakeCheckpointStore{}
	source := &fakeLogSource{head: 101, logsErr: errors.New("rpc unavailable")}
	indexer := mustIndexer(t, store, source, 100, 1, 1)

	if err := indexer.Sync(context.Background()); err == nil {
		t.Fatal("Sync() error = nil, want RPC error")
	}
	if store.applyCalls != 0 {
		t.Fatalf("ApplyPurchaseRange calls = %d, want 0", store.applyCalls)
	}
}

func TestDecodePurchaseLogRejectsUnexpectedSource(t *testing.T) {
	market := common.HexToAddress("0x1111111111111111111111111111111111111111")
	purchaseID := crypto.Keccak256Hash([]byte("CoursePurchased(address,uint256,uint256,address,uint256,address,uint256,uint64)"))
	log := types.Log{Address: common.HexToAddress("0x2222222222222222222222222222222222222222"), Topics: []common.Hash{purchaseID}}
	if _, err := decodePurchaseLog(market, purchaseID, log); err == nil {
		t.Fatal("decodePurchaseLog() error = nil, want source rejection")
	}
}

func mustIndexer(t *testing.T, store CheckpointStore, source LogSource, start, confirmations, depth uint64) *PurchaseIndexer {
	t.Helper()
	indexer, err := NewPurchaseIndexer(store, source, 31337, "0x1111111111111111111111111111111111111111", start, confirmations, depth)
	if err != nil {
		t.Fatalf("NewPurchaseIndexer() error = %v", err)
	}
	return indexer
}

type fakeCheckpointStore struct {
	checkpoint   storage.Checkpoint
	applyCalls   int
	rewindFrom   uint64
	observations []storage.PurchaseObservation
	nextBlock    uint64
	hash         string
}

func (store *fakeCheckpointStore) LoadCheckpoint(context.Context, storage.PurchaseStream) (storage.Checkpoint, error) {
	return store.checkpoint, nil
}

func (store *fakeCheckpointStore) ApplyPurchaseRange(_ context.Context, _ storage.PurchaseStream, rewindFrom uint64, observations []storage.PurchaseObservation, nextBlock uint64, checkpointHash string, _ time.Time) error {
	store.applyCalls++
	store.rewindFrom = rewindFrom
	store.observations = observations
	store.nextBlock = nextBlock
	store.hash = checkpointHash
	return nil
}

type fakeLogSource struct {
	head    uint64
	from    uint64
	to      uint64
	logs    []storage.PurchaseObservation
	logsErr error
}

func (source *fakeLogSource) LatestBlock(context.Context) (uint64, error)       { return source.head, nil }
func (source *fakeLogSource) BlockHash(context.Context, uint64) (string, error) { return "0xsafe", nil }
func (source *fakeLogSource) PurchaseLogs(_ context.Context, from, to uint64) ([]storage.PurchaseObservation, error) {
	source.from, source.to = from, to
	if source.logsErr != nil {
		return nil, source.logsErr
	}
	return source.logs, nil
}
