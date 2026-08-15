package worker

import (
	"context"
	"errors"
	"math/big"
	"time"

	"github.com/yideng/web3-university-worker/internal/domain"
)

// ErrLeaseLost means a different worker now owns the durable job. Callers must
// not make a second state transition after this error.
var ErrLeaseLost = errors.New("certificate job lease lost")

type JobStore interface {
	ClaimMintJobs(ctx context.Context, workerID string, now time.Time, lease time.Duration, limit int) ([]domain.MintJob, error)
	ClaimBroadcastJobs(ctx context.Context, workerID string, now time.Time, lease time.Duration, limit int) ([]domain.MintJob, error)
	MarkBroadcast(ctx context.Context, workerID string, jobID string, txHash string, now time.Time) error
	MarkConfirmed(ctx context.Context, workerID string, jobID string, txHash string, tokenID *big.Int, now time.Time) error
	ScheduleRetry(ctx context.Context, workerID string, jobID string, attempt int, nextAttempt time.Time, reason string, now time.Time) error
	MarkFailed(ctx context.Context, workerID string, jobID string, reason string, now time.Time) error
}

type CertificateChain interface {
	CertificateOf(ctx context.Context, buyer string, courseID *big.Int, confirmations uint64) (*big.Int, error)
	MintCertificate(ctx context.Context, buyer string, courseID *big.Int, tokenURI string) (string, error)
	Receipt(ctx context.Context, txHash string, confirmations uint64) (Receipt, error)
}

type Receipt struct {
	Found       bool
	Confirmed   bool
	Succeeded   bool
	BlockNumber uint64
}

type Clock interface {
	Now() time.Time
}

type Logger interface {
	Info(message string, attributes ...any)
	Error(message string, attributes ...any)
}
