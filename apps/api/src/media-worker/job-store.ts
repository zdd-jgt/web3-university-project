import { Prisma, PrismaClient, type LessonContentKind } from "@prisma/client";
import type { MediaJob, ProcessingFailure, ReadyMediaFacts } from "./types";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;

type ClaimedRow = {
  jobId: string;
  assetId: string;
  assetVersion: number;
  attempts: number;
  kind: LessonContentKind;
  sourceObjectKey: string;
  declaredMimeType: string;
  expectedSizeBytes: bigint | null;
};

export interface MediaJobStore {
  claim(leaseOwner: string): Promise<MediaJob | null>;
  complete(job: MediaJob, leaseOwner: string, facts: ReadyMediaFacts): Promise<void>;
  fail(job: MediaJob, leaseOwner: string, failure: ProcessingFailure): Promise<void>;
}

export class PrismaMediaJobStore implements MediaJobStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly leaseMs = DEFAULT_LEASE_MS,
    private readonly maxAttempts = DEFAULT_MAX_ATTEMPTS,
  ) {}

  async claim(leaseOwner: string): Promise<MediaJob | null> {
    const leaseExpiresAt = new Date(Date.now() + this.leaseMs);
    const rows = await this.prisma.$transaction((tx) =>
      tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
        WITH candidate AS (
          SELECT job.id
          FROM "MediaProcessJob" AS job
          JOIN "LessonAsset" AS asset ON asset.id = job."assetId"
          WHERE asset.status = 'PROCESSING'
            AND (
              (job.status = 'PENDING' AND job."availableAt" <= NOW())
              OR (job.status = 'PROCESSING' AND job."leaseExpiresAt" < NOW())
            )
          ORDER BY job."availableAt" ASC, job."createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "MediaProcessJob" AS job
        SET status = 'PROCESSING',
            attempts = job.attempts + 1,
            "leaseOwner" = ${leaseOwner},
            "leaseExpiresAt" = ${leaseExpiresAt},
            "updatedAt" = NOW()
        FROM candidate, "LessonAsset" AS asset
        WHERE job.id = candidate.id AND asset.id = job."assetId"
        RETURNING
          job.id AS "jobId",
          asset.id AS "assetId",
          asset.version AS "assetVersion",
          job.attempts,
          asset.kind,
          asset."sourceObjectKey",
          asset."declaredMimeType",
          asset."sizeBytes" AS "expectedSizeBytes"
      `),
    );
    const row = rows[0];
    if (!row) return null;
    if (!row.expectedSizeBytes || row.expectedSizeBytes <= 0n) {
      throw new Error("Claimed media asset has no expected size");
    }
    return { ...row, expectedSizeBytes: row.expectedSizeBytes };
  }

  async complete(job: MediaJob, leaseOwner: string, facts: ReadyMediaFacts): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.lessonAsset.updateMany({
        where: { id: job.assetId, status: "PROCESSING", version: job.assetVersion },
        data: {
          readyObjectKey: facts.readyObjectKey,
          detectedMimeType: facts.detectedMimeType,
          sizeBytes: facts.sizeBytes,
          sha256: facts.sha256,
          durationMs: facts.durationMs,
          status: "READY",
          readyAt: new Date(),
          failureCode: null,
        },
      });
      const claimed = await tx.mediaProcessJob.updateMany({
        where: { id: job.jobId, status: "PROCESSING", leaseOwner },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
      if (asset.count !== 1 || claimed.count !== 1) throw new Error("MEDIA_JOB_LEASE_LOST");
    });
  }

  async fail(job: MediaJob, leaseOwner: string, failure: ProcessingFailure): Promise<void> {
    const disposition = failureDisposition(job.attempts, failure.retryable, this.maxAttempts);
    const availableAt = new Date(Date.now() + disposition.retryDelayMs);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mediaProcessJob.updateMany({
        where: { id: job.jobId, status: "PROCESSING", leaseOwner },
        data: {
          status: disposition.status,
          availableAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: failure.code,
        },
      });
      if (claimed.count !== 1) throw new Error("MEDIA_JOB_LEASE_LOST");
      const asset = await tx.lessonAsset.updateMany({
        where: { id: job.assetId, status: "PROCESSING", version: job.assetVersion },
        data: {
          ...(disposition.status === "FAILED" ? { status: "FAILED" as const } : {}),
          failureCode: failure.code,
        },
      });
      if (asset.count !== 1) throw new Error("MEDIA_ASSET_VERSION_CHANGED");
    });
  }
}

export function failureDisposition(attempts: number, retryable: boolean, maxAttempts: number) {
  const terminal = !retryable || attempts >= maxAttempts;
  return {
    status: terminal ? ("FAILED" as const) : ("PENDING" as const),
    retryDelayMs: terminal ? 0 : Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1)),
  };
}
