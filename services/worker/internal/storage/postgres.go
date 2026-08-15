// Package storage owns PostgreSQL state transitions for the Worker. It reads
// the Prisma-owned schema but never creates or migrates it.
package storage

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yideng/web3-university-worker/internal/domain"
	"github.com/yideng/web3-university-worker/internal/storage/sqlc"
	"github.com/yideng/web3-university-worker/internal/worker"
)

const maxStoredErrorLength = 500

// Store is safe for concurrent worker goroutines because pgxpool and the
// database leases provide concurrency control.
type Store struct {
	pool    *pgxpool.Pool
	queries *sqlc.Queries
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	if strings.TrimSpace(databaseURL) == "" {
		return nil, errors.New("database URL is required")
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect PostgreSQL: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping PostgreSQL: %w", err)
	}
	return &Store{pool: pool, queries: sqlc.New(pool)}, nil
}

func (store *Store) Close() { store.pool.Close() }

func (store *Store) ClaimMintJobs(ctx context.Context, workerID string, now time.Time, lease time.Duration, limit int) ([]domain.MintJob, error) {
	if err := validateClaim(workerID, now, lease, limit); err != nil {
		return nil, err
	}
	rows, err := store.queries.ClaimMintJobs(ctx, sqlc.ClaimMintJobsParams{
		NowAt: timestamp(now), JobLimit: int32(limit), WorkerID: text(workerID), LeaseExpiresAt: timestamp(now.Add(lease)),
	})
	if err != nil {
		return nil, fmt.Errorf("claim certificate mint jobs: %w", err)
	}
	return mintJobsFromRows(rows, domain.JobPending)
}

func (store *Store) ClaimBroadcastJobs(ctx context.Context, workerID string, now time.Time, lease time.Duration, limit int) ([]domain.MintJob, error) {
	if err := validateClaim(workerID, now, lease, limit); err != nil {
		return nil, err
	}
	rows, err := store.queries.ClaimBroadcastJobs(ctx, sqlc.ClaimBroadcastJobsParams{
		NowAt: timestamp(now), JobLimit: int32(limit), WorkerID: text(workerID), LeaseExpiresAt: timestamp(now.Add(lease)),
	})
	if err != nil {
		return nil, fmt.Errorf("claim certificate broadcast jobs: %w", err)
	}
	return broadcastJobsFromRows(rows)
}

func (store *Store) MarkBroadcast(ctx context.Context, workerID string, jobID string, txHash string, now time.Time) error {
	if strings.TrimSpace(txHash) == "" {
		return errors.New("transaction hash is required")
	}
	_, err := store.queries.MarkBroadcast(ctx, sqlc.MarkBroadcastParams{
		TxHash: text(txHash), NowAt: timestamp(now), OutboxID: jobID, WorkerID: text(workerID),
	})
	return transitionError("mark certificate broadcast", err)
}

func (store *Store) MarkConfirmed(ctx context.Context, workerID string, jobID string, txHash string, tokenID *big.Int, now time.Time) error {
	if tokenID == nil || tokenID.Sign() <= 0 {
		return errors.New("positive token ID is required")
	}
	_, err := store.queries.MarkConfirmed(ctx, sqlc.MarkConfirmedParams{
		TokenID: text(tokenID.String()), TxHash: txHash, NowAt: timestamp(now), OutboxID: jobID, WorkerID: text(workerID),
	})
	return transitionError("mark certificate confirmed", err)
}

func (store *Store) ScheduleRetry(ctx context.Context, workerID string, jobID string, attempt int, nextAttempt time.Time, reason string, now time.Time) error {
	if attempt < 1 {
		return errors.New("attempt must be positive")
	}
	if !nextAttempt.After(now) {
		return errors.New("next attempt must be after now")
	}
	_, err := store.queries.ScheduleRetry(ctx, sqlc.ScheduleRetryParams{
		NowAt: timestamp(now), AttemptCount: int32(attempt), NextAttemptAt: timestamp(nextAttempt),
		ErrorMessage: text(sanitizeError(reason)), OutboxID: jobID, WorkerID: text(workerID),
	})
	return transitionError("schedule certificate retry", err)
}

func (store *Store) MarkFailed(ctx context.Context, workerID string, jobID string, reason string, now time.Time) error {
	_, err := store.queries.MarkFailed(ctx, sqlc.MarkFailedParams{
		NowAt: timestamp(now), ErrorMessage: text(sanitizeError(reason)), OutboxID: jobID, WorkerID: text(workerID),
	})
	return transitionError("mark certificate failed", err)
}

