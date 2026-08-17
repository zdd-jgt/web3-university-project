import { describe, expect, it } from "vitest";
import { CommentsAdminController } from "../src/comments/comments.controller";
import { CommentsService } from "../src/comments/comments.service";
import type { PrismaService } from "../src/prisma/prisma.service";

describe("comment moderation review queue", () => {
  it("maps moderation state and course title for admin review", async () => {
    const prisma = {
      comment: {
        findMany: async () => [
          {
            id: "comment-1",
            body: "Great lesson",
            createdAt: new Date("2026-08-16T00:00:00.000Z"),
            authorId: "user-1",
            parentId: null,
            courseId: "course-1",
            deletedAt: null,
            moderatedBy: null,
            moderationReason: null,
            course: { title: "A practical ERC-20" },
          },
          {
            id: "comment-2",
            body: "Spam",
            createdAt: new Date("2026-08-16T01:00:00.000Z"),
            authorId: "user-2",
            parentId: "comment-1",
            courseId: "course-1",
            deletedAt: new Date("2026-08-16T02:00:00.000Z"),
            moderatedBy: "admin-1",
            moderationReason: "spam content",
            course: { title: "A practical ERC-20" },
          },
        ],
      },
    } as unknown as PrismaService;
    const service = new CommentsService(prisma, {
      assertPurchased: async () => undefined,
    });

    const queue = await service.reviewQueue();

    expect(queue).toEqual([
      expect.objectContaining({
        id: "comment-1",
        hidden: false,
        courseTitle: "A practical ERC-20",
      }),
      expect.objectContaining({
        id: "comment-2",
        hidden: true,
        parentId: "comment-1",
        moderationReason: "spam content",
      }),
    ]);
  });

  it("allows teacher replies only when the parent is a visible top-level course comment", async () => {
    let parentWhere: unknown;
    const prisma = {
      course: {
        findFirst: async () => ({ id: "course-1", teacherId: "teacher-1", status: "PUBLISHED" }),
      },
      comment: {
        findFirst: async ({ where }: { where: unknown }) => {
          parentWhere = where;
          return { id: "comment-1" };
        },
        create: async () => ({ id: "reply-1", body: "Teacher reply" }),
      },
    } as unknown as PrismaService;
    const service = new CommentsService(prisma, {
      assertPurchased: async () => undefined,
    });

    await service.create(
      "teacher-1",
      { address: "0x0000000000000000000000000000000000000001", chainId: 11155111 },
      "course-1",
      "Teacher reply",
      "comment-1",
    );

    expect(parentWhere).toEqual({
      id: "comment-1",
      courseId: "course-1",
      deletedAt: null,
      parentId: null,
    });
  });

  it("rejects the moderation queue for a non-admin principal before reading comments", () => {
    let reads = 0;
    const service = {
      reviewQueue: () => {
        reads += 1;
        return [];
      },
    } as unknown as CommentsService;
    const controller = new CommentsAdminController(service);

    expect(() =>
      controller.queue({ role: "TEACHER" } as Parameters<CommentsAdminController["queue"]>[0]),
    ).toThrow();
    expect(reads).toBe(0);
  });
});
