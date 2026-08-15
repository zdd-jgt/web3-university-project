package indexer

import (
	"context"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/yideng/web3-university-worker/internal/storage"
)

func TestCatalogSourceDecodesConfiguredBindingFacts(t *testing.T) {
	parsed, err := abi.JSON(strings.NewReader(courseCatalogABI))
	if err != nil {
		t.Fatalf("parse ABI: %v", err)
	}
	catalog := common.HexToAddress("0x1111111111111111111111111111111111111111")
	payout := common.HexToAddress("0x2222222222222222222222222222222222222222")
	metadata := common.HexToHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	data, err := parsed.Events["CourseConfigured"].Inputs.NonIndexed().Pack(big.NewInt(4e18), metadata, uint64(1))
	if err != nil {
		t.Fatalf("pack event: %v", err)
	}
	decoder := &EthereumCatalogSource{
		address:    catalog,
		abi:        parsed,
		configured: parsed.Events["CourseConfigured"].ID,
		status:     parsed.Events["CourseStatusChanged"].ID,
	}
	event, err := decoder.decode(types.Log{
		Address: catalog,
		Topics: []common.Hash{
			parsed.Events["CourseConfigured"].ID,
			common.BigToHash(big.NewInt(7)),
			common.BytesToHash(payout.Bytes()),
		},
		Data: data,
	})
	if err != nil {
		t.Fatalf("decode configured event: %v", err)
	}
	if event.Configured == nil || event.Configured.ChainCourseID.Cmp(big.NewInt(7)) != 0 || event.Configured.PriceYD.Cmp(big.NewInt(4e18)) != 0 || !strings.EqualFold(event.Configured.PayoutWallet, payout.Hex()) || !strings.EqualFold(event.Configured.MetadataHash, metadata.Hex()) {
		t.Fatalf("decoded event = %#v", event.Configured)
	}
}

func TestCatalogIndexerSavesCheckpointAfterProjection(t *testing.T) {
	published := true
	store := &fakeCatalogStore{}
	source := &fakeCatalogSource{
		head:   104,
		events: []CatalogEvent{{StatusCourseID: big.NewInt(7), Published: &published}},
	}
	indexer, err := NewCatalogIndexer(store, source, 31337, "0x1111111111111111111111111111111111111111", 100, 2, 12)
	if err != nil {
		t.Fatalf("NewCatalogIndexer: %v", err)
	}
	indexer.now = func() time.Time { return time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC) }
	if err := indexer.Sync(context.Background()); err != nil {
		t.Fatalf("Sync: %v", err)
	}
	if store.statusCalls != 1 || store.savedNext != 104 || source.from != 100 || source.to != 103 {
		t.Fatalf("statusCalls=%d savedNext=%d range=%d..%d", store.statusCalls, store.savedNext, source.from, source.to)
	}
}

type fakeCatalogSource struct {
	head     uint64
	from, to uint64
	events   []CatalogEvent
}

func (source *fakeCatalogSource) LatestBlock(context.Context) (uint64, error) {
	return source.head, nil
}
func (source *fakeCatalogSource) BlockHash(context.Context, uint64) (string, error) {
	return common.HexToHash("0x1234").Hex(), nil
}
func (source *fakeCatalogSource) CatalogEvents(_ context.Context, from, to uint64) ([]CatalogEvent, error) {
	source.from, source.to = from, to
	return source.events, nil
}

type fakeCatalogStore struct {
	statusCalls int
	savedNext   uint64
}

func (*fakeCatalogStore) LoadCheckpoint(context.Context, storage.PurchaseStream) (storage.Checkpoint, error) {
	return storage.Checkpoint{}, nil
}
func (*fakeCatalogStore) PublishApprovedCatalogCourse(context.Context, storage.PurchaseStream, storage.CatalogConfigured, time.Time) (bool, error) {
	return true, nil
}
func (store *fakeCatalogStore) ProjectCatalogCourseStatus(context.Context, storage.PurchaseStream, *big.Int, bool, time.Time) (bool, error) {
	store.statusCalls++
	return true, nil
}
func (store *fakeCatalogStore) SaveCheckpoint(_ context.Context, _ storage.PurchaseStream, next uint64, _ string, _ time.Time) error {
	store.savedNext = next
	return nil
}
