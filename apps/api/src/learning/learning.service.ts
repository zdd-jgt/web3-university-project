import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { Errors } from "../common/app-error";
import { ENTITLEMENT_READER, type EntitlementReader } from "../entitlements/entitlement-reader";
import { PrismaService } from "../prisma/prisma.service";
import { coveredMs, isLessonComplete, mergeRanges } from "./ranges";

type ProgressInput = { startMs: number; endMs: number; idempotencyKey: string };
type ActiveWallet = { id: string; address: string; chainId: number };
type Db = Prisma.TransactionClient;

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENTITLEMENT_READER) private readonly entitlements: EntitlementReader,
  ) {}

  async progress(userId: string, wallet: ActiveWallet, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: "PUBLISHED" },
      include: {
        lessons: {
          where: { required: true },
          orderBy: { position: "asc" },
          include: {
            asset: true,
            segments: { where: { userId }, select: { startMs: true, endMs: true } },
            completions: { where: { userId }, select: { id: true } },
          },
        },
      },
    });
    if (!course) throw Errors.notFound();
    if (!course.chainId || !course.chainCourseId) throw Errors.conflict();
    if (wallet.chainId !== course.chainId) throw Errors.forbidden();
    await this.entitlements.assertPurchased(wallet.address, course.chainId, course.chainCourseId);
    const lessons = course.lessons.map((lesson) => {
      const durationMs = lesson.asset?.durationMs ?? 0;
      const watchedMs = Math.min(coveredMs(lesson.segments), durationMs);
      const complete =
        lesson.completions.length > 0 ||
        (lesson.asset?.kind === "VIDEO" &&
          durationMs > 0 &&
          isLessonComplete(lesson.segments, durationMs));
      return {
        lessonId: lesson.id,
        position: lesson.position,
        contentKind: lesson.asset?.kind ?? null,
        watchedMs,
        durationMs,
        percentage: durationMs > 0 ? Math.min(100, Math.floor((watchedMs * 100) / durationMs)) : 0,
        complete,
      };
    });
    const completedLessons = lessons.filter((lesson) => lesson.complete).length;
    return {
      courseId,
      completedLessons,
      requiredLessons: lessons.length,
      percentage: lessons.length > 0 ? Math.floor((completedLessons * 100) / lessons.length) : 0,
      lessons,
    };
  }

  async record(userId: string, wallet: ActiveWallet, lessonId: string, input: ProgressInput) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true, asset: true },
    });
    if (lesson?.asset?.status !== "READY" || lesson.asset.kind !== "VIDEO") throw Errors.notFound();
    const durationMs = lesson.asset.durationMs ?? 0;
    if (durationMs <= 0) throw Errors.conflict();
    if (input.endMs > durationMs || input.endMs - input.startMs > 120_000)
      throw Errors.validation();
    if (!lesson.course.chainCourseId || !lesson.course.chainId) throw Errors.conflict();
    if (wallet.chainId !== lesson.course.chainId) throw Errors.forbidden();
    await this.entitlements.assertPurchased(
      wallet.address,
      lesson.course.chainId,
      lesson.course.chainCourseId,
    );
    try {
      return await this.serializable(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${lessonId}`}))`,
        );
        const prior = await tx.learningEvent.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
        });
        if (prior)
          return {
            eventId: prior.id,
            replayed: true,
            completion: await this.completionStatus(tx, userId, lesson.courseId),
          };
        const event = await tx.learningEvent.create({
          data: {
            userId,
            lessonId,
            idempotencyKey: input.idempotencyKey,
            startMs: input.startMs,
            endMs: input.endMs,
          },
        });
        const segments = await tx.learningSegment.findMany({
          where: { userId, lessonId },
          select: { startMs: true, endMs: true },
        });
        const normalized = mergeRanges([
          ...segments,
          { startMs: input.startMs, endMs: input.endMs },
        ]);
        await tx.learningSegment.deleteMany({ where: { userId, lessonId } });
        await tx.learningSegment.createMany({
          data: normalized.map((segment) => ({ userId, lessonId, ...segment })),
        });
        if (isLessonComplete(normalized, durationMs)) {
          await tx.lessonCompletion.upsert({
            where: { userId_lessonId: { userId, lessonId } },
            create: {
              userId,
              buyerWalletId: wallet.id,
              lessonId,
              method: "VIDEO_COVERAGE",
            },
            update: {},
          });
        }
        const completion = await this.maybeCreateCompletion(tx, userId, wallet, lesson.courseId);
        return { eventId: event.id, replayed: false, coveredMs: coveredMs(normalized), completion };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const prior = await this.prisma.learningEvent.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
        });
        if (prior)
          return {
            eventId: prior.id,
            replayed: true,
            completion: await this.completionStatus(this.prisma, userId, lesson.courseId),
          };
      }
      throw error;
    }
  }

  private async maybeCreateCompletion(
    tx: Db,
    userId: string,
    wallet: ActiveWallet,
    courseId: string,
  ) {
    const lessons = await tx.lesson.findMany({
      where: { courseId, required: true },
      include: {
        asset: true,
        segments: { where: { userId }, select: { startMs: true, endMs: true } },
        completions: { where: { userId }, select: { id: true } },
      },
    });
    if (lessons.length === 0) return await this.completionStatus(tx, userId, courseId);
    for (const lesson of lessons) {
      if (lesson.completions.length > 0) continue;
      const durationMs = lesson.asset?.durationMs ?? 0;
      if (
        lesson.asset?.kind !== "VIDEO" ||
        durationMs <= 0 ||
        !isLessonComplete(lesson.segments, durationMs)
      ) {
        return await this.completionStatus(tx, userId, courseId);
      }
      await tx.lessonCompletion.upsert({
        where: { userId_lessonId: { userId, lessonId: lesson.id } },
        create: {
          userId,
          buyerWalletId: wallet.id,
          lessonId: lesson.id,
          method: "VIDEO_COVERAGE",
        },
        update: {},
      });
    }
    const existing = await tx.courseCompletion.findFirst({
      where: { courseId, OR: [{ userId }, { buyerWalletId: wallet.id }] },
      select: { id: true, status: true },
    });
    if (existing) return existing;
    const course = await tx.course.findUnique({
      where: { id: courseId },
      select: { chainCourseId: true, certificateMetadataUri: true },
    });
    if (!course?.chainCourseId || !course.certificateMetadataUri) throw Errors.conflict();
    const completion = await tx.courseCompletion.create({
      data: { courseId, userId, buyerWalletId: wallet.id },
    });
    await tx.outboxEvent.create({
      data: {
        topic: "certificate.mint",
        dedupeKey: `certificate:${courseId}:${wallet.address}`,
        completionId: completion.id,
        payload: {
          chainCourseId: course.chainCourseId,
          buyerWallet: wallet.address,
          tokenUri: course.certificateMetadataUri,
          completionId: completion.id,
        },
      },
    });
    return { id: completion.id, status: completion.status };
  }

  private completionStatus(
    db: Pick<PrismaClient, "courseCompletion">,
    userId: string,
    courseId: string,
  ) {
    return db.courseCompletion.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: { id: true, status: true },
    });
  }
  private async serializable<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: "Serializable" });
      } catch (error) {
        if (attempt === 2 || !this.isSerializationFailure(error)) throw error;
      }
    }
    throw Errors.conflict();
  }
  private isSerializationFailure(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2034"
    );
  }
  private isUniqueViolation(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}
