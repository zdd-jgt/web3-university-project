import { describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
import { TeachersController } from "../src/teachers/teachers.controller";
import { TeachersService } from "../src/teachers/teachers.service";

describe("teacher application review", () => {
  it("atomically rejects a repeated review without changing the user role", async () => {
    let roleUpdates = 0;
    let reviewFilter: unknown;
    const transaction = {
      teacherApplication: {
        findUnique: async () => ({ userId: "user-1" }),
        updateMany: async ({ where }: { where: unknown }) => {
          reviewFilter = where;
          return { count: 0 };
        },
        findUniqueOrThrow: async () => ({ id: "application-1" }),
      },
      user: {
        update: async () => {
          roleUpdates += 1;
        },
      },
    };
    const prisma = {
      $transaction: async (work: (tx: typeof transaction) => unknown) => work(transaction),
    } as unknown as PrismaService;

    await expect(
      new TeachersService(prisma).review("admin-1", "application-1", true),
    ).rejects.toMatchObject({ status: 409 });
    expect(reviewFilter).toEqual({ id: "application-1", status: "PENDING" });
    expect(roleUpdates).toBe(0);
  });

  it("lists only pending applications in the admin review queue", async () => {
    let queueFilter: unknown;
    const prisma = {
      teacherApplication: {
        findMany: async (query: { where: unknown }) => {
          queueFilter = query.where;
          return [];
        },
      },
    } as unknown as PrismaService;

    await new TeachersService(prisma).reviewQueue();
    expect(queueFilter).toEqual({ status: "PENDING" });
  });

  it("rejects a second pending application inside a user-scoped transaction", async () => {
    let lockCalls = 0;
    let creates = 0;
    const transaction = {
      $executeRaw: async () => {
        lockCalls += 1;
        return 1;
      },
      user: { findUnique: async () => ({ role: "STUDENT" }) },
      teacherApplication: {
        findFirst: async () => ({ id: "pending-application" }),
        create: async () => {
          creates += 1;
          return { id: "new-application" };
        },
      },
    };
    const prisma = {
      $transaction: async (work: (tx: typeof transaction) => unknown) => work(transaction),
    } as unknown as PrismaService;

    await expect(
      new TeachersService(prisma).apply("user-1", "A valid teaching statement for review."),
    ).rejects.toMatchObject({ status: 409 });
    expect(lockCalls).toBe(1);
    expect(creates).toBe(0);
  });

  it("rejects the admin queue for a non-admin principal before reading data", () => {
    let reads = 0;
    const service = {
      reviewQueue: () => {
        reads += 1;
        return [];
      },
    } as unknown as TeachersService;
    const controller = new TeachersController(service);

    expect(() =>
      controller.queue({ role: "STUDENT" } as Parameters<TeachersController["queue"]>[0]),
    ).toThrow();
    expect(reads).toBe(0);
  });
});
