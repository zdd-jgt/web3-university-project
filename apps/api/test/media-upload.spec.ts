import { LessonContentKind } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaService } from "../src/media/media.service";
import type { PrismaService } from "../src/prisma/prisma.service";
import type { StorageSigner } from "../src/storage/storage-signer";

const expiresAt = new Date("2026-08-16T12:15:00.000Z");
const baseAsset = {
  id: "asset-1",
  lessonId: "lesson-1",
  kind: LessonContentKind.VIDEO,
  originalFileName: "lesson.mp4",
  sourceObjectKey: "source/course-1/lesson-1/server.mp4",
  readyObjectKey: null,
  declaredMimeType: "video/mp4",
  detectedMimeType: null,
  sizeBytes: 1024n,
  sha256: null,
  captionsObjectKey: null,
  durationMs: null,
  status: "UPLOADING",
  uploadExpiresAt: expiresAt,
  processingStartedAt: null,
  readyAt: null,
  failureCode: null,
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("media upload boundary", () => {
  beforeEach(() => vi.useRealTimers());

  it("creates a short private upload contract with a server-generated key", async () => {
    const signWrite = vi.fn(async () => ({
      url: "http://minio.local/signed",
      expiresAt,
      requiredHeaders: { "content-type": "video/mp4", "content-length": "1024" },
    }));
    const prisma = {
      lesson: {
        findUnique: async () => ({
          id: "lesson-1",
          course: { id: "course-1", teacherId: "teacher-1", status: "DRAFT" },
          asset: null,
        }),
      },
      lessonAsset: { create: async ({ data }: { data: object }) => ({ ...baseAsset, ...data }) },
    } as unknown as PrismaService;
    const storage = { signWrite } as unknown as StorageSigner;
    const service = new MediaService(prisma, storage);

    const result = await service.createUploadSession("teacher-1", "lesson-1", {
      kind: LessonContentKind.VIDEO,
      fileName: "第一课.mp4",
      declaredMimeType: "video/mp4",
      sizeBytes: 1024,
    });

    const [key, mime, size] = signWrite.mock.calls[0] ?? [];
    expect(key).toMatch(/^source\/course-1\/lesson-1\/[0-9a-f-]{36}\.mp4$/);
    expect(key).not.toContain("第一课");
    expect([mime, size]).toEqual(["video/mp4", 1024n]);
    expect(result).toMatchObject({ assetId: "asset-1", status: "UPLOADING" });
    expect(result).not.toHaveProperty("objectKey");
  });

  it("rejects non-owner, misleading extension, kind mismatch and oversize documents", async () => {
    const ownerPrisma = {
      lesson: {
        findUnique: async () => ({
          id: "lesson-1",
          course: { id: "course-1", teacherId: "teacher-1", status: "DRAFT" },
          asset: null,
        }),
      },
    } as unknown as PrismaService;
    const service = new MediaService(ownerPrisma, {} as StorageSigner);
    await expect(
      service.createUploadSession("teacher-2", "lesson-1", {
        kind: LessonContentKind.VIDEO,
        fileName: "lesson.mp4",
        declaredMimeType: "video/mp4",
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.createUploadSession("teacher-1", "lesson-1", {
        kind: LessonContentKind.DOCUMENT,
        fileName: "notes.exe.pdf",
        declaredMimeType: "application/pdf",
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createUploadSession("teacher-1", "lesson-1", {
        kind: LessonContentKind.VIDEO,
        fileName: "notes.pdf",
        declaredMimeType: "application/pdf",
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createUploadSession("teacher-1", "lesson-1", {
        kind: LessonContentKind.DOCUMENT,
        fileName: "notes.pdf",
        declaredMimeType: "application/pdf",
        sizeBytes: 104_857_601,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("finalizes only after HEAD matches and creates one processing job", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    const upsert = vi.fn(async () => ({}));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const processing = { ...baseAsset, status: "PROCESSING", version: 1 };
    const tx = {
      lessonAsset: {
        updateMany,
        findUniqueOrThrow: async () => processing,
      },
      mediaProcessJob: { upsert },
    };
    const prisma = {
      lessonAsset: {
        findUnique: async () => ({
          ...baseAsset,
          lesson: { course: { teacherId: "teacher-1", status: "DRAFT" } },
          processJob: null,
        }),
      },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaService;
    const storage = {
      head: async () => ({ contentLength: 1024n, contentType: "video/mp4" }),
    } as StorageSigner;
    const service = new MediaService(prisma, storage);

    await expect(service.finalize("teacher-1", "asset-1")).resolves.toMatchObject({
      status: "PROCESSING",
      version: 1,
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "asset-1", status: "UPLOADING", version: 0 } }),
    );
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("treats an already queued finalize as idempotent and never exposes storage keys", async () => {
    const head = vi.fn();
    const prisma = {
      lessonAsset: {
        findUnique: async () => ({
          ...baseAsset,
          status: "PROCESSING",
          processJob: { id: "job-1" },
          lesson: { course: { teacherId: "teacher-1", status: "DRAFT" } },
        }),
      },
    } as unknown as PrismaService;
    const service = new MediaService(prisma, { head } as unknown as StorageSigner);

    const result = await service.finalize("teacher-1", "asset-1");
    expect(result).toMatchObject({ assetId: "asset-1", status: "PROCESSING" });
    expect(result).not.toHaveProperty("sourceObjectKey");
    expect(result).not.toHaveProperty("readyObjectKey");
    expect(head).not.toHaveBeenCalled();
  });

  it("fails closed for expired, missing and size-mismatched uploads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:20:00.000Z"));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      lessonAsset: {
        findUnique: async () => ({
          ...baseAsset,
          lesson: { course: { teacherId: "teacher-1", status: "DRAFT" } },
          processJob: null,
        }),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new MediaService(prisma, { head: async () => null } as StorageSigner);
    await expect(service.finalize("teacher-1", "asset-1")).rejects.toMatchObject({ status: 409 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureCode: "UPLOAD_EXPIRED" }) }),
    );

    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    updateMany.mockClear();
    await expect(service.finalize("teacher-1", "asset-1")).rejects.toMatchObject({ status: 400 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureCode: "UPLOAD_MISSING" }) }),
    );

    const mismatch = new MediaService(prisma, {
      head: async () => ({ contentLength: 1000n, contentType: "video/mp4" }),
    } as StorageSigner);
    updateMany.mockClear();
    await expect(mismatch.finalize("teacher-1", "asset-1")).rejects.toMatchObject({ status: 400 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureCode: "SIZE_MISMATCH" }) }),
    );
  });
});
