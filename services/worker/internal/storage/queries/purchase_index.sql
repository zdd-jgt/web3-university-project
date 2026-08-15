-- name: GetCheckpoint :one
SELECT "nextBlock", "blockHash"
FROM "ChainCheckpoint"
WHERE "chainId" = sqlc.arg(chain_id)
  AND "contractAddress" = sqlc.arg(contract_address)
  AND stream = sqlc.arg(stream_name);

-- name: RevokeCanonicalPurchasesFrom :exec
WITH reverted AS (
  UPDATE "PurchaseEvent" AS purchase
  SET canonical = false
  WHERE purchase."chainId" = sqlc.arg(chain_id)
    AND purchase.canonical = true
    AND purchase."blockNumber" >= sqlc.arg(rewind_from)
  RETURNING purchase.id
)
UPDATE "EntitlementProjection"
SET "revokedAt" = sqlc.arg(now_at)
WHERE "sourceEventId" IN (SELECT id FROM reverted)
  AND "revokedAt" IS NULL;

-- name: UpsertPurchaseEvent :one
INSERT INTO "PurchaseEvent" (
  id, "chainId", "txHash", "logIndex", "blockNumber", "blockHash",
  canonical, "buyerWallet", "chainCourseId", "observedAt"
) VALUES (
  sqlc.arg(event_id), sqlc.arg(chain_id), sqlc.arg(tx_hash), sqlc.arg(log_index),
  sqlc.arg(block_number), sqlc.arg(block_hash), true, sqlc.arg(buyer_wallet),
  sqlc.arg(chain_course_id), sqlc.arg(observed_at)
)
ON CONFLICT ("chainId", "txHash", "logIndex") DO UPDATE
SET "blockNumber" = EXCLUDED."blockNumber",
    "blockHash" = EXCLUDED."blockHash",
    canonical = true,
    "buyerWallet" = EXCLUDED."buyerWallet",
    "chainCourseId" = EXCLUDED."chainCourseId",
    "observedAt" = EXCLUDED."observedAt"
RETURNING id;

-- name: UpsertEntitlementProjection :exec
INSERT INTO "EntitlementProjection" (
  id, "chainId", "buyerWallet", "chainCourseId", "sourceEventId", "grantedAt", "revokedAt"
) VALUES (
  sqlc.arg(projection_id), sqlc.arg(chain_id), sqlc.arg(buyer_wallet), sqlc.arg(chain_course_id),
  sqlc.arg(source_event_id), sqlc.arg(granted_at), NULL
)
ON CONFLICT ("chainId", "buyerWallet", "chainCourseId") DO UPDATE
SET "sourceEventId" = EXCLUDED."sourceEventId", "grantedAt" = EXCLUDED."grantedAt", "revokedAt" = NULL;

-- name: UpsertCheckpoint :exec
INSERT INTO "ChainCheckpoint" (
  id, "chainId", "contractAddress", stream, "nextBlock", "blockHash", "updatedAt"
) VALUES (
  sqlc.arg(checkpoint_id), sqlc.arg(chain_id), sqlc.arg(contract_address), sqlc.arg(stream_name),
  sqlc.arg(next_block), sqlc.arg(block_hash), sqlc.arg(now_at)
)
ON CONFLICT ("chainId", "contractAddress", stream) DO UPDATE
SET "nextBlock" = EXCLUDED."nextBlock",
    "blockHash" = EXCLUDED."blockHash",
    "updatedAt" = EXCLUDED."updatedAt";

-- name: FindApprovedCourseBySubmissionHash :one
SELECT id FROM "Course"
WHERE status = 'APPROVED' AND "submissionHash" = sqlc.arg(submission_hash);

-- name: PublishApprovedCourseFromCatalog :one
UPDATE "Course"
SET "chainId" = sqlc.arg(chain_id),
    "catalogAddress" = sqlc.arg(catalog_address),
    "chainCourseId" = sqlc.arg(chain_course_id),
    "priceYD" = sqlc.arg(price_yd),
    "payoutWallet" = sqlc.arg(payout_wallet),
    "metadataHash" = sqlc.arg(metadata_hash),
    status = 'PUBLISHED',
    "updatedAt" = sqlc.arg(now_at)
WHERE id = sqlc.arg(course_id)
  AND status = 'APPROVED'
  AND "submissionHash" = sqlc.arg(metadata_hash)
  AND "requestedPriceYD" = sqlc.arg(price_yd)
  AND LOWER("requestedPayoutWallet") = sqlc.arg(payout_wallet)
RETURNING id;

-- name: ProjectCatalogStatus :one
UPDATE "Course"
SET status = sqlc.arg(course_status)::"CourseStatus", "updatedAt" = sqlc.arg(now_at)
WHERE "chainId" = sqlc.arg(chain_id)
  AND "catalogAddress" = sqlc.arg(catalog_address)
  AND "chainCourseId" = sqlc.arg(chain_course_id)
  AND status IN ('PUBLISHED', 'ARCHIVED')
RETURNING id;
