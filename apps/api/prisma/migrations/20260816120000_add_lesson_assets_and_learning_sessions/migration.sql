CREATE TYPE "LessonAssetStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "LessonContentKind" AS ENUM ('VIDEO', 'DOCUMENT');
CREATE TYPE "MediaJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');
CREATE TYPE "LearningSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');
CREATE TYPE "LessonCompletionMethod" AS ENUM ('VIDEO_COVERAGE', 'DOCUMENT_CONFIRM');

CREATE TABLE "LessonAsset" (
  "id" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "kind" "LessonContentKind" NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "sourceObjectKey" TEXT NOT NULL,
  "readyObjectKey" TEXT,
  "declaredMimeType" TEXT NOT NULL,
  "detectedMimeType" TEXT,
  "sizeBytes" BIGINT,
  "sha256" TEXT,
  "captionsObjectKey" TEXT,
  "durationMs" INTEGER,
  "status" "LessonAssetStatus" NOT NULL DEFAULT 'UPLOADING',
  "uploadExpiresAt" TIMESTAMP(3),
  "processingStartedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonAsset_sizeBytes_check" CHECK ("sizeBytes" IS NULL OR "sizeBytes" > 0),
  CONSTRAINT "LessonAsset_duration_check" CHECK (
    ("kind" = 'VIDEO' AND ("durationMs" IS NULL OR "durationMs" > 0)) OR
    ("kind" = 'DOCUMENT' AND "durationMs" IS NULL)
  ),
  CONSTRAINT "LessonAsset_sha256_check" CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "LessonAsset_ready_facts_check" CHECK ("status" <> 'READY' OR (
    "readyObjectKey" IS NOT NULL AND "detectedMimeType" IS NOT NULL AND
    "sizeBytes" > 0 AND "sha256" IS NOT NULL AND "readyAt" IS NOT NULL AND
    ("kind" = 'DOCUMENT' OR "durationMs" > 0)
  ))
);
CREATE UNIQUE INDEX "LessonAsset_lessonId_key" ON "LessonAsset"("lessonId");
CREATE UNIQUE INDEX "LessonAsset_sourceObjectKey_key" ON "LessonAsset"("sourceObjectKey");
CREATE UNIQUE INDEX "LessonAsset_readyObjectKey_key" ON "LessonAsset"("readyObjectKey");
CREATE UNIQUE INDEX "LessonAsset_captionsObjectKey_key" ON "LessonAsset"("captionsObjectKey");

-- Keep the legacy table and rows untouched for local rollback. The new path
-- copies each legacy row as PROCESSING and requires byte verification before READY.
INSERT INTO "LessonAsset" (
  "id", "lessonId", "kind", "originalFileName", "sourceObjectKey",
  "declaredMimeType", "captionsObjectKey", "durationMs", "status", "createdAt", "updatedAt"
)
SELECT
  'legacy-' || "id", "lessonId", 'VIDEO', 'legacy-upload.mp4', "objectKey",
  'video/mp4', "captionsObjectKey", "durationMs", 'PROCESSING', "createdAt", CURRENT_TIMESTAMP
FROM "VideoAsset";

CREATE TABLE "MediaProcessJob" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "status" "MediaJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaProcessJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaProcessJob_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "MediaProcessJob_assetId_key" ON "MediaProcessJob"("assetId");
CREATE INDEX "MediaProcessJob_status_availableAt_leaseExpiresAt_idx"
  ON "MediaProcessJob"("status", "availableAt", "leaseExpiresAt");

CREATE TABLE "LearningSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "buyerWalletId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "kind" "LessonContentKind" NOT NULL,
  "status" "LearningSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSequence" INTEGER NOT NULL DEFAULT 0,
  "lastPositionMs" INTEGER NOT NULL DEFAULT 0,
  "lastHeartbeatAt" TIMESTAMP(3),
  "accessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningSession_sequence_position_check"
    CHECK ("lastSequence" >= 0 AND "lastPositionMs" >= 0)
);
CREATE INDEX "LearningSession_userId_lessonId_status_expiresAt_idx"
  ON "LearningSession"("userId", "lessonId", "status", "expiresAt");
CREATE INDEX "LearningSession_buyerWalletId_status_expiresAt_idx"
  ON "LearningSession"("buyerWalletId", "status", "expiresAt");

CREATE TABLE "LessonCompletion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "buyerWalletId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "method" "LessonCompletionMethod" NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonCompletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonCompletion_userId_lessonId_key"
  ON "LessonCompletion"("userId", "lessonId");
CREATE INDEX "LessonCompletion_buyerWalletId_lessonId_idx"
  ON "LessonCompletion"("buyerWalletId", "lessonId");

ALTER TABLE "LearningEvent" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "LearningEvent" ADD COLUMN "sequence" INTEGER;
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_session_sequence_check"
  CHECK (("sessionId" IS NULL AND "sequence" IS NULL) OR
         ("sessionId" IS NOT NULL AND "sequence" IS NOT NULL AND "sequence" > 0));
CREATE UNIQUE INDEX "LearningEvent_sessionId_sequence_key"
  ON "LearningEvent"("sessionId", "sequence");

ALTER TABLE "LessonAsset" ADD CONSTRAINT "LessonAsset_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaProcessJob" ADD CONSTRAINT "MediaProcessJob_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "LessonAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_buyerWalletId_fkey"
  FOREIGN KEY ("buyerWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "LessonAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonCompletion" ADD CONSTRAINT "LessonCompletion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonCompletion" ADD CONSTRAINT "LessonCompletion_buyerWalletId_fkey"
  FOREIGN KEY ("buyerWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonCompletion" ADD CONSTRAINT "LessonCompletion_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
