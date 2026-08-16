import { beforeEach, describe, expect, it } from "vitest";
import type { EntitlementReader } from "../src/entitlements/entitlement-reader";
import { CoursesService } from "../src/courses/courses.service";
import type { PrismaService } from "../src/prisma/prisma.service";
import type { StorageSigner } from "../src/storage/storage-signer";
import type { TeachersService } from "../src/teachers/teachers.service";

const teacher = { assertTeacher: async () => undefined } as TeachersService;
const entitlements = {} as EntitlementReader;
const storage = {} as StorageSigner;
const readyVideoAsset = {
  kind: "VIDEO",
  status: "READY",
  durationMs: 60_000,
  detectedMimeType: "video/mp4",
  sizeBytes: 1024n,
  sha256: "a".repeat(64),
  readyObjectKey: "ready/course-1/video.mp4",
  captionsObjectKey: null,
  readyAt: new Date("2026-08-16T00:00:00.000Z"),
};

describe("course publication workflow", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    process.env.CHAIN_ID = "11155111";
    delete process.env.COURSE_CATALOG_ADDRESS;
  });

  it("stores a teacher price as a proposal rather than a published chain fact", async () => {
    let updateData: Record<string, unknown> | undefined;
    const course = {
      id: "course-1",
      teacherId: "teacher-1",
      title: "Solidity",
      description: "Contract foundations",
      status: "DRAFT",
      lessons: [
        {
          title: "State",
          position: 1,
          required: true,
          asset: readyVideoAsset,
        },
      ],
    };
    const prisma = {
      course: {
        findFirst: async () => course,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ ...course, ...updateData }),
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, teacher, entitlements, storage);

    await service.submit("teacher-1", "course-1", {
      priceYD: "4",
      payoutWallet: "0x1111111111111111111111111111111111111111",
      certificateMetadataUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76h7po6x5l5s3dsu2mu4zqzchqf5r5j5r2a",
    });

    expect(updateData).toMatchObject({
      status: "PENDING_REVIEW",
      requestedPriceYD: "4000000000000000000",
      requestedPayoutWallet: "0x1111111111111111111111111111111111111111",
    });
    expect(updateData).not.toHaveProperty("priceYD");
    expect(updateData).not.toHaveProperty("chainCourseId");
    expect(updateData?.submissionHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails before approval state changes when chain publication config is missing", async () => {
    let updates = 0;
    const prisma = {
      course: {
        findUnique: async () => ({
          id: "course-1",
          status: "PENDING_REVIEW",
          requestedPriceYD: { toString: () => "4000000000000000000" },
          requestedPayoutWallet: "0x1111111111111111111111111111111111111111",
          submissionHash: `0x${"22".repeat(32)}`,
          lessons: [{ asset: readyVideoAsset }],
        }),
        updateMany: async () => {
          updates += 1;
          return { count: 1 };
        },
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, teacher, entitlements, storage);

    await expect(service.review("admin-1", "course-1", true)).rejects.toMatchObject({
      status: 503,
    });
    expect(updates).toBe(0);
  });

  it("accepts verified READY documents without requiring video duration or captions", async () => {
    let updateData: Record<string, unknown> | undefined;
    const course = {
      id: "course-document",
      teacherId: "teacher-1",
      title: "Reference pack",
      description: "Required reading",
      status: "DRAFT",
      lessons: [
        {
          title: "Read the guide",
          position: 1,
          required: true,
          asset: {
            ...readyVideoAsset,
            kind: "DOCUMENT",
            durationMs: null,
            detectedMimeType: "application/pdf",
            readyObjectKey: "ready/course-document/guide.pdf",
          },
        },
      ],
    };
    const prisma = {
      course: {
        findFirst: async () => course,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ ...course, ...updateData }),
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, teacher, entitlements, storage);

    await expect(
      service.submit("teacher-1", course.id, {
        priceYD: "4",
        payoutWallet: "0x1111111111111111111111111111111111111111",
        certificateMetadataUri:
          "ipfs://bafybeigdyrzt5sfp7udm7hu76h7po6x5l5s3dsu2mu4zqzchqf5r5j5r2a",
      }),
    ).resolves.toBeDefined();
    expect(updateData?.submissionHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects required assets that are not byte-verified READY facts", async () => {
    const prisma = {
      course: {
        findFirst: async () => ({
          id: "course-1",
          teacherId: "teacher-1",
          title: "Course",
          description: "Description",
          status: "DRAFT",
          lessons: [
            {
              required: true,
              asset: { ...readyVideoAsset, sha256: null },
            },
          ],
        }),
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, teacher, entitlements, storage);

    await expect(
      service.submit("teacher-1", "course-1", {
        priceYD: "4",
        payoutWallet: "0x1111111111111111111111111111111111111111",
        certificateMetadataUri:
          "ipfs://bafybeigdyrzt5sfp7udm7hu76h7po6x5l5s3dsu2mu4zqzchqf5r5j5r2a",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
