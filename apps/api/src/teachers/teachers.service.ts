import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../common/app-error";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}
  async apply(userId: string, statement: string) {
    const normalized = statement.trim();
    if (normalized.length < 20) throw Errors.validation();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-application:${userId}`}))`,
          );
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });
          if (user?.role !== "STUDENT") throw Errors.conflict();
          const pending = await tx.teacherApplication.findFirst({
            where: { userId, status: "PENDING" },
            select: { id: true },
          });
          if (pending) throw Errors.conflict();
          return tx.teacherApplication.create({ data: { userId, statement: normalized } });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (isSerializationFailure(error)) throw Errors.conflict();
      throw error;
    }
  }
  mine(userId: string) {
    return this.prisma.teacherApplication.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  reviewQueue() {
    return this.prisma.teacherApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }
  async review(adminId: string, applicationId: string, approved: boolean) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const application = await tx.teacherApplication.findUnique({
            where: { id: applicationId },
            select: { userId: true },
          });
          if (!application) throw Errors.notFound();
          const changed = await tx.teacherApplication.updateMany({
            where: { id: applicationId, status: "PENDING" },
            data: {
              status: approved ? "APPROVED" : "REJECTED",
              reviewedBy: adminId,
              reviewedAt: new Date(),
            },
          });
          if (changed.count !== 1) throw Errors.conflict();
          if (approved) {
            await tx.user.update({
              where: { id: application.userId },
              data: { role: "TEACHER" },
            });
          }
          return tx.teacherApplication.findUniqueOrThrow({ where: { id: applicationId } });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (isSerializationFailure(error)) throw Errors.conflict();
      throw error;
    }
  }
  async assertTeacher(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role !== "TEACHER" && user?.role !== "ADMIN") throw Errors.forbidden();
  }
}

function isSerializationFailure(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}
