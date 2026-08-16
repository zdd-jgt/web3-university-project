-- name: ClaimMintJobs :many
WITH candidates AS (
  SELECT o.id
  FROM "OutboxEvent" AS o
  JOIN "CourseCompletion" AS completion ON completion.id = o."completionId"
  JOIN "Course" AS course ON course.id = completion."courseId"
  WHERE o.topic = 'certificate.mint'
    AND course."chainCourseId" IS NOT NULL
    AND completion.status = 'PENDING'
    AND (
      (o.status = 'PENDING' AND o."availableAt" <= sqlc.arg(now_at))
      OR (o.status = 'PROCESSING' AND o."leaseExpiresAt" <= sqlc.arg(now_at))
    )
  ORDER BY o."availableAt", o."createdAt"
  FOR UPDATE OF o SKIP LOCKED
  LIMIT sqlc.arg(job_limit)
), claimed AS (
  UPDATE "OutboxEvent" AS o
  SET status = 'PROCESSING',
      "leaseOwner" = sqlc.arg(worker_id),
      "leaseExpiresAt" = sqlc.arg(lease_expires_at),
      "updatedAt" = sqlc.arg(now_at)
  FROM candidates
  WHERE o.id = candidates.id
  RETURNING o.id, o."completionId", o.payload, o.status, o.attempts,
            o."availableAt", o."leaseOwner", o."leaseExpiresAt"
)
SELECT claimed.id AS outbox_id,
       completion."courseId" AS course_id,
       course."chainCourseId" AS chain_course_id,
       wallet.address AS buyer_address,
       claimed.payload ->> 'tokenUri' AS token_uri,
       claimed.status::text AS outbox_status,
       claimed.attempts,
       claimed."availableAt" AS available_at,
       claimed."leaseOwner" AS lease_owner,
       claimed."leaseExpiresAt" AS lease_expires_at,
       completion."txHash" AS tx_hash
FROM claimed
JOIN "CourseCompletion" AS completion ON completion.id = claimed."completionId"
JOIN "Course" AS course ON course.id = completion."courseId"
JOIN "Wallet" AS wallet ON wallet.id = completion."buyerWalletId";

-- name: ClaimBroadcastJobs :many
WITH candidates AS (
  SELECT o.id
  FROM "OutboxEvent" AS o
  JOIN "CourseCompletion" AS completion ON completion.id = o."completionId"
  JOIN "Course" AS course ON course.id = completion."courseId"
  WHERE o.topic = 'certificate.mint'
    AND o.status = 'PROCESSING'
    AND completion.status = 'MINTING'
    AND completion."txHash" IS NOT NULL
    AND course."chainCourseId" IS NOT NULL
    AND (
      o."leaseExpiresAt" IS NULL
      OR o."leaseExpiresAt" <= sqlc.arg(now_at)
      OR o."leaseOwner" = sqlc.arg(worker_id)
    )
  ORDER BY o."updatedAt"
  FOR UPDATE OF o SKIP LOCKED
  LIMIT sqlc.arg(job_limit)
), claimed AS (
  UPDATE "OutboxEvent" AS o
  SET "leaseOwner" = sqlc.arg(worker_id),
      "leaseExpiresAt" = sqlc.arg(lease_expires_at),
      "updatedAt" = sqlc.arg(now_at)
  FROM candidates
  WHERE o.id = candidates.id
  RETURNING o.id, o."completionId", o.payload, o.status, o.attempts,
            o."availableAt", o."leaseOwner", o."leaseExpiresAt"
)
SELECT claimed.id AS outbox_id,
       completion."courseId" AS course_id,
       course."chainCourseId" AS chain_course_id,
       wallet.address AS buyer_address,
       claimed.payload ->> 'tokenUri' AS token_uri,
       claimed.status::text AS outbox_status,
       claimed.attempts,
       claimed."availableAt" AS available_at,
       claimed."leaseOwner" AS lease_owner,
       claimed."leaseExpiresAt" AS lease_expires_at,
       completion."txHash" AS tx_hash
FROM claimed
JOIN "CourseCompletion" AS completion ON completion.id = claimed."completionId"
JOIN "Course" AS course ON course.id = completion."courseId"
JOIN "Wallet" AS wallet ON wallet.id = completion."buyerWalletId";