func validateClaim(workerID string, now time.Time, lease time.Duration, limit int) error {
	if strings.TrimSpace(workerID) == "" {
		return errors.New("worker ID is required")
	}
	if now.IsZero() || lease <= 0 || limit < 1 || limit > 100 {
		return errors.New("invalid claim parameters")
	}
	return nil
}

func transitionError(action string, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("%s: %w", action, worker.ErrLeaseLost)
	}
	if err != nil {
		return fmt.Errorf("%s: %w", action, err)
	}
	return nil
}

func timestamp(value time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: value.UTC(), Valid: true}
}

func text(value string) pgtype.Text { return pgtype.Text{String: value, Valid: true} }

func sanitizeError(reason string) string {
	cleaned := strings.TrimSpace(reason)
	if cleaned == "" {
		return "worker operation failed"
	}
	if len(cleaned) > maxStoredErrorLength {
		return cleaned[:maxStoredErrorLength]
	}
	return cleaned
}

func mintJobsFromRows(rows []sqlc.ClaimMintJobsRow, state domain.JobState) ([]domain.MintJob, error) {
	jobs := make([]domain.MintJob, 0, len(rows))
	for _, row := range rows {
		job, err := mintJob(row.OutboxID, row.CourseID, row.ChainCourseID, row.BuyerAddress, row.TokenUri, state, row.TxHash, row.Attempts, row.AvailableAt, row.LeaseOwner, row.LeaseExpiresAt)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}

func broadcastJobsFromRows(rows []sqlc.ClaimBroadcastJobsRow) ([]domain.MintJob, error) {
	jobs := make([]domain.MintJob, 0, len(rows))
	for _, row := range rows {
		job, err := mintJob(row.OutboxID, row.CourseID, row.ChainCourseID, row.BuyerAddress, row.TokenUri, domain.JobBroadcast, row.TxHash, row.Attempts, row.AvailableAt, row.LeaseOwner, row.LeaseExpiresAt)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(job.TxHash) == "" {
			return nil, fmt.Errorf("broadcast job %s has no transaction hash", job.ID)
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}

func mintJob(id, courseID string, chainCourseID pgtype.Text, buyer string, tokenURIValue any, state domain.JobState, txHash pgtype.Text, attempts int32, availableAt pgtype.Timestamp, leaseOwner pgtype.Text, leaseExpiresAt pgtype.Timestamp) (domain.MintJob, error) {
	if !chainCourseID.Valid || strings.TrimSpace(chainCourseID.String) == "" {
		return domain.MintJob{}, fmt.Errorf("job %s has no chain course ID", id)
	}
	chainID, ok := new(big.Int).SetString(chainCourseID.String, 10)
	if !ok || chainID.Sign() <= 0 {
		return domain.MintJob{}, fmt.Errorf("job %s has invalid chain course ID", id)
	}
	tokenURI, ok := tokenURIValue.(string)
	if !ok || strings.TrimSpace(tokenURI) == "" {
		return domain.MintJob{}, fmt.Errorf("job %s has no token URI", id)
	}
	job := domain.MintJob{
		ID: id, CourseID: courseID, ChainCourseID: chainID, BuyerAddress: strings.ToLower(strings.TrimSpace(buyer)),
		TokenURI: tokenURI, State: state, Attempts: int(attempts),
	}
	if txHash.Valid {
		job.TxHash = txHash.String
	}
	if availableAt.Valid {
		job.NextAttemptAt = availableAt.Time.UTC()
	}
	if leaseOwner.Valid {
		job.LeaseOwner = leaseOwner.String
	}
	if leaseExpiresAt.Valid {
		job.LeaseExpires = leaseExpiresAt.Time.UTC()
	}
	if err := job.Validate(); err != nil {
		return domain.MintJob{}, fmt.Errorf("database job %s violates worker contract: %w", id, err)
	}
	return job, nil
}

// Checkpoint identifies the next block to scan for one event stream.
type Checkpoint struct {
	NextBlock uint64
	BlockHash string
	Exists    bool
}

// PurchaseObservation is decoded from the CourseMarket event before it crosses
// into PostgreSQL. Values are normalized to lower-case hexadecimal strings.
type PurchaseObservation struct {
	TxHash        string
	LogIndex      uint
	BlockNumber   uint64
	BlockHash     string
	BuyerWallet   string
	ChainCourseID *big.Int
}

type PurchaseStream struct {
	ChainID         int64
	ContractAddress string
	Name            string
}

func (stream PurchaseStream) Validate() error {
	if stream.ChainID <= 0 || stream.ChainID > int64(^uint32(0)>>1) {
		return errors.New("chain ID must fit PostgreSQL integer")
	}
	if strings.TrimSpace(stream.ContractAddress) == "" || strings.TrimSpace(stream.Name) == "" {
		return errors.New("contract address and stream name are required")
	}
	return nil
}

func (store *Store) LoadCheckpoint(ctx context.Context, stream PurchaseStream) (Checkpoint, error) {
	if err := stream.Validate(); err != nil {
		return Checkpoint{}, err
	}
	checkpoint, err := store.queries.GetCheckpoint(ctx, sqlc.GetCheckpointParams{
		ChainID: int32(stream.ChainID), ContractAddress: strings.ToLower(stream.ContractAddress), StreamName: stream.Name,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Checkpoint{}, nil
	}
	if err != nil {
		return Checkpoint{}, fmt.Errorf("load chain checkpoint: %w", err)
	}
	if checkpoint.NextBlock < 0 {
		return Checkpoint{}, errors.New("checkpoint next block is negative")
	}
	result := Checkpoint{NextBlock: uint64(checkpoint.NextBlock), Exists: true}
	if checkpoint.BlockHash.Valid {
		result.BlockHash = strings.ToLower(checkpoint.BlockHash.String)
	}
	return result, nil
}

// ApplyPurchaseRange is one database transaction: records in the overlap are
// first revoked, then canonical logs rebuild their entitlement and checkpoint.
// A crash leaves either the old canonical range or the complete new range.
func (store *Store) ApplyPurchaseRange(ctx context.Context, stream PurchaseStream, rewindFrom uint64, observations []PurchaseObservation, nextBlock uint64, checkpointHash string, now time.Time) error {
	if err := stream.Validate(); err != nil {
		return err
	}
	if nextBlock == 0 || rewindFrom >= nextBlock || strings.TrimSpace(checkpointHash) == "" || now.IsZero() {
		return errors.New("invalid purchase range")
	}
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin purchase range transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := store.queries.WithTx(tx)
	if err := queries.RevokeCanonicalPurchasesFrom(ctx, sqlc.RevokeCanonicalPurchasesFromParams{
		NowAt: timestamp(now), ChainID: int32(stream.ChainID), RewindFrom: int64(rewindFrom),
	}); err != nil {
		return fmt.Errorf("revoke reorg overlap: %w", err)
	}
	for _, observation := range observations {
		if err := validateObservation(observation, rewindFrom, nextBlock); err != nil {
			return err
		}
		eventID, err := queries.UpsertPurchaseEvent(ctx, sqlc.UpsertPurchaseEventParams{
			EventID: uuid.NewString(), ChainID: int32(stream.ChainID), TxHash: strings.ToLower(observation.TxHash), LogIndex: int32(observation.LogIndex),
			BlockNumber: int64(observation.BlockNumber), BlockHash: strings.ToLower(observation.BlockHash), BuyerWallet: strings.ToLower(observation.BuyerWallet),
			ChainCourseID: observation.ChainCourseID.String(), ObservedAt: timestamp(now),
		})
		if err != nil {
			return fmt.Errorf("upsert purchase event: %w", err)
		}
		if err := queries.UpsertEntitlementProjection(ctx, sqlc.UpsertEntitlementProjectionParams{
			ProjectionID: uuid.NewString(), ChainID: int32(stream.ChainID), BuyerWallet: strings.ToLower(observation.BuyerWallet),
			ChainCourseID: observation.ChainCourseID.String(), SourceEventID: eventID, GrantedAt: timestamp(now),
		}); err != nil {
			return fmt.Errorf("upsert entitlement projection: %w", err)
		}
	}
	if err := queries.UpsertCheckpoint(ctx, sqlc.UpsertCheckpointParams{
		CheckpointID: uuid.NewString(), ChainID: int32(stream.ChainID), ContractAddress: strings.ToLower(stream.ContractAddress), StreamName: stream.Name,
		NextBlock: int64(nextBlock), BlockHash: text(strings.ToLower(checkpointHash)), NowAt: timestamp(now),
	}); err != nil {
		return fmt.Errorf("upsert chain checkpoint: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit purchase range: %w", err)
	}
	return nil
}

func validateObservation(observation PurchaseObservation, rewindFrom, nextBlock uint64) error {
	if observation.ChainCourseID == nil || observation.ChainCourseID.Sign() <= 0 || observation.BlockNumber < rewindFrom || observation.BlockNumber >= nextBlock {
		return errors.New("invalid purchase observation range")
	}
	if observation.LogIndex > uint(^uint32(0)>>1) || !common.IsHexHash(observation.TxHash) || !common.IsHexHash(observation.BlockHash) || !common.IsHexAddress(observation.BuyerWallet) || common.HexToAddress(observation.BuyerWallet) == (common.Address{}) {
		return errors.New("invalid purchase observation")
	}
	return nil
}

// CatalogConfigured is a confirmed onchain CourseConfigured observation. The
// metadata hash doubles as the approved submission hash; no browser-provided
// course identifier is trusted for this binding.
type CatalogConfigured struct {
	ChainCourseID *big.Int
	PriceYD       *big.Int
	PayoutWallet  string
	MetadataHash  string
}

func (store *Store) PublishApprovedCatalogCourse(ctx context.Context, stream PurchaseStream, event CatalogConfigured, now time.Time) (bool, error) {
	if err := stream.Validate(); err != nil {
		return false, err
	}
	if event.ChainCourseID == nil || event.ChainCourseID.Sign() <= 0 || event.PriceYD == nil || event.PriceYD.Sign() <= 0 || !common.IsHexAddress(event.PayoutWallet) || common.HexToAddress(event.PayoutWallet) == (common.Address{}) || !common.IsHexHash(event.MetadataHash) || now.IsZero() {
		return false, errors.New("invalid catalog configured event")
	}
	courseID, err := store.queries.FindApprovedCourseBySubmissionHash(ctx, text(strings.ToLower(event.MetadataHash)))
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("find approved submission hash: %w", err)
	}
	if expected := new(big.Int).SetBytes(crypto.Keccak256([]byte("web3-university:" + courseID))); expected.Cmp(event.ChainCourseID) != 0 {
		return false, nil
	}
	_, err = store.queries.PublishApprovedCourseFromCatalog(ctx, sqlc.PublishApprovedCourseFromCatalogParams{
		ChainID: pgtype.Int4{Int32: int32(stream.ChainID), Valid: true}, CatalogAddress: text(strings.ToLower(stream.ContractAddress)),
		ChainCourseID: text(event.ChainCourseID.String()), PriceYd: pgtype.Numeric{Int: new(big.Int).Set(event.PriceYD), Exp: 0, Valid: true},
		PayoutWallet: text(strings.ToLower(event.PayoutWallet)), MetadataHash: text(strings.ToLower(event.MetadataHash)), NowAt: timestamp(now), CourseID: courseID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("publish approved catalog course: %w", err)
	}
	return true, nil
}

func (store *Store) ProjectCatalogCourseStatus(ctx context.Context, stream PurchaseStream, chainCourseID *big.Int, published bool, now time.Time) (bool, error) {
	if err := stream.Validate(); err != nil {
		return false, err
	}
	if chainCourseID == nil || chainCourseID.Sign() <= 0 || now.IsZero() {
		return false, errors.New("invalid catalog status event")
	}
	status := sqlc.CourseStatusARCHIVED
	if published {
		status = sqlc.CourseStatusPUBLISHED
	}
	_, err := store.queries.ProjectCatalogStatus(ctx, sqlc.ProjectCatalogStatusParams{
		CourseStatus: status, NowAt: timestamp(now), ChainID: pgtype.Int4{Int32: int32(stream.ChainID), Valid: true}, CatalogAddress: text(strings.ToLower(stream.ContractAddress)), ChainCourseID: text(chainCourseID.String()),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("project catalog status: %w", err)
	}
	return true, nil
}

func (store *Store) SaveCheckpoint(ctx context.Context, stream PurchaseStream, nextBlock uint64, blockHash string, now time.Time) error {
	if err := stream.Validate(); err != nil {
		return err
	}
	if nextBlock == 0 || !common.IsHexHash(blockHash) || now.IsZero() {
		return errors.New("invalid chain checkpoint")
	}
	return store.queries.UpsertCheckpoint(ctx, sqlc.UpsertCheckpointParams{
		CheckpointID: uuid.NewString(), ChainID: int32(stream.ChainID), ContractAddress: strings.ToLower(stream.ContractAddress), StreamName: stream.Name,
		NextBlock: int64(nextBlock), BlockHash: text(strings.ToLower(blockHash)), NowAt: timestamp(now),
	})
}
