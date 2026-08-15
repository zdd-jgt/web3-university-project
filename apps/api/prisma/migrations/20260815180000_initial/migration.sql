CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');
CREATE TYPE "TeacherApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AssetStatus" AS ENUM ('READY', 'PROCESSING', 'FAILED');
CREATE TYPE "CertificateStatus" AS ENUM ('PENDING', 'MINTING', 'MINTED', 'FAILED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "privySubject" TEXT NOT NULL,
  "displayName" TEXT, "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_privySubject_key" ON "User"("privySubject");

CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "address" TEXT NOT NULL, "chainId" INTEGER NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL, "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Wallet_chainId_address_key" ON "Wallet"("chainId", "address");
CREATE INDEX "Wallet_userId_isPrimary_idx" ON "Wallet"("userId", "isPrimary");
CREATE UNIQUE INDEX "Wallet_one_primary_per_user" ON "Wallet"("userId") WHERE "isPrimary";

CREATE TABLE "ProfileChallenge" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "nonce" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProfileChallenge_nonce_key" ON "ProfileChallenge"("nonce");
CREATE INDEX "ProfileChallenge_userId_expiresAt_idx" ON "ProfileChallenge"("userId", "expiresAt");

CREATE TABLE "TeacherApplication" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "statement" TEXT NOT NULL,
  "status" "TeacherApplicationStatus" NOT NULL DEFAULT 'PENDING', "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TeacherApplication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeacherApplication_userId_status_idx" ON "TeacherApplication"("userId", "status");

CREATE TABLE "Course" (
  "id" TEXT NOT NULL, "teacherId" TEXT NOT NULL, "chainId" INTEGER, "catalogAddress" TEXT,
  "chainCourseId" TEXT, "priceYD" DECIMAL(78,0), "payoutWallet" TEXT,
  "metadataHash" TEXT, "requestedPriceYD" DECIMAL(78,0), "requestedPayoutWallet" TEXT,
  "submissionHash" TEXT, "certificateMetadataUri" TEXT, "reviewedBy" TEXT, "reviewedAt" TIMESTAMP(3),
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Course_chainId_catalogAddress_chainCourseId_key" ON "Course"("chainId", "catalogAddress", "chainCourseId");
CREATE UNIQUE INDEX "Course_submissionHash_key" ON "Course"("submissionHash");
CREATE INDEX "Course_teacherId_status_idx" ON "Course"("teacherId", "status");
CREATE INDEX "Course_chainId_catalogAddress_idx" ON "Course"("chainId", "catalogAddress");

CREATE TABLE "Lesson" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "title" TEXT NOT NULL, "position" INTEGER NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Lesson_courseId_position_key" ON "Lesson"("courseId", "position");

CREATE TABLE "VideoAsset" (
  "id" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "objectKey" TEXT NOT NULL, "durationMs" INTEGER NOT NULL,
  "status" "AssetStatus" NOT NULL DEFAULT 'PROCESSING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id"), CONSTRAINT "VideoAsset_durationMs_check" CHECK ("durationMs" > 0)
);
CREATE UNIQUE INDEX "VideoAsset_lessonId_key" ON "VideoAsset"("lessonId");
CREATE UNIQUE INDEX "VideoAsset_objectKey_key" ON "VideoAsset"("objectKey");

CREATE TABLE "Comment" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "parentId" TEXT,
  "body" TEXT NOT NULL, "deletedAt" TIMESTAMP(3), "moderatedBy" TEXT, "moderationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Comment_courseId_deletedAt_createdAt_idx" ON "Comment"("courseId", "deletedAt", "createdAt");

CREATE TABLE "LearningEvent" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "startMs" INTEGER NOT NULL, "endMs" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id"), CONSTRAINT "LearningEvent_range_check" CHECK ("startMs" >= 0 AND "endMs" > "startMs")
);
CREATE UNIQUE INDEX "LearningEvent_userId_idempotencyKey_key" ON "LearningEvent"("userId", "idempotencyKey");
CREATE INDEX "LearningEvent_userId_lessonId_createdAt_idx" ON "LearningEvent"("userId", "lessonId", "createdAt");

CREATE TABLE "LearningSegment" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "LearningSegment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningSegment_range_check" CHECK ("startMs" >= 0 AND "endMs" > "startMs")
);
CREATE INDEX "LearningSegment_userId_lessonId_startMs_idx" ON "LearningSegment"("userId", "lessonId", "startMs");

