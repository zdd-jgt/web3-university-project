package storage

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"os"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/jackc/pgx/v5"
	"github.com/yideng/web3-university-worker/internal/worker"
)

// This test is intentionally opt-in: the Worker never creates migrations, so
// the caller must provide a PostgreSQL database already initialized by the API
// migration owner. The local verification command supplies an ephemeral DB.
func TestStoreClaimsAndFinalizesCertificateJob(t *testing.T) {
	databaseURL := os.Getenv("WORKER_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("WORKER_TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	store, err := New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	now := time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)
	ids := testIDs()
	seedCertificateJob(t, ctx, store, ids, now)
	defer cleanupCertificateJob(t, context.Background(), store, ids)

	jobs, err := store.ClaimMintJobs(ctx, "worker-a", now, 30*time.Second, 1)
	if err != nil {
		t.Fatalf("ClaimMintJobs() error = %v", err)
	}
	if len(jobs) != 1 || jobs[0].ID != ids.outbox || jobs[0].ChainCourseID.Cmp(big.NewInt(7)) != 0 {
		t.Fatalf("claimed jobs = %#v", jobs)
	}
	if err := store.MarkBroadcast(ctx, "worker-b", ids.outbox, "0xabc", now); !errors.Is(err, worker.ErrLeaseLost) {
		t.Fatalf("MarkBroadcast() wrong worker error = %v, want ErrLeaseLost", err)
	}
	if err := store.MarkBroadcast(ctx, "worker-a", ids.outbox, "0xabc", now); err != nil {
		t.Fatalf("MarkBroadcast() error = %v", err)
	}

	retryAt := now.Add(time.Second)
	if err := store.ScheduleRetry(ctx, "worker-a", ids.outbox, 1, retryAt.Add(time.Second), "mint transaction reverted", retryAt); err != nil {
		t.Fatalf("ScheduleRetry() error = %v", err)
	}
	retried, err := store.ClaimMintJobs(ctx, "worker-b", retryAt.Add(time.Second), 30*time.Second, 1)
	if err != nil {
		t.Fatalf("ClaimMintJobs() after revert error = %v", err)
	}
	if len(retried) != 1 || retried[0].TxHash != "" || retried[0].Attempts != 1 {
		t.Fatalf("retried job = %#v, want cleared hash and attempt 1", retried)
	}
	if err := store.MarkBroadcast(ctx, "worker-b", ids.outbox, "0xdef", retryAt.Add(time.Second)); err != nil {
		t.Fatalf("MarkBroadcast() replacement error = %v", err)
	}

	confirmedAt := retryAt.Add(32 * time.Second)
	broadcasts, err := store.ClaimBroadcastJobs(ctx, "worker-c", confirmedAt, 30*time.Second, 1)
	if err != nil {
		t.Fatalf("ClaimBroadcastJobs() error = %v", err)
	}
	if len(broadcasts) != 1 || broadcasts[0].TxHash != "0xdef" {
		t.Fatalf("replacement broadcast jobs = %#v", broadcasts)
	}
	if err := store.MarkConfirmed(ctx, "worker-c", ids.outbox, "0xdef", big.NewInt(99), confirmedAt); err != nil {
		t.Fatalf("MarkConfirmed() error = %v", err)
	}

	var outboxStatus, completionStatus, tokenID, txHash string
	err = store.pool.QueryRow(ctx, `
SELECT outbox.status::text, completion.status::text, completion."tokenId", completion."txHash"
FROM "OutboxEvent" AS outbox
JOIN "CourseCompletion" AS completion ON completion.id = outbox."completionId"
WHERE outbox.id = $1`, ids.outbox).Scan(&outboxStatus, &completionStatus, &tokenID, &txHash)
	if err != nil {
		t.Fatalf("read final states: %v", err)
	}
	if outboxStatus != "DELIVERED" || completionStatus != "MINTED" || tokenID != "99" || txHash != "0xdef" {
		t.Fatalf("final state = outbox=%s completion=%s token=%s tx=%s", outboxStatus, completionStatus, tokenID, txHash)
	}
}

