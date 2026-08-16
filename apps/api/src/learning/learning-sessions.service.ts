import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { Errors } from "../common/app-error";
import { ENTITLEMENT_READER, type EntitlementReader } from "../entitlements/entitlement-reader";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_SIGNER, type StorageSigner } from "../storage/storage-signer";
import { decideHeartbeat, type HeartbeatDecision } from "./heartbeat-policy";
import { LEARNING_CLOCK, type LearningClock } from "./learning-clock";
import { coveredMs, isLessonComplete, mergeRanges } from "./ranges";

type ActiveWallet = { id: string; address: string; chainId: number };
type Db = Prisma.TransactionClient;
type HeartbeatInput = { sequence: number; positionMs: number };
const SESSION_TTL_MS = 20 * 60 * 1000;

@Injectable()
export class LearningSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENTITLEMENT_READER) private readonly entitlements: EntitlementReader,
    @Inject(STORAGE_SIGNER) private readonly storage: StorageSigner,
    @Inject(LEARNING_CLOCK) private readonly clock: LearningClock,
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
    await this.assertPurchased(wallet, course);
    const lessons = course.lessons.map((lesson) => {
      const durationMs = lesson.asset?.kind === "VIDEO" ? (lesson.asset.durationMs ?? 0) : 0;
      const watchedMs = Math.min(coveredMs(lesson.segments), durationMs);
      const complete = lesson.completions.length > 0;
      return {
        lessonId: lesson.id,
        position: lesson.position,
        contentKind: lesson.asset?.kind ?? null,
        watchedMs,
        durationMs,
        percentage:
          lesson.asset?.kind === "DOCUMENT"
            ? complete
              ? 100
              : 0
            : durationMs > 0
              ? Math.min(100, Math.floor((watchedMs * 100) / durationMs))
              : 0,
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

  async startSession(userId: string, wallet: ActiveWallet, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true, asset: true },
    });
    if (!lesson?.asset || lesson.course.status !== "PUBLISHED" || !assetIsReadable(lesson.asset)) {
      throw Errors.notFound();
    }
    await this.assertPurchased(wallet, lesson.course);
    const asset = lesson.asset;
    const readyObjectKey = asset.readyObjectKey;
    const detectedMimeType = asset.detectedMimeType;
    if (!readyObjectKey || !detectedMimeType) throw Errors.conflict();
    const now = this.clock.now();
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${lessonId}:session`}))`,
      );
      await tx.learningSession.updateMany({
        where: { userId, lessonId, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      return tx.learningSession.create({
        data: {
          userId,
          buyerWalletId: wallet.id,
          lessonId,
          assetId: asset.id,
          kind: asset.kind,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          lastHeartbeatAt: asset.kind === "VIDEO" ? now : null,
        },
      });
    });
    let signed: { url: string; expiresAt: Date };
    try {
      signed = await this.storage.signRead(
        readyObjectKey,
        asset.kind === "VIDEO"
          ? "video"
          : {
              contentType: detectedMimeType,
              disposition: inlineDocument(detectedMimeType) ? "inline" : "attachment",
              fileName: asset.originalFileName,
            },
      );
    } catch (error) {
      await this.prisma.learningSession.updateMany({
        where: { id: session.id, status: "ACTIVE", accessedAt: null },
        data: { status: "EXPIRED" },
      });
      throw error;
    }
    const changed = await this.prisma.learningSession.updateMany({
      where: { id: session.id, userId, buyerWalletId: wallet.id, status: "ACTIVE" },
      data: { accessedAt: this.clock.now() },
    });
    if (changed.count !== 1) throw Errors.conflict();
    return {
      sessionId: session.id,
      lessonId,
      kind: session.kind,
      url: signed.url,
      urlExpiresAt: signed.expiresAt,
      sessionExpiresAt: session.expiresAt,
    };
  }

  async heartbeat(userId: string, wallet: ActiveWallet, sessionId: string, input: HeartbeatInput) {
    const preliminary = await this.session(sessionId);
    this.assertSessionOwner(preliminary, userId, wallet);
    await this.assertPurchased(wallet, preliminary.lesson.course);
    const now = this.clock.now();
    return this.serializable(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`);
      const current = await tx.learningSession.findUnique({
        where: { id: sessionId },
        include: { asset: true, lesson: { include: { course: true } } },
      });
      if (!current) throw Errors.notFound();
      this.assertSessionOwner(current, userId, wallet);
      const existingEvent = await tx.learningEvent.findUnique({
        where: { sessionId_sequence: { sessionId, sequence: input.sequence } },
      });
      if (existingEvent) {
        return {
          replayed: true,
          accepted: true,
          eventId: existingEvent.id,
          completion: await this.completionStatus(tx, userId, current.lesson.courseId),
        };
      }
      if (
        current.kind !== "VIDEO" ||
        current.asset.kind !== "VIDEO" ||
        current.asset.status !== "READY" ||
        current.status !== "ACTIVE" ||
        !current.accessedAt ||
        current.expiresAt <= now
      ) {
        throw Errors.conflict();
      }
      if (input.positionMs > (current.asset.durationMs ?? 0)) throw Errors.validation();
      let decision: HeartbeatDecision;
      try {
        decision = decideHeartbeat(current, input, now);
      } catch {
        throw Errors.replay();
      }
      const transitioned = await tx.learningSession.updateMany({
        where: { id: sessionId, status: "ACTIVE", lastSequence: current.lastSequence },
        data: {
          lastSequence: input.sequence,
          lastPositionMs: input.positionMs,
          lastHeartbeatAt: now,
        },
      });
      if (transitioned.count !== 1) throw Errors.conflict();
      if (!decision.acceptedRange) {
        return {
          replayed: false,
          accepted: false,
          reason: decision.reason,
          completion: await this.completionStatus(tx, userId, current.lesson.courseId),
        };
      }
      const event = await tx.learningEvent.create({
        data: {
          userId,
          lessonId: current.lessonId,
          sessionId,
          sequence: input.sequence,
          idempotencyKey: `${sessionId}:${input.sequence}`,
          ...decision.acceptedRange,
        },
      });
      const segments = await tx.learningSegment.findMany({
        where: { userId, lessonId: current.lessonId },
        select: { startMs: true, endMs: true },
      });
      const normalized = mergeRanges([...segments, decision.acceptedRange]);
      await tx.learningSegment.deleteMany({ where: { userId, lessonId: current.lessonId } });
      await tx.learningSegment.createMany({
        data: normalized.map((segment) => ({ userId, lessonId: current.lessonId, ...segment })),
      });
      const lessonComplete = isLessonComplete(normalized, current.asset.durationMs ?? 0);
      if (lessonComplete) {
        await tx.lessonCompletion.upsert({
          where: { userId_lessonId: { userId, lessonId: current.lessonId } },
          create: {
            userId,
            buyerWalletId: wallet.id,
            lessonId: current.lessonId,
            method: "VIDEO_COVERAGE",
          },
          update: {},
        });
        await tx.learningSession.update({
          where: { id: sessionId },
          data: { status: "COMPLETED" },
        });
      }
      return {
        replayed: false,
        accepted: true,
        eventId: event.id,
        coveredMs: coveredMs(normalized),
        lessonComplete,
        completion: lessonComplete
          ? await this.maybeCreateCompletion(tx, userId, wallet, current.lesson.courseId)
          : await this.completionStatus(tx, userId, current.lesson.courseId),
      };
    });
  }

  async confirmDocument(userId: string, wallet: ActiveWallet, sessionId: string) {
    const preliminary = await this.session(sessionId);
    this.assertSessionOwner(preliminary, userId, wallet);
    await this.assertPurchased(wallet, preliminary.lesson.course);
    const now = this.clock.now();
    return this.serializable(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`);
      const current = await tx.learningSession.findUnique({
        where: { id: sessionId },
        include: { asset: true, lesson: { include: { course: true } } },
      });
      if (!current) throw Errors.notFound();
      this.assertSessionOwner(current, userId, wallet);
      if (
        current.kind !== "DOCUMENT" ||
        current.asset.kind !== "DOCUMENT" ||
        current.asset.status !== "READY" ||
        !current.accessedAt ||
        current.expiresAt <= now ||
        !["ACTIVE", "COMPLETED"].includes(current.status)
      ) {
        throw Errors.conflict();
      }
      const lessonCompletion = await tx.lessonCompletion.upsert({
        where: { userId_lessonId: { userId, lessonId: current.lessonId } },
        create: {
          userId,
          buyerWalletId: wallet.id,
          lessonId: current.lessonId,
          method: "DOCUMENT_CONFIRM",
        },
        update: {},
      });
      if (current.status === "ACTIVE") {
        await tx.learningSession.update({
          where: { id: sessionId },
          data: { status: "COMPLETED" },
        });
      }
      return {
        lessonCompletionId: lessonCompletion.id,
        completion: await this.maybeCreateCompletion(tx, userId, wallet, current.lesson.courseId),
      };
    });
  }

  private async maybeCreateCompletion(
    tx: Db,
    userId: string,
    wallet: ActiveWallet,
    courseId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${courseId}:completion`}))`,
    );
    const lessons = await tx.lesson.findMany({
      where: { courseId, required: true },
      include: {
        asset: { select: { status: true } },
        completions: { where: { userId }, select: { id: true } },
      },
    });
    if (
      lessons.length === 0 ||
      lessons.some((lesson) => lesson.asset?.status !== "READY" || lesson.completions.length === 0)
    ) {
      return this.completionStatus(tx, userId, courseId);
    }
    const existing = await tx.courseCompletion.findFirst({
      where: { courseId, OR: [{ userId }, { buyerWalletId: wallet.id }] },
      select: { id: true, status: true },
    });
    if (existing) return existing;
    const course = await tx.course.findFirst({
      where: { id: courseId, status: "PUBLISHED" },
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

  private session(sessionId: string) {
    return this.prisma.learningSession
      .findUnique({
        where: { id: sessionId },
        include: { asset: true, lesson: { include: { course: true } } },
      })
      .then((session) => {
        if (!session) throw Errors.notFound();
        return session;
      });
  }

  private assertSessionOwner(
    session: { userId: string; buyerWalletId: string },
    userId: string,
    wallet: ActiveWallet,
  ) {
    if (session.userId !== userId || session.buyerWalletId !== wallet.id) throw Errors.forbidden();
  }

  private async assertPurchased(
    wallet: ActiveWallet,
    course: { chainId: number | null; chainCourseId: string | null },
  ) {
    if (!course.chainId || !course.chainCourseId) throw Errors.conflict();
    if (wallet.chainId !== course.chainId) throw Errors.forbidden();
    await this.entitlements.assertPurchased(wallet.address, course.chainId, course.chainCourseId);
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: "Serializable" });
      } catch (error) {
        if (attempt === 2 || !isSerializationFailure(error)) throw error;
      }
    }
    throw Errors.conflict();
  }
}

function assetIsReadable(asset: {
  status: string;
  kind: string;
  readyObjectKey: string | null;
  detectedMimeType: string | null;
  sizeBytes: bigint | null;
  durationMs: number | null;
  readyAt: Date | null;
}) {
  return (
    asset.status === "READY" &&
    Boolean(asset.readyObjectKey && asset.detectedMimeType && asset.sizeBytes && asset.readyAt) &&
    (asset.kind === "DOCUMENT" || (asset.kind === "VIDEO" && (asset.durationMs ?? 0) > 0))
  );
}

function inlineDocument(contentType: string) {
  return contentType === "application/pdf" || contentType === "text/plain";
}

function isSerializationFailure(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}
