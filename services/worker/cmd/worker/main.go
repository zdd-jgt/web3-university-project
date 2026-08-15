package main

import (
	"context"
	"errors"
	"log/slog"
	"math/big"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/yideng/web3-university-worker/internal/chain"
	"github.com/yideng/web3-university-worker/internal/config"
	"github.com/yideng/web3-university-worker/internal/indexer"
	"github.com/yideng/web3-university-worker/internal/storage"
	"github.com/yideng/web3-university-worker/internal/worker"
)

type onceRunner interface {
	RunOnce(context.Context) error
}

type synchronizer interface {
	Sync(context.Context) error
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	if err := run(logger); err != nil {
		logger.Error("worker stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	configuration, err := config.Load()
	if err != nil {
		return err
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	store, err := storage.New(ctx, configuration.DatabaseURL)
	if err != nil {
		return err
	}
	defer store.Close()
	certificateClient, err := chain.NewCertificateClient(ctx, configuration.ChainRPCURL, configuration.CertificateAddress, configuration.WorkerPrivateKey, big.NewInt(configuration.ChainID))
	if err != nil {
		return err
	}
	defer certificateClient.Close()
	purchaseSource, err := indexer.NewEthereumPurchaseSource(certificateClient.RawClient(), configuration.CourseMarketAddress)
	if err != nil {
		return err
	}
	purchaseIndexer, err := indexer.NewPurchaseIndexer(store, purchaseSource, configuration.ChainID, configuration.CourseMarketAddress, configuration.IndexerStartBlock, configuration.Confirmations, configuration.IndexerReorgDepth)
	if err != nil {
		return err
	}
	catalogSource, err := indexer.NewEthereumCatalogSource(certificateClient.RawClient(), configuration.CourseCatalogAddress)
	if err != nil {
		return err
	}
	catalogIndexer, err := indexer.NewCatalogIndexer(store, catalogSource, configuration.ChainID, configuration.CourseCatalogAddress, configuration.IndexerStartBlock, configuration.Confirmations, configuration.IndexerReorgDepth)
	if err != nil {
		return err
	}
	runner, err := worker.NewRunner(store, certificateClient, worker.SystemClock{}, worker.SlogLogger{Logger: logger}, configuration.WorkerID, configuration.Confirmations, configuration.LeaseDuration, configuration.MaxAttempts)
	if err != nil {
		return err
	}
	logger.Info("worker started", "worker_id", configuration.WorkerID, "chain_id", configuration.ChainID, "confirmations", configuration.Confirmations)
	return runLoop(ctx, logger, combinedSynchronizer{catalog: catalogIndexer, purchase: purchaseIndexer}, runner, configuration.PollInterval)
}

type combinedSynchronizer struct{ catalog, purchase synchronizer }

func (syncer combinedSynchronizer) Sync(ctx context.Context) error {
	if err := syncer.catalog.Sync(ctx); err != nil {
		return err
	}
	return syncer.purchase.Sync(ctx)
}

// runLoop makes cancellation deterministic and keeps transient RPC/database
// errors observable without discarding durable jobs or checkpoints.
func runLoop(ctx context.Context, logger *slog.Logger, indexer synchronizer, runner onceRunner, interval time.Duration) error {
	if logger == nil || indexer == nil || runner == nil || interval <= 0 {
		return errors.New("invalid worker loop dependencies")
	}
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-timer.C:
			if err := indexer.Sync(ctx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("purchase indexing cycle failed", "error", err)
			}
			if err := runner.RunOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("certificate worker cycle failed", "error", err)
			}
			timer.Reset(interval)
		}
	}
}
