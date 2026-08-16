import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { LessonContentKind, type LessonAsset, Prisma } from "@prisma/client";
import { Errors } from "../common/app-error";
import { PrismaService } from "../prisma/prisma.service";
import {
  STORAGE_SIGNER,
  type StorageObjectHead,
  type StorageSigner,
} from "../storage/storage-signer";

const VIDEO_MAX_BYTES = 2_147_483_648n;
const DOCUMENT_MAX_BYTES = 104_857_600n;

const TYPES = {
  "video/mp4": { kind: LessonContentKind.VIDEO, extension: ".mp4", maxBytes: VIDEO_MAX_BYTES },
  "application/pdf": {
    kind: LessonContentKind.DOCUMENT,
    extension: ".pdf",
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: LessonContentKind.DOCUMENT,
    extension: ".docx",
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    kind: LessonContentKind.DOCUMENT,
    extension: ".pptx",
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: LessonContentKind.DOCUMENT,
    extension: ".xlsx",
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  "text/plain": {
    kind: LessonContentKind.DOCUMENT,
    extension: ".txt",
    maxBytes: DOCUMENT_MAX_BYTES,
  },
} as const;

const FORBIDDEN_NAME_PARTS = new Set([
  "bat",
  "cmd",
  "com",
  "exe",
  "html",
  "htm",
  "js",
  "jar",
  "mjs",
  "ps1",
  "sh",
  "svg",
  "zip",
]);

type UploadInput = {
  kind: LessonContentKind;
  fileName: string;
  declaredMimeType: string;
  sizeBytes: number;
};

type OwnedAsset = LessonAsset & {
  lesson: { course: { teacherId: string; status: string } };
  processJob: { id: string } | null;
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SIGNER) private readonly storage: StorageSigner,
  ) {}

  async createUploadSession(teacherId: string, lessonId: string, input: UploadInput) {
    const declaration = validateDeclaration(input);
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: { select: { id: true, teacherId: true, status: true } }, asset: true },
    });
    if (!lesson || lesson.course.teacherId !== teacherId) throw Errors.notFound();
    if (lesson.course.status !== "DRAFT") throw Errors.conflict();
    if (
      lesson.asset?.status === "PROCESSING" ||
      (lesson.asset?.status === "UPLOADING" &&
        lesson.asset.uploadExpiresAt &&
        lesson.asset.uploadExpiresAt > new Date())
    ) {
      throw Errors.conflict();
    }

    const sourceObjectKey = [
      "source",
      lesson.course.id,
      lesson.id,
      `${randomUUID()}${declaration.extension}`,
    ].join("/");
    const signed = await this.storage.signWrite(
      sourceObjectKey,
      declaration.mimeType,
      declaration.sizeBytes,
    );
    const asset = await this.persistUploadSession({
      existing: lesson.asset,
      lessonId,
      kind: declaration.kind,
      fileName: declaration.fileName,
      mimeType: declaration.mimeType,
      sizeBytes: declaration.sizeBytes,
      sourceObjectKey,
      uploadExpiresAt: signed.expiresAt,
    });
    return {
      assetId: asset.id,
      uploadUrl: signed.url,
      requiredHeaders: signed.requiredHeaders,
      expiresAt: signed.expiresAt,
      status: asset.status,
      version: asset.version,
    };
  }

  async finalize(teacherId: string, assetId: string) {
    const asset = await this.ownedAsset(teacherId, assetId);
    if (asset.status === "READY" || (asset.status === "PROCESSING" && asset.processJob)) {
      return publicStatus(asset);
    }
    if (asset.status !== "UPLOADING") throw Errors.conflict();
    if (!asset.uploadExpiresAt || asset.uploadExpiresAt <= new Date()) {
      await this.failUpload(asset, "UPLOAD_EXPIRED");
      throw Errors.conflict();
    }
    const head = await this.storage.head(asset.sourceObjectKey);
    const failure = uploadHeadFailure(asset, head);
    if (failure) {
      await this.failUpload(asset, failure);
      throw Errors.validation();
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.lessonAsset.updateMany({
        where: { id: asset.id, status: "UPLOADING", version: asset.version },
        data: {
          status: "PROCESSING",
          processingStartedAt: new Date(),
          failureCode: null,
          version: { increment: 1 },
        },
      });
      if (transitioned.count !== 1) throw Errors.conflict();
      await tx.mediaProcessJob.upsert({
        where: { assetId: asset.id },
        create: { assetId: asset.id },
        update: {
          status: "PENDING",
          attempts: 0,
          availableAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          deliveredAt: null,
        },
      });
      return tx.lessonAsset.findUniqueOrThrow({ where: { id: asset.id } });
    });
    return publicStatus(updated);
  }

  async retry(teacherId: string, assetId: string) {
    const asset = await this.ownedAsset(teacherId, assetId);
    if (asset.status !== "FAILED" || asset.failureCode?.startsWith("UPLOAD_")) {
      throw Errors.conflict();
    }
    const head = await this.storage.head(asset.sourceObjectKey);
    if (uploadHeadFailure(asset, head)) throw Errors.conflict();
    const updated = await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.lessonAsset.updateMany({
        where: { id: asset.id, status: "FAILED", version: asset.version },
        data: {
          status: "PROCESSING",
          processingStartedAt: new Date(),
          failureCode: null,
          version: { increment: 1 },
        },
      });
      if (transitioned.count !== 1) throw Errors.conflict();
      await tx.mediaProcessJob.upsert({
        where: { assetId: asset.id },
        create: { assetId: asset.id },
        update: {
          status: "PENDING",
          attempts: 0,
          availableAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          deliveredAt: null,
        },
      });
      return tx.lessonAsset.findUniqueOrThrow({ where: { id: asset.id } });
    });
    return publicStatus(updated);
  }

  async status(teacherId: string, assetId: string) {
    return publicStatus(await this.ownedAsset(teacherId, assetId, false));
  }

  private async ownedAsset(
    teacherId: string,
    assetId: string,
    requireDraft = true,
  ): Promise<OwnedAsset> {
    const asset = await this.prisma.lessonAsset.findUnique({
      where: { id: assetId },
      include: {
        lesson: { include: { course: { select: { teacherId: true, status: true } } } },
        processJob: { select: { id: true } },
      },
    });
    if (!asset || asset.lesson.course.teacherId !== teacherId) throw Errors.notFound();
    if (requireDraft && asset.lesson.course.status !== "DRAFT") throw Errors.conflict();
    return asset;
  }

  private async failUpload(asset: LessonAsset, failureCode: string) {
    const result = await this.prisma.lessonAsset.updateMany({
      where: { id: asset.id, status: "UPLOADING", version: asset.version },
      data: { status: "FAILED", failureCode, version: { increment: 1 } },
    });
    if (result.count !== 1) throw Errors.conflict();
  }

  private async persistUploadSession(input: {
    existing: LessonAsset | null;
    lessonId: string;
    kind: LessonContentKind;
    fileName: string;
    mimeType: string;
    sizeBytes: bigint;
    sourceObjectKey: string;
    uploadExpiresAt: Date;
  }) {
    const data = {
      kind: input.kind,
      originalFileName: input.fileName,
      sourceObjectKey: input.sourceObjectKey,
      readyObjectKey: null,
      declaredMimeType: input.mimeType,
      detectedMimeType: null,
      sizeBytes: input.sizeBytes,
      sha256: null,
      captionsObjectKey: null,
      durationMs: null,
      status: "UPLOADING" as const,
      uploadExpiresAt: input.uploadExpiresAt,
      processingStartedAt: null,
      readyAt: null,
      failureCode: null,
    };
    try {
      if (!input.existing) {
        return await this.prisma.lessonAsset.create({
          data: { lessonId: input.lessonId, ...data },
        });
      }
      return await this.prisma.$transaction(async (tx) => {
        await tx.mediaProcessJob.deleteMany({ where: { assetId: input.existing?.id } });
        const changed = await tx.lessonAsset.updateMany({
          where: { id: input.existing?.id, version: input.existing?.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (changed.count !== 1) throw Errors.conflict();
        return tx.lessonAsset.findUniqueOrThrow({ where: { id: input.existing?.id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw Errors.conflict();
      }
      throw error;
    }
  }
}

function validateDeclaration(input: UploadInput) {
  if (
    typeof input.fileName !== "string" ||
    typeof input.declaredMimeType !== "string" ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    throw Errors.validation();
  }
  const fileName = input.fileName.normalize("NFKC").trim();
  const mimeType = input.declaredMimeType.trim().toLowerCase();
  const rule = TYPES[mimeType as keyof typeof TYPES];
  const sizeBytes = BigInt(input.sizeBytes);
  if (
    !fileName ||
    fileName.length > 180 ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0") ||
    !/^[\p{L}\p{N} ._()-]+$/u.test(fileName) ||
    !rule ||
    rule.kind !== input.kind ||
    sizeBytes <= 0n ||
    sizeBytes > rule.maxBytes
  ) {
    throw Errors.validation();
  }
  const lowerName = fileName.toLowerCase();
  const extension = lowerName.slice(lowerName.lastIndexOf("."));
  const nameParts = lowerName.split(".").slice(1, -1);
  if (extension !== rule.extension || nameParts.some((part) => FORBIDDEN_NAME_PARTS.has(part))) {
    throw Errors.validation();
  }
  return { fileName, mimeType, sizeBytes, ...rule };
}

function uploadHeadFailure(asset: LessonAsset, head: StorageObjectHead | null): string | null {
  if (!head) return "UPLOAD_MISSING";
  if (head.contentLength <= 0n || head.contentLength !== asset.sizeBytes) return "SIZE_MISMATCH";
  if (head.contentType !== asset.declaredMimeType.toLowerCase()) return "DECLARED_MIME_MISMATCH";
  return null;
}

function publicStatus(asset: LessonAsset) {
  return {
    assetId: asset.id,
    kind: asset.kind,
    originalFileName: asset.originalFileName,
    declaredMimeType: asset.declaredMimeType,
    detectedMimeType: asset.detectedMimeType,
    sizeBytes: asset.sizeBytes?.toString() ?? null,
    durationMs: asset.durationMs,
    status: asset.status,
    uploadExpiresAt: asset.uploadExpiresAt,
    processingStartedAt: asset.processingStartedAt,
    readyAt: asset.readyAt,
    failureCode: asset.failureCode,
    version: asset.version,
  };
}
