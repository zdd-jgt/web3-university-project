import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.MEDIA_TEST_DATABASE_URL;
const requirePostgres = process.env.XJ_REQUIRE_POSTGRES === "1";

if (requirePostgres && !databaseUrl) {
  throw new Error("MEDIA_TEST_DATABASE_URL is required when XJ_REQUIRE_POSTGRES=1");
}

describe.skipIf(!databaseUrl)("lesson asset PostgreSQL contract", () => {
  const schema = `media_${randomUUID().replaceAll("-", "")}`;
  const baseUrl = databaseUrl ?? "postgresql://unused:unused@127.0.0.1:1/unused";
  const scopedUrl = withSchema(baseUrl, schema);
  const admin = new PrismaClient({ datasourceUrl: baseUrl });
  const db = new PrismaClient({ datasourceUrl: scopedUrl });

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await executeStatements(db, await migration("20260815180000_initial"));
    await executeStatements(db, await migration("20260815193000_add_video_captions"));
    await executeStatements(
      db,
      `
      INSERT INTO "User" (id, "privySubject", role, "updatedAt")
      VALUES ('teacher-1', 'did:privy:teacher-1', 'TEACHER', CURRENT_TIMESTAMP),
             ('student-1', 'did:privy:student-1', 'STUDENT', CURRENT_TIMESTAMP);
      INSERT INTO "Wallet" (id, "userId", address, "chainId", "verifiedAt")
      VALUES ('wallet-1', 'student-1', '0x1111111111111111111111111111111111111111', 31337, CURRENT_TIMESTAMP);
      INSERT INTO "Course" (id, "teacherId", title, description, status, "updatedAt")
      VALUES ('course-1', 'teacher-1', 'Course', 'Description', 'DRAFT', CURRENT_TIMESTAMP);
      INSERT INTO "Lesson" (id, "courseId", title, position)
      VALUES ('lesson-video', 'course-1', 'Legacy video', 1),
             ('lesson-document', 'course-1', 'Document', 2),
             ('lesson-ready-video', 'course-1', 'Ready video', 3);
      INSERT INTO "VideoAsset" (id, "lessonId", "objectKey", "captionsObjectKey", "durationMs", status)
      VALUES ('video-old', 'lesson-video', 'legacy/video.mp4', NULL, 60000, 'READY');
    `,
    );
    await executeStatements(
      db,
      await migration("20260816120000_add_lesson_assets_and_learning_sessions"),
    );
  });

  afterAll(async () => {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  });

  it("preserves the legacy row but copies it as unverified PROCESSING", async () => {
    const legacy = await db.videoAsset.findUniqueOrThrow({ where: { id: "video-old" } });
    const copied = await db.lessonAsset.findUniqueOrThrow({
      where: { lessonId: "lesson-video" },
    });

    expect(legacy.status).toBe("READY");
    expect(copied).toMatchObject({
      kind: "VIDEO",
      status: "PROCESSING",
      sourceObjectKey: "legacy/video.mp4",
      readyObjectKey: null,
      detectedMimeType: null,
      sha256: null,
    });
  });

  it("rejects READY assets without byte-derived facts and accepts valid video/document facts", async () => {
    await expect(
      db.lessonAsset.create({
        data: {
          lessonId: "lesson-document",
          kind: "DOCUMENT",
          originalFileName: "guide.pdf",
          sourceObjectKey: "source/guide.pdf",
          declaredMimeType: "application/pdf",
          status: "READY",
        },
      }),
    ).rejects.toBeDefined();

    const readyAt = new Date("2026-08-16T00:00:00.000Z");
    const document = await db.lessonAsset.create({
      data: {
        lessonId: "lesson-document",
        kind: "DOCUMENT",
        originalFileName: "guide.pdf",
        sourceObjectKey: "source/guide.pdf",
        readyObjectKey: "ready/guide.pdf",
        declaredMimeType: "application/pdf",
        detectedMimeType: "application/pdf",
        sizeBytes: 2048n,
        sha256: "a".repeat(64),
        status: "READY",
        readyAt,
      },
    });
    const video = await db.lessonAsset.create({
      data: {
        lessonId: "lesson-ready-video",
        kind: "VIDEO",
        originalFileName: "lesson.mp4",
        sourceObjectKey: "source/lesson.mp4",
        readyObjectKey: "ready/lesson.mp4",
        declaredMimeType: "video/mp4",
        detectedMimeType: "video/mp4",
        sizeBytes: 4096n,
        sha256: "b".repeat(64),
        durationMs: 60_000,
        status: "READY",
        readyAt,
      },
    });

    expect(document.durationMs).toBeNull();
    expect(video.durationMs).toBe(60_000);
  });

  it("enforces one asset/job/lesson completion per domain key", async () => {
    const asset = await db.lessonAsset.findUniqueOrThrow({
      where: { lessonId: "lesson-document" },
    });
    await db.mediaProcessJob.create({ data: { assetId: asset.id } });
    await expect(db.mediaProcessJob.create({ data: { assetId: asset.id } })).rejects.toBeDefined();
    await expect(
      db.lessonAsset.create({
        data: {
          lessonId: "lesson-document",
          kind: "DOCUMENT",
          originalFileName: "duplicate.pdf",
          sourceObjectKey: "source/duplicate.pdf",
          declaredMimeType: "application/pdf",
        },
      }),
    ).rejects.toBeDefined();

    await db.lessonCompletion.create({
      data: {
        userId: "student-1",
        buyerWalletId: "wallet-1",
        lessonId: "lesson-document",
        method: "DOCUMENT_CONFIRM",
      },
    });
    await expect(
      db.lessonCompletion.create({
        data: {
          userId: "student-1",
          buyerWalletId: "wallet-1",
          lessonId: "lesson-document",
          method: "DOCUMENT_CONFIRM",
        },
      }),
    ).rejects.toBeDefined();
  });
});

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
