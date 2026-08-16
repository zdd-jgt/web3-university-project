import { describe, expect, it, vi } from "vitest";
import type { EntitlementReader } from "../src/entitlements/entitlement-reader";
import { decideHeartbeat } from "../src/learning/heartbeat-policy";
import { LearningSessionsService } from "../src/learning/learning-sessions.service";
import type { PrismaService } from "../src/prisma/prisma.service";
import { S3StorageSigner, type StorageSigner } from "../src/storage/storage-signer";

const now = new Date("2026-08-16T08:00:00.000Z");
const wallet = {
  id: "wallet-1",
  address: "0x1111111111111111111111111111111111111111",
  chainId: 31337,
};

describe("heartbeat policy", () => {
  const state = {
    lastSequence: 1,
    lastPositionMs: 1000,
    lastHeartbeatAt: now,
    createdAt: now,
  };

  it("derives a played range from server time and rejects seeks, stale gaps and order replay", () => {
    expect(
      decideHeartbeat(state, { sequence: 2, positionMs: 10_500 }, new Date(now.getTime() + 10_000)),
    ).toEqual({ acceptedRange: { startMs: 1000, endMs: 10_500 }, reason: "PLAYING" });
    expect(
      decideHeartbeat(state, { sequence: 2, positionMs: 9000 }, new Date(now.getTime() + 1000)),
    ).toMatchObject({ acceptedRange: null, reason: "SEEK" });
    expect(
      decideHeartbeat(state, { sequence: 2, positionMs: 2000 }, new Date(now.getTime() + 31_000)),
    ).toMatchObject({ acceptedRange: null, reason: "STALE" });
    expect(() =>
      decideHeartbeat(state, { sequence: 1, positionMs: 2000 }, new Date(now.getTime() + 1000)),
    ).toThrow("OUT_OF_ORDER");
  });
});

describe("learning session boundary", () => {
  it("presigns document reads with the verified MIME and a safe disposition", async () => {
    process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_ACCESS_KEY = "test";
    process.env.S3_SECRET_KEY = "test-secret";
    const signed = await new S3StorageSigner().signRead("ready/course/guide.pdf", {
      contentType: "application/pdf",
      disposition: "inline",
      fileName: "课程指南.pdf",
    });
    const url = new URL(signed.url);
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(url.searchParams.get("response-content-disposition")).toContain("inline");
    expect(url.searchParams.get("response-content-disposition")).toContain(
      encodeURIComponent("课程指南.pdf"),
    );
  });

  it("signs a verified document with its actual MIME and only then marks access", async () => {
    const signRead = vi.fn(async () => ({
      url: "http://minio.local/document",
      expiresAt: new Date(now.getTime() + 300_000),
    }));
    const asset = {
      id: "asset-doc",
      kind: "DOCUMENT",
      status: "READY",
      originalFileName: "guide.pdf",
      readyObjectKey: "ready/asset-doc/v0.pdf",
      detectedMimeType: "application/pdf",
      sizeBytes: 1024n,
      durationMs: null,
      readyAt: now,
    };
    const session = {
      id: "session-doc",
      kind: "DOCUMENT",
      expiresAt: new Date(now.getTime() + 1_200_000),
    };
    const tx = {
      $executeRaw: async () => 1,
      learningSession: {
        updateMany: async () => ({ count: 0 }),
        create: async () => session,
      },
    };
    const markAccessed = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      lesson: {
        findUnique: async () => ({
          id: "lesson-doc",
          course: { status: "PUBLISHED", chainId: 31337, chainCourseId: "123" },
          asset,
        }),
      },
      learningSession: { updateMany: markAccessed },
      $transaction: async (work: (client: typeof tx) => unknown) => work(tx),
    } as unknown as PrismaService;
    const entitlement = { assertPurchased: vi.fn(async () => undefined) } as EntitlementReader;
    const service = new LearningSessionsService(
      prisma,
      entitlement,
      { signRead } as unknown as StorageSigner,
      { now: () => now },
    );

    await expect(service.startSession("student-1", wallet, "lesson-doc")).resolves.toMatchObject({
      sessionId: "session-doc",
      kind: "DOCUMENT",
    });
    expect(signRead).toHaveBeenCalledWith("ready/asset-doc/v0.pdf", {
      contentType: "application/pdf",
      disposition: "inline",
      fileName: "guide.pdf",
    });
    expect(markAccessed).toHaveBeenCalledWith(
      expect.objectContaining({ data: { accessedAt: now } }),
    );
  });

  it("rejects a session reused by a different current wallet before any completion write", async () => {
    const prisma = {
      learningSession: {
        findUnique: async () => ({
          id: "session-doc",
          userId: "student-1",
          buyerWalletId: "wallet-1",
          lesson: { course: { chainId: 31337, chainCourseId: "123" } },
          asset: {},
        }),
      },
    } as unknown as PrismaService;
    const entitlement = { assertPurchased: vi.fn() } as unknown as EntitlementReader;
    const service = new LearningSessionsService(prisma, entitlement, {} as StorageSigner, {
      now: () => now,
    });

    await expect(
      service.confirmDocument("student-1", { ...wallet, id: "wallet-2" }, "session-doc"),
    ).rejects.toMatchObject({ status: 403 });
    expect(entitlement.assertPurchased).not.toHaveBeenCalled();
  });
});