-- name: MarkBroadcast :one
WITH held_outbox AS (
  UPDATE "OutboxEvent" AS outbox
  SET "updatedAt" = sqlc.arg(now_at), "lastError" = NULL
  WHERE outbox.id = sqlc.arg(outbox_id)
    AND outbox.topic = 'certificate.mint'
    AND outbox.status = 'PROCESSING'
    AND outbox."leaseOwner" = sqlc.arg(worker_id)
    AND outbox."leaseExpiresAt" > sqlc.arg(now_at)
  RETURNING "completionId"
)
UPDATE "CourseCompletion" AS completion
SET status = 'MINTING', "txHash" = sqlc.arg(tx_hash), "updatedAt" = sqlc.arg(now_at)
FROM held_outbox
WHERE completion.id = held_outbox."completionId"
  AND (completion."txHash" IS NULL OR completion."txHash" = sqlc.arg(tx_hash))
RETURNING completion.id;

-- name: MarkConfirmed :one
WITH held_outbox AS (
  UPDATE "OutboxEvent" AS outbox
  SET status = 'DELIVERED',
      "deliveredAt" = sqlc.arg(now_at),
      "leaseOwner" = NULL,
      "leaseExpiresAt" = NULL,
      "lastError" = NULL,
      "updatedAt" = sqlc.arg(now_at)
  WHERE outbox.id = sqlc.arg(outbox_id)
    AND outbox.topic = 'certificate.mint'
    AND outbox.status = 'PROCESSING'
    AND outbox."leaseOwner" = sqlc.arg(worker_id)
    AND outbox."leaseExpiresAt" > sqlc.arg(now_at)
  RETURNING "completionId"
)
UPDATE "CourseCompletion" AS completion
SET status = 'MINTED',
    "tokenId" = sqlc.arg(token_id),
    "txHash" = COALESCE(NULLIF(sqlc.arg(tx_hash), ''), completion."txHash"),
    "updatedAt" = sqlc.arg(now_at)
FROM held_outbox
WHERE completion.id = held_outbox."completionId"
  AND (completion."txHash" IS NULL OR completion."txHash" = sqlc.arg(tx_hash) OR sqlc.arg(tx_hash) = '')
RETURNING completion.id;

-- name: ScheduleRetry :one
WITH held_outbox AS (
  UPDATE "OutboxEvent" AS outbox
  SET status = 'PENDING',
      attempts = sqlc.arg(attempt_count),
      "availableAt" = sqlc.arg(next_attempt_at),
      "leaseOwner" = NULL,
      "leaseExpiresAt" = NULL,
      "lastError" = sqlc.arg(error_message),
      "updatedAt" = sqlc.arg(now_at)
  WHERE outbox.id = sqlc.arg(outbox_id)
    AND outbox.topic = 'certificate.mint'
    AND outbox.status = 'PROCESSING'
    AND outbox."leaseOwner" = sqlc.arg(worker_id)
    AND outbox."leaseExpiresAt" > sqlc.arg(now_at)
  RETURNING "completionId"
)
UPDATE "CourseCompletion" AS completion
SET status = CASE
      WHEN completion.status = 'MINTED' THEN 'MINTED'::"CertificateStatus"
      ELSE 'PENDING'::"CertificateStatus"
    END,
    "txHash" = CASE WHEN completion.status = 'MINTED' THEN completion."txHash" ELSE NULL END,
    "updatedAt" = sqlc.arg(now_at)
FROM held_outbox
WHERE completion.id = held_outbox."completionId"
RETURNING completion.id;

-- name: MarkFailed :one
WITH held_outbox AS (
  UPDATE "OutboxEvent" AS outbox
  SET status = 'FAILED',
      "leaseOwner" = NULL,
      "leaseExpiresAt" = NULL,
      "lastError" = sqlc.arg(error_message),
      "updatedAt" = sqlc.arg(now_at)
  WHERE outbox.id = sqlc.arg(outbox_id)
    AND outbox.topic = 'certificate.mint'
    AND outbox.status = 'PROCESSING'
    AND outbox."leaseOwner" = sqlc.arg(worker_id)
    AND outbox."leaseExpiresAt" > sqlc.arg(now_at)
  RETURNING "completionId"
)
UPDATE "CourseCompletion" AS completion
SET status = 'FAILED', "updatedAt" = sqlc.arg(now_at)
FROM held_outbox
WHERE completion.id = held_outbox."completionId"
RETURNING completion.id;
