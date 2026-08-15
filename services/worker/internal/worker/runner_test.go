package worker

import (
	"context"
	"errors"
	"math/big"
	"testing"
	"time"

	"github.com/yideng/web3-university-worker/internal/domain"
)

func TestRunOnceReconcilesExistingCertificateWithoutMint(t *testing.T) {
	clock := fixedClock{now: time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)}
	job := validJob()
	store := &memoryStore{pending: []domain.MintJob{job}}
	chain := &fakeChain{existingTokenID: big.NewInt(42)}
	runner := mustRunner(t, store, chain, clock, 5)

	if err := runner.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce() error = %v", err)
	}
	if chain.mintCalls != 0 {
		t.Fatalf("mint calls = %d, want 0", chain.mintCalls)
	}
	if store.confirmedTokenID == nil || store.confirmedTokenID.Cmp(big.NewInt(42)) != 0 {
		t.Fatalf("confirmed token id = %v, want 42", store.confirmedTokenID)
	}
}

func TestRunOnceBroadcastsOneMintAndRecordsHash(t *testing.T) {
	clock := fixedClock{now: time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)}
	store := &memoryStore{pending: []domain.MintJob{validJob()}}
	chain := &fakeChain{existingTokenID: new(big.Int), txHash: "0xabc"}
	runner := mustRunner(t, store, chain, clock, 5)

	if err := runner.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce() error = %v", err)
	}
	if chain.mintCalls != 1 {
		t.Fatalf("mint calls = %d, want 1", chain.mintCalls)
	}
	if store.broadcastHash != "0xabc" {
		t.Fatalf("broadcast hash = %q, want 0xabc", store.broadcastHash)
	}
}

func TestRunOnceSchedulesRetryAndEventuallyFails(t *testing.T) {
	clock := fixedClock{now: time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)}
	job := validJob()
	job.Attempts = 2
	store := &memoryStore{pending: []domain.MintJob{job}}
	chain := &fakeChain{certificateError: errors.New("rpc unavailable")}
	runner := mustRunner(t, store, chain, clock, 3)

	if err := runner.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce() error = %v", err)
	}
	if store.failedReason == "" {
		t.Fatal("expected exhausted job to be marked failed")
	}
}

func TestRetryDelayIsBounded(t *testing.T) {
	if got := retryDelay(1); got != time.Second {
		t.Fatalf("retryDelay(1) = %v, want 1s", got)
	}
	if got := retryDelay(100); got != 128*time.Second {
		t.Fatalf("retryDelay(100) = %v, want 128s", got)
	}
}

func validJob() domain.MintJob {
	return domain.MintJob{
		ID:            "job-1",
		CourseID:      "course-1",
		ChainCourseID: big.NewInt(10),
		BuyerAddress:  "0x1111111111111111111111111111111111111111",
		TokenURI:      "ipfs://certificate/1",
		State:         domain.JobPending,
	}
}

func mustRunner(t *testing.T, store JobStore, chain CertificateChain, clock Clock, maxAttempts int) *Runner {
	t.Helper()
	runner, err := NewRunner(store, chain, clock, discardLogger{}, "worker-test", 2, 30*time.Second, maxAttempts)
	if err != nil {
		t.Fatalf("NewRunner() error = %v", err)
	}
	return runner
}

type fixedClock struct{ now time.Time }

func (clock fixedClock) Now() time.Time { return clock.now }

type discardLogger struct{}

func (discardLogger) Info(string, ...any)  {}
func (discardLogger) Error(string, ...any) {}

type fakeChain struct {
	existingTokenID  *big.Int
	certificateError error
	txHash           string
	mintCalls        int
	receipt          Receipt
}

func (chain *fakeChain) CertificateOf(context.Context, string, *big.Int, uint64) (*big.Int, error) {
	if chain.certificateError != nil {
		return nil, chain.certificateError
	}
	if chain.existingTokenID == nil {
		return new(big.Int), nil
	}
	return new(big.Int).Set(chain.existingTokenID), nil
}

func (chain *fakeChain) MintCertificate(context.Context, string, *big.Int, string) (string, error) {
	chain.mintCalls++
	return chain.txHash, nil
}

func (chain *fakeChain) Receipt(context.Context, string, uint64) (Receipt, error) {
	return chain.receipt, nil
}

type memoryStore struct {
	pending          []domain.MintJob
	broadcast        []domain.MintJob
	broadcastHash    string
	confirmedTokenID *big.Int
	failedReason     string
}

func (store *memoryStore) ClaimMintJobs(context.Context, string, time.Time, time.Duration, int) ([]domain.MintJob, error) {
	jobs := store.pending
	store.pending = nil
	return jobs, nil
}

func (store *memoryStore) ClaimBroadcastJobs(context.Context, string, time.Time, time.Duration, int) ([]domain.MintJob, error) {
	jobs := store.broadcast
	store.broadcast = nil
	return jobs, nil
}

func (store *memoryStore) MarkBroadcast(_ context.Context, _ string, _ string, txHash string, _ time.Time) error {
	store.broadcastHash = txHash
	return nil
}

func (store *memoryStore) MarkConfirmed(_ context.Context, _ string, _ string, _ string, tokenID *big.Int, _ time.Time) error {
	store.confirmedTokenID = new(big.Int).Set(tokenID)
	return nil
}

func (store *memoryStore) ScheduleRetry(context.Context, string, string, int, time.Time, string, time.Time) error {
	return nil
}

func (store *memoryStore) MarkFailed(_ context.Context, _ string, _ string, reason string, _ time.Time) error {
	store.failedReason = reason
	return nil
}