CREATE TABLE "CourseCompletion" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "userId" TEXT NOT NULL, "buyerWalletId" TEXT NOT NULL,
  "status" "CertificateStatus" NOT NULL DEFAULT 'PENDING', "txHash" TEXT, "tokenId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseCompletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseCompletion_txHash_key" ON "CourseCompletion"("txHash");
CREATE UNIQUE INDEX "CourseCompletion_tokenId_key" ON "CourseCompletion"("tokenId");
CREATE UNIQUE INDEX "CourseCompletion_courseId_buyerWalletId_key" ON "CourseCompletion"("courseId", "buyerWalletId");
CREATE UNIQUE INDEX "CourseCompletion_courseId_userId_key" ON "CourseCompletion"("courseId", "userId");

CREATE TABLE "PurchaseEvent" (
  "id" TEXT NOT NULL, "chainId" INTEGER NOT NULL, "txHash" TEXT NOT NULL, "logIndex" INTEGER NOT NULL,
  "blockNumber" BIGINT NOT NULL, "blockHash" TEXT NOT NULL, "canonical" BOOLEAN NOT NULL DEFAULT true,
  "buyerWallet" TEXT NOT NULL, "chainCourseId" TEXT NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseEvent_chainId_txHash_logIndex_key" ON "PurchaseEvent"("chainId", "txHash", "logIndex");
CREATE INDEX "PurchaseEvent_chainId_chainCourseId_buyerWallet_canonical_idx" ON "PurchaseEvent"("chainId", "chainCourseId", "buyerWallet", "canonical");

CREATE TABLE "ChainCheckpoint" (
  "id" TEXT NOT NULL, "chainId" INTEGER NOT NULL, "contractAddress" TEXT NOT NULL, "stream" TEXT NOT NULL,
  "nextBlock" BIGINT NOT NULL, "blockHash" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChainCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChainCheckpoint_chainId_contractAddress_stream_key" ON "ChainCheckpoint"("chainId", "contractAddress", "stream");

CREATE TABLE "EntitlementProjection" (
  "id" TEXT NOT NULL, "chainId" INTEGER NOT NULL, "buyerWallet" TEXT NOT NULL, "chainCourseId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL, "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
  CONSTRAINT "EntitlementProjection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EntitlementProjection_sourceEventId_key" ON "EntitlementProjection"("sourceEventId");
CREATE UNIQUE INDEX "EntitlementProjection_chainId_buyerWallet_chainCourseId_key" ON "EntitlementProjection"("chainId", "buyerWallet", "chainCourseId");
CREATE INDEX "EntitlementProjection_chainId_buyerWallet_chainCourseId_revokedAt_idx" ON "EntitlementProjection"("chainId", "buyerWallet", "chainCourseId", "revokedAt");
ALTER TABLE "EntitlementProjection" ADD CONSTRAINT "EntitlementProjection_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "PurchaseEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL, "topic" TEXT NOT NULL, "dedupeKey" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseOwner" TEXT, "leaseExpiresAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT, "completionId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");
CREATE UNIQUE INDEX "OutboxEvent_completionId_key" ON "OutboxEvent"("completionId");
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX "OutboxEvent_status_availableAt_leaseExpiresAt_idx" ON "OutboxEvent"("status", "availableAt", "leaseExpiresAt");

ALTER TABLE "ProfileChallenge" ADD CONSTRAINT "ProfileChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherApplication" ADD CONSTRAINT "TeacherApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningSegment" ADD CONSTRAINT "LearningSegment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningSegment" ADD CONSTRAINT "LearningSegment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseCompletion" ADD CONSTRAINT "CourseCompletion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseCompletion" ADD CONSTRAINT "CourseCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseCompletion" ADD CONSTRAINT "CourseCompletion_buyerWalletId_fkey" FOREIGN KEY ("buyerWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "CourseCompletion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
