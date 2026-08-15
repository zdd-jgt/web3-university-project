package worker

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/yideng/web3-university-worker/internal/domain"
)

type Runner struct {
	store         JobStore
	chain         CertificateChain
	clock         Clock
	logger        Logger
	workerID      string
	confirmations uint64
	leaseDuration time.Duration
	maxAttempts   int
}

func NewRunner(
	store JobStore,
	chain CertificateChain,
	clock Clock,
	logger Logger,
	workerID string,
	confirmations uint64,
	leaseDuration time.Duration,
	maxAttempts int,
) (*Runner, error) {
	if store == nil || chain == nil || clock == nil || logger == nil {
		return nil, errors.New("runner dependencies are required")
	}
	if workerID == "" {
		return nil, errors.New("worker id is required")
	}
	if confirmations == 0 || maxAttempts < 1 || leaseDuration <= 0 {
		return nil, errors.New("runner limits are invalid")
	}
	return &Runner{
		store:         store,
		chain:         chain,
		clock:         clock,
		logger:        logger,
		workerID:      workerID,
		confirmations: confirmations,
		leaseDuration: leaseDuration,
		maxAttempts:   maxAttempts,
	}, nil
}

func (runner *Runner) RunOnce(ctx context.Context) error {
	now := runner.clock.Now()
	if err := runner.confirmBroadcasts(ctx, now); err != nil {
		return fmt.Errorf("confirm broadcasts: %w", err)
	}
	if err := runner.processPending(ctx, now); err != nil {
		return fmt.Errorf("process pending: %w", err)
	}
	return nil
}

func (runner *Runner) processPending(ctx context.Context, now time.Time) error {
	jobs, err := runner.store.ClaimMintJobs(ctx, runner.workerID, now, runner.leaseDuration, 1)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if err := runner.processJob(ctx, job, now); err != nil {
			if errors.Is(err, ErrLeaseLost) {
				runner.logger.Info("certificate job lease lost before state update", "job_id", job.ID)
				continue
			}
			runner.logger.Error("certificate job failed", "job_id", job.ID, "error", err)
			if retryErr := runner.retryOrFail(ctx, job, now, err); retryErr != nil {
				if errors.Is(retryErr, ErrLeaseLost) {
					runner.logger.Info("certificate job lease lost while scheduling retry", "job_id", job.ID)
					continue
				}
				return errors.Join(err, retryErr)
			}
		}
	}
	return nil
}

func (runner *Runner) processJob(ctx context.Context, job domain.MintJob, now time.Time) error {
	if err := job.Validate(); err != nil {
		return fmt.Errorf("invalid job: %w", err)
	}
	existingTokenID, err := runner.chain.CertificateOf(ctx, job.BuyerAddress, job.ChainCourseID, runner.confirmations)
	if err != nil {
		return fmt.Errorf("check existing certificate: %w", err)
	}
	if existingTokenID.Sign() > 0 {
		if err := runner.store.MarkConfirmed(ctx, runner.workerID, job.ID, job.TxHash, existingTokenID, now); err != nil {
			return fmt.Errorf("record existing certificate: %w", err)
		}
		runner.logger.Info("existing certificate reconciled", "job_id", job.ID, "token_id", existingTokenID.String())
		return nil
	}

	txHash, err := runner.chain.MintCertificate(ctx, job.BuyerAddress, job.ChainCourseID, job.TokenURI)
	if err != nil {
		return fmt.Errorf("broadcast mint transaction: %w", err)
	}
	if err := runner.store.MarkBroadcast(ctx, runner.workerID, job.ID, txHash, now); err != nil {
		return fmt.Errorf("record broadcast transaction: %w", err)
	}
	runner.logger.Info("certificate transaction broadcast", "job_id", job.ID, "tx_hash", txHash)
	return nil
}

func (runner *Runner) confirmBroadcasts(ctx context.Context, now time.Time) error {
	jobs, err := runner.store.ClaimBroadcastJobs(ctx, runner.workerID, now, runner.leaseDuration, 10)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		receipt, receiptErr := runner.chain.Receipt(ctx, job.TxHash, runner.confirmations)
		if receiptErr != nil {
			runner.logger.Error("receipt lookup failed", "job_id", job.ID, "error", receiptErr)
			continue
		}
		if !receipt.Found || !receipt.Confirmed {
			continue
		}
		if !receipt.Succeeded {
			if retryErr := runner.retryOrFail(ctx, job, now, errors.New("mint transaction reverted")); retryErr != nil {
				return retryErr
			}
			continue
		}
		tokenID, tokenErr := runner.chain.CertificateOf(ctx, job.BuyerAddress, job.ChainCourseID, runner.confirmations)
		if tokenErr != nil {
			return fmt.Errorf("read confirmed certificate: %w", tokenErr)
		}
		if tokenID.Sign() <= 0 {
			return errors.New("successful mint receipt did not create certificate")
		}
		if markErr := runner.store.MarkConfirmed(ctx, runner.workerID, job.ID, job.TxHash, tokenID, now); markErr != nil {
			if errors.Is(markErr, ErrLeaseLost) {
				runner.logger.Info("certificate job lease lost before confirmation", "job_id", job.ID)
				continue
			}
			return markErr
		}
		runner.logger.Info("certificate confirmed", "job_id", job.ID, "token_id", tokenID.String())
	}
	return nil
}

func (runner *Runner) retryOrFail(ctx context.Context, job domain.MintJob, now time.Time, cause error) error {
	nextAttempt := job.Attempts + 1
	if nextAttempt >= runner.maxAttempts {
		return runner.store.MarkFailed(ctx, runner.workerID, job.ID, cause.Error(), now)
	}
	delay := retryDelay(nextAttempt)
	return runner.store.ScheduleRetry(ctx, runner.workerID, job.ID, nextAttempt, now.Add(delay), cause.Error(), now)
}

func retryDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if attempt > 8 {
		attempt = 8
	}
	return time.Duration(1<<(attempt-1)) * time.Second
}
