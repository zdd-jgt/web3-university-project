import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "../src/auth/principal";
import { CoursesController } from "../src/courses/courses.controller";
import { chainCourseIdFrom, CoursesService } from "../src/courses/courses.service";
import type { EntitlementReader } from "../src/entitlements/entitlement-reader";
import type { PrismaService } from "../src/prisma/prisma.service";
import type { StorageSigner } from "../src/storage/storage-signer";
import type { TeachersService } from "../src/teachers/teachers.service";

const teacher = { assertTeacher: async () => undefined } as TeachersService;
const entitlements = {} as EntitlementReader;
const storage = {} as StorageSigner;
const admin = { role: "ADMIN" } as Principal;
const student = { role: "STUDENT" } as Principal;
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

function approvedCourse() {
  return {
    id: "course-1",
    status: "APPROVED",
    requestedPriceYD: { toString: () => "4000000000000000000" },
    requestedPayoutWallet: "0x1111111111111111111111111111111111111111",
    submissionHash: `0x${"22".repeat(32)}`,
  };
}

describe("course admin publication contracts", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    process.env.CHAIN_ID = "31337";
    process.env.COURSE_CATALOG_ADDRESS = "0x2222222222222222222222222222222222222222";
  });

  it("returns only pending and approved courses in reverse update order", async () => {
    let query: unknown;
    const prisma = {
      course: {
        findMany: async (input: unknown) => {
          query = input;
          return [];
        },
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, teacher, entitlements, storage);

    await expect(service.reviewQueue()).resolves.toEqual([]);
    expect(query).toMatchObject({
      where: { status: { in: ["PENDING_REVIEW", "APPROVED"] } },
      orderBy: { updatedAt: "desc" },
    });
    expect(query).not.toMatchObject({ where: { status: "PUBLISHED" } });
  });

  it("forbids non-admin callers before queue or package services are invoked", async () => {
    const queue = vi.fn();
    const recover = vi.fn();
    const controller = new CoursesController({
      reviewQueue: queue,
      recoverPublicationPackage: recover,
    } as unknown as CoursesService);

    expect(() => controller.reviewQueue(student)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => controller.publicationPackage(student, "course-1")).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(queue).not.toHaveBeenCalled();
    expect(recover).not.toHaveBeenCalled();
  });

  it("recovers the same package after one atomic approval without a second review write", async () => {
    const pendingCourse = {
      ...approvedCourse(),
      status: "PENDING_REVIEW",
      lessons: [{ asset: readyVideoAsset }],
    };
    const approved = { ...pendingCourse, status: "APPROVED" };
    const findUnique = vi.fn().mockResolvedValueOnce(pendingCourse).mockResolvedValueOnce(approved);
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      course: {
        findUnique,
        findUniqueOrThrow: async () => approved,
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, teacher, entitlements, storage);

    const reviewed = await service.review("admin-1", "course-1", true);
    const recovered = await service.recoverPublicationPackage("course-1");

    expect(reviewed.onchainConfig).toEqual({
      chainId: 31337,
      catalogAddress: "0x2222222222222222222222222222222222222222",
      functionName: "configureCourse",
      args: [
        chainCourseIdFrom("course-1"),
        "4000000000000000000",
        "0x1111111111111111111111111111111111111111",
        `0x${"22".repeat(32)}`,
      ],
    });
    expect(recovered).toEqual(reviewed.onchainConfig);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "course-1", status: "PENDING_REVIEW" },
      data: expect.objectContaining({ status: "APPROVED", reviewedBy: "admin-1" }),
    });
  });

  it("fails before approving when CHAIN_ID is absent, non-numeric or zero", async () => {
    const pendingCourse = {
      ...approvedCourse(),
      status: "PENDING_REVIEW",
      lessons: [{ asset: readyVideoAsset }],
    };
    for (const chainId of [undefined, "not-a-number", "0"]) {
      if (chainId === undefined) delete process.env.CHAIN_ID;
      else process.env.CHAIN_ID = chainId;
      const updateMany = vi.fn(async () => ({ count: 1 }));
      const prisma = {
        course: { findUnique: async () => pendingCourse, updateMany },
      } as unknown as PrismaService;
      const service = new CoursesService(prisma, teacher, entitlements, storage);

      await expect(service.review("admin-1", "course-1", true)).rejects.toMatchObject({
        status: 503,
      });
      expect(updateMany).not.toHaveBeenCalled();
    }
  });

  it("fails closed for missing configuration and non-approved recovery states", async () => {
    const configuredCourse = approvedCourse();
    const prisma = {
      course: {
        findUnique: async () => configuredCourse,
        updateMany: vi.fn(),
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, teacher, entitlements, storage);

    delete process.env.COURSE_CATALOG_ADDRESS;
    await expect(service.recoverPublicationPackage("course-1")).rejects.toMatchObject({
      status: 503,
    });
    expect(prisma.course.updateMany).not.toHaveBeenCalled();

    process.env.COURSE_CATALOG_ADDRESS = "0x0000000000000000000000000000000000000000";
    await expect(service.recoverPublicationPackage("course-1")).rejects.toMatchObject({
      status: 503,
    });

    const pendingPrisma = {
      course: { findUnique: async () => ({ ...configuredCourse, status: "PENDING_REVIEW" }) },
    } as unknown as PrismaService;
    await expect(
      new CoursesService(pendingPrisma, teacher, entitlements, storage).recoverPublicationPackage(
        "course-1",
      ),
    ).rejects.toMatchObject({ status: 409 });

    const missingPrisma = {
      course: { findUnique: async () => null },
    } as unknown as PrismaService;
    await expect(
      new CoursesService(missingPrisma, teacher, entitlements, storage).recoverPublicationPackage(
        "course-1",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("allows an admin controller request to delegate only review reads", async () => {
    const queue = vi.fn(async () => [{ id: "course-1", status: "PENDING_REVIEW" }]);
    const recover = vi.fn(async () => ({ functionName: "configureCourse" }));
    const controller = new CoursesController({
      reviewQueue: queue,
      recoverPublicationPackage: recover,
    } as unknown as CoursesService);

    await expect(controller.reviewQueue(admin)).resolves.toEqual([
      { id: "course-1", status: "PENDING_REVIEW" },
    ]);
    await expect(controller.publicationPackage(admin, "course-1")).resolves.toEqual({
      functionName: "configureCourse",
    });
    expect(queue).toHaveBeenCalledOnce();
    expect(recover).toHaveBeenCalledWith("course-1");
  });
});
