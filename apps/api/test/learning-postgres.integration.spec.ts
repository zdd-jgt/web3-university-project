import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EntitlementReader } from "../src/entitlements/entitlement-reader";
import { LearningSessionsService } from "../src/learning/learning-sessions.service";
import type { PrismaService } from "../src/prisma/prisma.service";
import type { StorageSigner } from "../src/storage/storage-signer";

const databaseUrl = process.env.LEARNING_TEST_DATABASE_URL?.trim();
if (process.env.XJ_REQUIRE_POSTGRES === "1" && !databaseUrl) {
  throw new Error("LEARNING_TEST_DATABASE_URL is required for XJ learning evidence");
}

describe.skipIf(!databaseUrl)("learning completion PostgreSQL transaction", () => {
  const schema = `learning_${randomUUID().replaceAll("-", "")}`;
  const baseUrl = databaseUrl ?? "postgresql://unused:unused@127.0.0.1:1/unused";
  const scopedUrl = withSchema(baseUrl, schema);
  const admin = new PrismaClient({ datasourceUrl: baseUrl });
  const db = new PrismaClient({ datasourceUrl: scopedUrl });
  const entitlement = { assertPurchased: vi.fn(async () => undefined) } as EntitlementReader;
  const storage = {
    signRead: vi.fn(async () => ({
      url: "http://private.local/signed",
      expiresAt: new Date("2026-08-16T09:00:00.000Z"),
    })),
  } as unknown as StorageSigner;
  let currentTime = new Date("2026-08-16T08:00:00.000Z");
  const service = new LearningSessionsService(
    db as unknown as PrismaService,
    entitlement,
    storage,
    { now: () => currentTime },
  );
  const wallet = {
    id: "learning-wallet",
    address: "0x1111111111111111111111111111111111111111",
    chainId: 31337,
  };

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await executeStatements(db, await migration("20260815180000_initial"));
    await executeStatements(db, await migration("20260815193000_add_video_captions"));
    await executeStatements(
      db,
      await migration("20260816120000_add_lesson_assets_and_learning_sessions"),
    );
    await seedLearningCourse(db);
  });

  afterAll(async () => {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  });

  it("reaches 100 percent and creates exactly one completion/outbox under concurrent confirmation", async () => {
    const started = await Promise.allSettled([
      service.startSession("learning-student", wallet, "learning-video"),
      service.startSession("learning-student", wallet, "learning-video"),
    ]);
    const activeSessions = await db.learningSession.findMany({
      where: { userId: "learning-student", lessonId: "learning-video", status: "ACTIVE" },
    });
    expect(activeSessions).toHaveLength(1);
    expect(started.some((result) => result.status === "fulfilled")).toBe(true);
    const videoSessionId = activeSessions[0]?.id;
    expect(videoSessionId).toBeTruthy();
    if (!videoSessionId) throw new Error("active video session missing");
    currentTime = new Date(currentTime.getTime() + 1000);
    await expect(
      service.heartbeat("learning-student", wallet, videoSessionId, {
        sequence: 1,
        positionMs: 0,
      }),
    ).resolves.toMatchObject({ accepted: false, reason: "BASELINE" });
    currentTime = new Date(currentTime.getTime() + 10_000);
    await expect(
      service.heartbeat("learning-student", wallet, videoSessionId, {
        sequence: 2,
        positionMs: 9500,
      }),
    ).resolves.toMatchObject({ accepted: true, lessonComplete: true });

    const document = await service.startSession("learning-student", wallet, "learning-document");
    const [first, second] = await Promise.all([
      service.confirmDocument("learning-student", wallet, document.sessionId),
      service.confirmDocument("learning-student", wallet, document.sessionId),
    ]);
    expect(first.lessonCompletionId).toBe(second.lessonCompletionId);
    await expect(
      service.progress("learning-student", wallet, "learning-course"),
    ).resolves.toMatchObject({
      completedLessons: 2,
      requiredLessons: 2,
      percentage: 100,
      lessons: [
        expect.objectContaining({ lessonId: "learning-video", percentage: 95, complete: true }),
        expect.objectContaining({ lessonId: "learning-document", percentage: 100, complete: true }),
      ],
    });
    expect(await db.courseCompletion.count({ where: { courseId: "learning-course" } })).toBe(1);
    expect(await db.outboxEvent.count({ where: { topic: "certificate.mint" } })).toBe(1);
    const outbox = await db.outboxEvent.findFirstOrThrow({ where: { topic: "certificate.mint" } });
    expect(outbox.payload).toMatchObject({
      chainCourseId: "123",
      buyerWallet: wallet.address,
      completionId: outbox.completionId,
    });
  });
});

async function seedLearningCourse(db: PrismaClient) {
  await db.user.createMany({
    data: [
      { id: "learning-teacher", privySubject: "did:privy:learning-teacher", role: "TEACHER" },
      { id: "learning-student", privySubject: "did:privy:learning-student", role: "STUDENT" },
    ],
  });
  await db.wallet.create({
    data: {
      id: "learning-wallet",
      userId: "learning-student",
      address: "0x1111111111111111111111111111111111111111",
      chainId: 31337,
      verifiedAt: new Date(),
      isPrimary: true,
    },
  });
  await db.course.create({
    data: {
      id: "learning-course",
      teacherId: "learning-teacher",
      title: "Learning",
      description: "Learning course",
      status: "PUBLISHED",
      chainId: 31337,
      catalogAddress: "0x2222222222222222222222222222222222222222",
      chainCourseId: "123",
      priceYD: "4000000000000000000",
      payoutWallet: "0x3333333333333333333333333333333333333333",
      metadataHash: `0x${"44".repeat(32)}`,
      certificateMetadataUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76h7po6x5l5s3dsu2mu4zqzchqf5r5j5r2a",
      lessons: {
        create: [
          {
            id: "learning-video",
            title: "Video",
            position: 1,
            required: true,
            asset: {
              create: {
                id: "learning-video-asset",
                kind: "VIDEO",
                originalFileName: "lesson.mp4",
                sourceObjectKey: "source/lesson.mp4",
                readyObjectKey: "ready/lesson.mp4",
                declaredMimeType: "video/mp4",
                detectedMimeType: "video/mp4",
                sizeBytes: 2048n,
                sha256: "a".repeat(64),
                durationMs: 10_000,
                status: "READY",
                readyAt: new Date(),
              },
            },
          },
          {
            id: "learning-document",
            title: "Document",
            position: 2,
            required: true,
            asset: {
              create: {
                id: "learning-document-asset",
                kind: "DOCUMENT",
                originalFileName: "guide.pdf",
                sourceObjectKey: "source/guide.pdf",
                readyObjectKey: "ready/guide.pdf",
                declaredMimeType: "application/pdf",
                detectedMimeType: "application/pdf",
                sizeBytes: 1024n,
                sha256: "b".repeat(64),
                status: "READY",
                readyAt: new Date(),
              },
            },
          },
        ],
      },
    },
  });
}

async function migration(name: string) {
  return readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
}

function withSchema(value: string, schema: string) {
  const url = new URL(value);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function executeStatements(db: PrismaClient, sql: string) {
  for (const statement of sql
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await db.$executeRawUnsafe(statement);
  }
}
