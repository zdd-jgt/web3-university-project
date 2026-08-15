import { Inject, Injectable } from "@nestjs/common";
import { Errors } from "../common/app-error";
import { ENTITLEMENT_READER, type EntitlementReader } from "../entitlements/entitlement-reader";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENTITLEMENT_READER) private readonly entitlements: EntitlementReader,
  ) {}
  async create(
    userId: string,
    wallet: { address: string; chainId: number },
    courseId: string,
    body: string,
    parentId?: string,
  ) {
    const normalizedBody = body.trim();
    if (!normalizedBody) throw Errors.validation();
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: "PUBLISHED" },
    });
    if (!course) throw Errors.notFound();
    if (parentId) {
      const parent = await this.prisma.comment.findFirst({
        where: { id: parentId, courseId, deletedAt: null },
      });
      if (!parent) throw Errors.notFound();
      // A teacher can reply only inside a course they own. A student cannot impersonate a reply path.
      if (course.teacherId !== userId) throw Errors.forbidden();
    } else {
      if (!course.chainCourseId || !course.chainId) throw Errors.conflict();
      if (wallet.chainId !== course.chainId) throw Errors.forbidden();
      await this.entitlements.assertPurchased(wallet.address, course.chainId, course.chainCourseId);
    }
    return this.prisma.comment.create({
      data: { courseId, authorId: userId, parentId, body: normalizedBody },
      select: { id: true, courseId: true, parentId: true, body: true, createdAt: true },
    });
  }
  list(courseId: string, page: number, limit: number) {
    return this.prisma.comment.findMany({
      where: { courseId, parentId: null, deletedAt: null, course: { status: "PUBLISHED" } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorId: true,
        replies: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 50,
          select: { id: true, body: true, authorId: true, createdAt: true },
        },
      },
    });
  }
  async moderate(
    adminId: string,
    courseId: string,
    commentId: string,
    hidden: boolean,
    reason: string,
  ) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3) throw Errors.validation();
    const comment = await this.prisma.comment.findFirst({ where: { id: commentId, courseId } });
    if (!comment) throw Errors.notFound();
    return this.prisma.comment.update({
      where: { id: commentId },
      data: {
        deletedAt: hidden ? new Date() : null,
        moderatedBy: adminId,
        moderationReason: normalizedReason,
      },
      select: { id: true, deletedAt: true, moderatedBy: true, moderationReason: true },
    });
  }
}
