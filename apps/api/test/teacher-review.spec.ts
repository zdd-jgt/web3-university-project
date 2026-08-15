import { describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
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
});
