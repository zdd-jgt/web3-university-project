import { Inject, Injectable } from "@nestjs/common";
import { getAddress, keccak256, parseUnits, stringToHex, zeroAddress } from "viem";
import { Errors } from "../common/app-error";
import { ENTITLEMENT_READER, type EntitlementReader } from "../entitlements/entitlement-reader";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_SIGNER, type StorageSigner } from "../storage/storage-signer";
import { TeachersService } from "../teachers/teachers.service";

type CourseSubmission = {
  priceYD: string;
  payoutWallet: string;
  certificateMetadataUri: string;
};

export const CERTIFICATE_METADATA_URI =
  /^ipfs:\/\/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/;

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teachers: TeachersService,
    @Inject(ENTITLEMENT_READER) private readonly entitlements: EntitlementReader,
    @Inject(STORAGE_SIGNER) private readonly storage: StorageSigner,
  ) {}
  async create(teacherId: string, dto: { title: string; description: string }) {
    await this.teachers.assertTeacher(teacherId);
    const title = dto.title.trim();
    const description = dto.description.trim();
    if (!title || !description) throw Errors.validation();
    return this.prisma.course.create({
      data: { teacherId, title, description },
    });
  }
  async update(teacherId: string, id: string, dto: { title?: string; description?: string }) {
    const course = await this.ownedCourse(teacherId, id);
    if (course.status !== "DRAFT") throw Errors.conflict();
    const title = dto.title?.trim();
    const description = dto.description?.trim();
    if (title === "" || description === "") throw Errors.validation();
    return this.prisma.course.update({
      where: { id },
      data: {
        title,
        description,
        requestedPriceYD: null,
        requestedPayoutWallet: null,
        submissionHash: null,
        certificateMetadataUri: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    });
  }
  list(page: number, limit: number) {
    return this.prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        chainId: true,
        catalogAddress: true,
        chainCourseId: true,
        priceYD: true,
        title: true,
        description: true,
        status: true,
        teacherId: true,
      },
    });
  }
  reviewQueue() {
    return this.prisma.course.findMany({
      where: { status: { in: ["PENDING_REVIEW", "APPROVED"] } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        teacherId: true,
        status: true,
        requestedPriceYD: true,
        requestedPayoutWallet: true,
        submissionHash: true,
        certificateMetadataUri: true,
        reviewedBy: true,
        reviewedAt: true,
        updatedAt: true,
      },
    });
  }
  mine(teacherId: string) {
    return this.prisma.course.findMany({
      where: { teacherId },
      orderBy: { updatedAt: "desc" },
      include: { lessons: { orderBy: { position: "asc" }, include: { video: true } } },
    });
  }
  detail(id: string) {
    return this.prisma.course
      .findFirst({
        where: { id, status: "PUBLISHED" },
        include: {
          lessons: {
            orderBy: { position: "asc" },
            include: { video: { select: { durationMs: true, status: true } } },
          },
        },
      })
      .then((course) => {
        if (!course) throw Errors.notFound();
        return course;
      });
  }
  async submit(teacherId: string, courseId: string, dto: CourseSubmission) {
    await this.teachers.assertTeacher(teacherId);
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, teacherId },
      include: { lessons: { orderBy: { position: "asc" }, include: { video: true } } },
    });
    if (!course) throw Errors.notFound();
    if (course.status !== "DRAFT") throw Errors.conflict();
    if (
      !course.lessons.some((lesson) => lesson.required) ||
      course.lessons.some((lesson) => !lesson.video)
    ) {
      throw Errors.conflict();
    }
    let payoutWallet: string;
    let priceYD: bigint;
    try {
      payoutWallet = getAddress(dto.payoutWallet);
      priceYD = parseUnits(dto.priceYD, 18);
    } catch {
      throw Errors.validation();
    }
    if (priceYD <= 0n || priceYD >= 2n ** 256n) throw Errors.validation();
    const certificateMetadataUri = dto.certificateMetadataUri.trim();
    if (!CERTIFICATE_METADATA_URI.test(certificateMetadataUri)) throw Errors.validation();
    const submissionHash = buildSubmissionHash({
      id: course.id,
      title: course.title,
      description: course.description,
      priceYD: priceYD.toString(),
      payoutWallet,
      certificateMetadataUri,
      lessons: course.lessons.map((lesson) => ({
        title: lesson.title,
        position: lesson.position,
        required: lesson.required,
        durationMs: lesson.video?.durationMs ?? null,
        hasCaptions: Boolean(lesson.video?.captionsObjectKey),
      })),
    });
    const updated = await this.prisma.course.updateMany({
      where: { id: courseId, teacherId, status: "DRAFT" },
      data: {
        status: "PENDING_REVIEW",
        requestedPriceYD: priceYD.toString(),
        requestedPayoutWallet: payoutWallet.toLowerCase(),
        submissionHash,
        certificateMetadataUri,
        reviewedBy: null,
        reviewedAt: null,
      },
    });
    if (updated.count !== 1) throw Errors.conflict();
    return this.prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  }
  async review(adminId: string, courseId: string, approved: boolean) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { lessons: { where: { required: true }, include: { video: true } } },
    });
    if (!course) throw Errors.notFound();
    if (course.status !== "PENDING_REVIEW") throw Errors.conflict();
    if (
      approved &&
      (course.lessons.length === 0 ||
        course.lessons.some(
          (lesson) => lesson.video?.status !== "READY" || !lesson.video.captionsObjectKey,
        ))
    ) {
      throw Errors.conflict();
    }
    // Resolve all deployment prerequisites before mutating review state. A missing
    // chain configuration must not leave the course approved behind a 503 response.
    const onchainConfig = approved ? this.publicationPackage(course) : undefined;
    const updated = await this.prisma.course.updateMany({
      where: { id: courseId, status: "PENDING_REVIEW" },
      data: {
        status: approved ? "APPROVED" : "DRAFT",
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw Errors.conflict();
    const reviewed = await this.prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    return approved ? { course: reviewed, onchainConfig } : { course: reviewed };
  }
  async recoverPublicationPackage(courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw Errors.notFound();
    if (course.status !== "APPROVED") throw Errors.conflict();
    return this.publicationPackage(course);
  }
  async addLesson(
    teacherId: string,
    courseId: string,
    dto: { title: string; position: number; required: boolean },
  ) {
    const course = await this.ownedCourse(teacherId, courseId);
    if (course.status !== "DRAFT") throw Errors.conflict();
    const title = dto.title.trim();
    if (!title) throw Errors.validation();
    return this.prisma.lesson.create({ data: { courseId, ...dto, title } });
  }
  async addVideo(
    teacherId: string,
    lessonId: string,
    dto: { objectKey: string; captionsObjectKey?: string; durationMs: number },
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson || lesson.course.teacherId !== teacherId) throw Errors.notFound();
    if (lesson.course.status !== "DRAFT") throw Errors.conflict();
    return this.prisma.videoAsset.create({
      data: {
        lessonId,
        objectKey: dto.objectKey.trim(),
        captionsObjectKey: dto.captionsObjectKey?.trim(),
        durationMs: dto.durationMs,
        status: "PROCESSING",
      },
    });
  }
  async signVideo(userId: string, wallet: { address: string; chainId: number }, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true, video: true },
    });
    if (lesson?.video?.status !== "READY") throw Errors.notFound();
    if (!lesson.course.chainCourseId || !lesson.course.chainId) throw Errors.conflict();
    if (wallet.chainId !== lesson.course.chainId) throw Errors.forbidden();
    await this.entitlements.assertPurchased(
      wallet.address,
      lesson.course.chainId,
      lesson.course.chainCourseId,
    );
    // userId deliberately participates only through authenticated principal; no body wallet/user field is accepted.
    if (!userId) throw Errors.unauthenticated();
    const media = await this.storage.signRead(lesson.video.objectKey, "video");
    const captions = lesson.video.captionsObjectKey
      ? await this.storage.signRead(lesson.video.captionsObjectKey, "captions")
      : undefined;
    return { ...media, captionsUrl: captions?.url };
  }
  async ownedCourse(teacherId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, teacherId } });
    if (!course) throw Errors.notFound();
    return course;
  }

  private publicationPackage(course: {
    id: string;
    requestedPriceYD: unknown;
    requestedPayoutWallet: string | null;
    submissionHash: string | null;
  }) {
    const configuredChainId = process.env.CHAIN_ID?.trim();
    const chainId = configuredChainId ? Number(configuredChainId) : Number.NaN;
    const catalogAddress = process.env.COURSE_CATALOG_ADDRESS?.trim();
    if (
      !Number.isSafeInteger(chainId) ||
      chainId < 1 ||
      !catalogAddress ||
      !/^0x[0-9a-fA-F]{40}$/.test(catalogAddress) ||
      !course.requestedPriceYD ||
      !course.requestedPayoutWallet ||
      !course.submissionHash
    ) {
      throw Errors.unavailable();
    }
    const normalizedCatalogAddress = getAddress(catalogAddress);
    if (normalizedCatalogAddress === zeroAddress) throw Errors.unavailable();
    return {
      chainId,
      catalogAddress: normalizedCatalogAddress,
      functionName: "configureCourse" as const,
      args: [
        chainCourseIdFrom(course.id),
        course.requestedPriceYD.toString(),
        getAddress(course.requestedPayoutWallet),
        course.submissionHash,
      ],
    };
  }
}

export function chainCourseIdFrom(courseId: string): string {
  return BigInt(keccak256(stringToHex(`web3-university:${courseId}`))).toString();
}

function buildSubmissionHash(value: object): `0x${string}` {
  return keccak256(stringToHex(JSON.stringify(value)));
}