func TestCatalogProjectionRequiresApprovedHashAndDeterministicCourseID(t *testing.T) {
	databaseURL := os.Getenv("WORKER_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("WORKER_TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	store, err := New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	now := time.Now().UTC()
	stamp := now.Format("20060102150405.000000000")
	userID, courseID := "catalog-user-"+stamp, "catalog-course-"+stamp
	metadataHash := "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	catalogAddress := "0x2222222222222222222222222222222222222222"
	payout := "0x3333333333333333333333333333333333333333"
	if _, err := store.pool.Exec(ctx, `INSERT INTO "User" (id, "privySubject", role, "createdAt", "updatedAt") VALUES ($1, $2, 'TEACHER', $3, $3)`, userID, "did:test:"+userID, now); err != nil {
		t.Fatalf("seed catalog user: %v", err)
	}
	defer func() {
		_, _ = store.pool.Exec(context.Background(), `DELETE FROM "Course" WHERE id = $1`, courseID)
		_, _ = store.pool.Exec(context.Background(), `DELETE FROM "User" WHERE id = $1`, userID)
	}()
	if _, err := store.pool.Exec(ctx, `INSERT INTO "Course" (id, "teacherId", title, description, status, "requestedPriceYD", "requestedPayoutWallet", "submissionHash", "certificateMetadataUri", "createdAt", "updatedAt") VALUES ($1, $2, 'Catalog course', 'Catalog description', 'APPROVED', 4000000000000000000, $3, $4, 'ipfs://certificate/catalog', $5, $5)`, courseID, userID, payout, metadataHash, now); err != nil {
		t.Fatalf("seed approved course: %v", err)
	}

	chainCourseID := new(big.Int).SetBytes(crypto.Keccak256([]byte("web3-university:" + courseID)))
	stream := PurchaseStream{ChainID: 31337, ContractAddress: catalogAddress, Name: "course-catalog/v1"}
	for name, mismatch := range map[string]CatalogConfigured{
		"price": {
			ChainCourseID: chainCourseID,
			PriceYD:       big.NewInt(5_000_000_000_000_000_000),
			PayoutWallet:  payout,
			MetadataHash:  metadataHash,
		},
		"payout": {
			ChainCourseID: chainCourseID,
			PriceYD:       big.NewInt(4_000_000_000_000_000_000),
			PayoutWallet:  "0x4444444444444444444444444444444444444444",
			MetadataHash:  metadataHash,
		},
	} {
		matched, err := store.PublishApprovedCatalogCourse(ctx, stream, mismatch, now)
		if err != nil || matched {
			t.Fatalf("%s mismatch matched=%v error=%v, want safe no-op", name, matched, err)
		}
		var status string
		if err := store.pool.QueryRow(ctx, `SELECT status::text FROM "Course" WHERE id = $1`, courseID).Scan(&status); err != nil {
			t.Fatalf("read course after %s mismatch: %v", name, err)
		}
		if status != "APPROVED" {
			t.Fatalf("course status after %s mismatch = %s, want APPROVED", name, status)
		}
	}
	matched, err := store.PublishApprovedCatalogCourse(ctx, stream, CatalogConfigured{
		ChainCourseID: chainCourseID,
		PriceYD:       big.NewInt(4_000_000_000_000_000_000),
		PayoutWallet:  payout,
		MetadataHash:  metadataHash,
	}, now)
	if err != nil || !matched {
		t.Fatalf("PublishApprovedCatalogCourse() matched=%v error=%v", matched, err)
	}
	var status, observedCourseID, observedHash string
	if err := store.pool.QueryRow(ctx, `SELECT status::text, "chainCourseId", "metadataHash" FROM "Course" WHERE id = $1`, courseID).Scan(&status, &observedCourseID, &observedHash); err != nil {
		t.Fatalf("read published course: %v", err)
	}
	if status != "PUBLISHED" || observedCourseID != chainCourseID.String() || observedHash != metadataHash {
		t.Fatalf("published projection status=%s course=%s hash=%s", status, observedCourseID, observedHash)
	}
}

type certificateTestIDs struct{ user, wallet, course, completion, outbox, walletAddress string }

func testIDs() certificateTestIDs {
	stamp := time.Now().UTC().Format("20060102150405.000000000")
	return certificateTestIDs{user: "test-user-" + stamp, wallet: "test-wallet-" + stamp, course: "test-course-" + stamp, completion: "test-completion-" + stamp, outbox: "test-outbox-" + stamp, walletAddress: fmt.Sprintf("0x%040x", time.Now().UTC().UnixNano())}
}

func seedCertificateJob(t *testing.T, ctx context.Context, store *Store, ids certificateTestIDs, now time.Time) {
	t.Helper()
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin seed transaction: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO "User" (id, "privySubject", role, "createdAt", "updatedAt") VALUES ($1, $2, 'STUDENT', $3, $3)`, []any{ids.user, "did:test:" + ids.user, now}},
		{`INSERT INTO "Wallet" (id, "userId", address, "chainId", "verifiedAt", "isPrimary") VALUES ($1, $2, $3, 31337, $4, true)`, []any{ids.wallet, ids.user, ids.walletAddress, now}},
		{`INSERT INTO "Course" (id, "teacherId", "chainId", "catalogAddress", "chainCourseId", "priceYD", "payoutWallet", title, description, status, "createdAt", "updatedAt") VALUES ($1, $2, 31337, $3, '7', 4, $4, 'Test course', 'Test description', 'PUBLISHED', $5, $5)`, []any{ids.course, ids.user, "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333", now}},
		{`INSERT INTO "CourseCompletion" (id, "courseId", "userId", "buyerWalletId", status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, 'PENDING', $5, $5)`, []any{ids.completion, ids.course, ids.user, ids.wallet, now}},
		{`INSERT INTO "OutboxEvent" (id, topic, "dedupeKey", payload, status, attempts, "availableAt", "completionId", "createdAt", "updatedAt") VALUES ($1, 'certificate.mint', $2, '{"tokenUri":"ipfs://certificate/test"}', 'PENDING', 0, $3, $4, $3, $3)`, []any{ids.outbox, "dedupe-" + ids.outbox, now, ids.completion}},
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("seed test data: %v", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit seed transaction: %v", err)
	}
}

func cleanupCertificateJob(t *testing.T, ctx context.Context, store *Store, ids certificateTestIDs) {
	t.Helper()
	queries := []struct {
		query string
		arg   string
	}{
		{`DELETE FROM "OutboxEvent" WHERE id = $1`, ids.outbox},
		{`DELETE FROM "CourseCompletion" WHERE id = $1`, ids.completion},
		{`DELETE FROM "Course" WHERE id = $1`, ids.course},
		{`DELETE FROM "User" WHERE id = $1`, ids.user},
	}
	for _, query := range queries {
		if _, err := store.pool.Exec(ctx, query.query, query.arg); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("cleanup query failed: %v", err)
		}
	}
}
