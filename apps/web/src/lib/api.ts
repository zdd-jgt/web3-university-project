import { useMemo } from "react";
import type { Address } from "viem";
import { useWalletSession } from "./runtime";

export type ApiCourse = {
  id: string;
  chainId: number | null;
  catalogAddress: Address | null;
  chainCourseId: string | null;
  priceYD: string | null;
  title: string;
  description: string;
  status: "PUBLISHED";
  teacherId: string;
};

export type ApiCourseDetail = ApiCourse & {
  lessons: Array<{
    id: string;
    title: string;
    position: number;
    required: boolean;
    asset: {
      kind: "VIDEO" | "DOCUMENT";
      durationMs: number | null;
      detectedMimeType: string | null;
      status: LessonAssetStatus;
    } | null;
  }>;
};

export type TeacherApplication = {
  id: string;
  userId: string;
  statement: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type LessonAssetStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";

export type ApiLessonAsset = {
  id: string;
  kind: "VIDEO" | "DOCUMENT";
  status: LessonAssetStatus;
  originalFileName: string;
  declaredMimeType: string;
  detectedMimeType: string | null;
  sizeBytes: string | null;
  durationMs: number | null;
  sha256: string | null;
  captionsObjectKey: string | null;
  sourceObjectKey: string;
  failureCode: string | null;
  readyAt: string | null;
};

export type ApiTeacherLesson = {
  id: string;
  title: string;
  position: number;
  required: boolean;
  asset: ApiLessonAsset | null;
};

export type ApiCourseStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED";

export type ApiTeacherCourse = {
  id: string;
  title: string;
  description: string;
  status: ApiCourseStatus;
  priceYD: string | null;
  requestedPriceYD: string | null;
  requestedPayoutWallet: string | null;
  certificateMetadataUri: string | null;
  updatedAt: string;
  lessons: ApiTeacherLesson[];
};

export type ApiUploadSession = {
  assetId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
  status: LessonAssetStatus;
  version: number;
};

export type ApiAssetStatus = {
  assetId: string;
  kind: "VIDEO" | "DOCUMENT";
  originalFileName: string;
  declaredMimeType: string;
  detectedMimeType: string | null;
  sizeBytes: string | null;
  durationMs: number | null;
  status: LessonAssetStatus;
  uploadExpiresAt: string | null;
  processingStartedAt: string | null;
  readyAt: string | null;
  failureCode: string | null;
  version: number;
};

export type ApiReviewQueueItem = {
  id: string;
  title: string;
  teacherId: string;
  status: ApiCourseStatus;
  requestedPriceYD: string | null;
  requestedPayoutWallet: string | null;
  submissionHash: string | null;
  certificateMetadataUri: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export type ApiPublicationPackage = {
  chainId: number;
  catalogAddress: Address;
  functionName: "configureCourse";
  args: [string, string, Address, string];
};

export type ApiCommentReply = {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
};

export type ApiCommentThread = ApiCommentReply & {
  replies: ApiCommentReply[];
};

export type ApiCommentQueueItem = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  parentId: string | null;
  courseId: string;
  courseTitle: string;
  hidden: boolean;
  moderatedBy: string | null;
  moderationReason: string | null;
};

export type ApiSession = {
  userId: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
};

export type ApiLearningSession = {
  sessionId: string;
  lessonId: string;
  kind: "VIDEO" | "DOCUMENT";
  url: string;
  urlExpiresAt: string;
  sessionExpiresAt: string;
};

export type ApiCourseCompletionStatus = { id: string; status: string } | null;

export type ApiHeartbeatResult = {
  replayed: boolean;
  accepted: boolean;
  reason?: string;
  eventId?: string;
  coveredMs?: number;
  lessonComplete?: boolean;
  completion: ApiCourseCompletionStatus;
};

export type ApiDocumentConfirmation = {
  lessonCompletionId: string;
  completion: ApiCourseCompletionStatus;
};

export class ApiUnavailableError extends Error {}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiUnavailableError) return error.message;
  if (error instanceof ApiRequestError) {
    switch (error.status) {
      case 401:
        return "会话缺失或已过期，请重新登录后重试。";
      case 403:
        return "你的账号无权执行该操作，服务端角色判定为准。";
      case 404:
        return "请求的资源已不存在。";
      case 409:
        return "请求与当前服务端状态冲突，请刷新页面确认后重试。";
      case 429:
        return "请求过于频繁，请稍后再试。";
      case 503:
        return "服务暂时不可用，本次操作未改变任何状态。";
      default:
        return `API 拒绝了请求（HTTP ${error.status}）。`;
    }
  }
  if (error instanceof TypeError) return "无法连接 API，请检查网络后重试。";
  return "请求未完成，请检查登录状态后重试。";
}

type Auth = { getAccessToken: () => Promise<string | null>; wallet?: Address };

export class UniversityApi {
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly auth: Auth,
  ) {}

  get available() {
    return Boolean(this.baseUrl);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    authenticated = false,
  ): Promise<T> {
    if (!this.baseUrl) throw new ApiUnavailableError("VITE_API_BASE_URL 未配置。");
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (authenticated) {
      const token = await this.auth.getAccessToken();
      if (!token || !this.auth.wallet)
        throw new ApiUnavailableError("请先登录并连接钱包，再调用该 API。");
      headers.set("authorization", `Bearer ${token}`);
      headers.set("x-wallet-address", this.auth.wallet);
    }
    const response = await fetch(new URL(path, this.baseUrl), { ...init, headers });
    if (!response.ok)
      throw new ApiRequestError(response.status, `API 请求失败（HTTP ${response.status}）。`);
    return response.json() as Promise<T>;
  }

  listCourses() {
    return this.request<ApiCourse[]>("/v1/courses?page=1&limit=20");
  }
  courseDetail(courseId: string) {
    return this.request<ApiCourseDetail>(`/v1/courses/${encodeURIComponent(courseId)}`);
  }
  comments(courseId: string) {
    return this.request<ApiCommentThread[]>(
      `/v1/courses/${encodeURIComponent(courseId)}/comments?page=1&limit=20`,
    );
  }
  createComment(courseId: string, body: string, parentId?: string) {
    return this.request<ApiCommentReply>(
      `/v1/courses/${encodeURIComponent(courseId)}/comments`,
      { method: "POST", body: JSON.stringify(parentId ? { body, parentId } : { body }) },
      true,
    );
  }
  moderateComment(courseId: string, commentId: string, hidden: boolean, reason: string) {
    return this.request<{
      id: string;
      deletedAt: string | null;
      moderatedBy: string;
      moderationReason: string;
    }>(
      `/v1/courses/${encodeURIComponent(courseId)}/comments/${encodeURIComponent(commentId)}/moderate`,
      { method: "PATCH", body: JSON.stringify({ hidden, reason }) },
      true,
    );
  }
  commentReviewQueue() {
    return this.request<ApiCommentQueueItem[]>("/v1/comments/review-queue", {}, true);
  }
  me() {
    return this.request<ApiSession>("/v1/profile/me", {}, true);
  }
  startLearningSession(lessonId: string) {
    return this.request<ApiLearningSession>(
      `/v1/lessons/${encodeURIComponent(lessonId)}/learning-sessions`,
      { method: "POST" },
      true,
    );
  }
  learningHeartbeat(sessionId: string, sequence: number, positionMs: number) {
    return this.request<ApiHeartbeatResult>(
      `/v1/learning-sessions/${encodeURIComponent(sessionId)}/heartbeats`,
      { method: "POST", body: JSON.stringify({ sequence, positionMs }) },
      true,
    );
  }
  confirmDocumentRead(sessionId: string) {
    return this.request<ApiDocumentConfirmation>(
      `/v1/learning-sessions/${encodeURIComponent(sessionId)}/document-confirmation`,
      { method: "POST" },
      true,
    );
  }
  courseProgress(courseId: string) {
    return this.request<{
      courseId: string;
      completedLessons: number;
      requiredLessons: number;
      percentage: number;
      lessons: Array<{
        lessonId: string;
        position: number;
        contentKind: "VIDEO" | "DOCUMENT" | null;
        watchedMs: number;
        durationMs: number;
        percentage: number;
        complete: boolean;
      }>;
    }>(`/v1/courses/${encodeURIComponent(courseId)}/progress`, {}, true);
  }
  profileChallenge(displayName: string) {
    return this.request<{
      nonce: string;
      expiresAt: string;
      typedData: {
        domain: {
          name: string;
          version: string;
          chainId: number;
          verifyingContract: Address;
        };
        types: {
          ProfileUpdate: readonly { name: string; type: string }[];
        };
        primaryType: "ProfileUpdate";
        message: {
          action: string;
          userId: string;
          wallet: Address;
          displayName: string;
          nonce: string;
          expiresAt: string;
        };
      };
    }>("/v1/profile/challenge", { method: "POST", body: JSON.stringify({ displayName }) }, true);
  }
  confirmProfile(displayName: string, nonce: string, signature: string) {
    return this.request(
      "/v1/profile",
      { method: "PATCH", body: JSON.stringify({ displayName, nonce, signature }) },
      true,
    );
  }

  // Teacher applications
  applyTeacher(statement: string) {
    return this.request<TeacherApplication>(
      "/v1/teacher-applications",
      { method: "POST", body: JSON.stringify({ statement }) },
      true,
    );
  }
  myTeacherApplications() {
    return this.request<TeacherApplication[]>("/v1/teacher-applications/me", {}, true);
  }
  teacherApplicationQueue() {
    return this.request<TeacherApplication[]>("/v1/teacher-applications/review-queue", {}, true);
  }
  reviewTeacherApplication(id: string, approved: boolean) {
    return this.request<TeacherApplication>(
      `/v1/teacher-applications/${encodeURIComponent(id)}/review`,
      { method: "PATCH", body: JSON.stringify({ approved }) },
      true,
    );
  }

  // Teacher course management
  myCourses() {
    return this.request<ApiTeacherCourse[]>("/v1/courses/mine", {}, true);
  }
  createCourse(title: string, description: string) {
    return this.request<ApiTeacherCourse>(
      "/v1/courses",
      { method: "POST", body: JSON.stringify({ title, description }) },
      true,
    );
  }
  updateCourse(id: string, fields: { title?: string; description?: string }) {
    return this.request<ApiTeacherCourse>(
      `/v1/courses/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(fields) },
      true,
    );
  }
  addLesson(courseId: string, lesson: { title: string; position: number; required: boolean }) {
    return this.request<ApiTeacherLesson>(
      `/v1/courses/${encodeURIComponent(courseId)}/lessons`,
      { method: "POST", body: JSON.stringify(lesson) },
      true,
    );
  }
  submitCourse(
    courseId: string,
    submission: { priceYD: string; payoutWallet: string; certificateMetadataUri: string },
  ) {
    return this.request<ApiTeacherCourse>(
      `/v1/courses/${encodeURIComponent(courseId)}/submit`,
      { method: "POST", body: JSON.stringify(submission) },
      true,
    );
  }

  // Lesson asset uploads
  createUploadSession(
    lessonId: string,
    declaration: {
      kind: "VIDEO" | "DOCUMENT";
      fileName: string;
      declaredMimeType: string;
      sizeBytes: number;
    },
  ) {
    return this.request<ApiUploadSession>(
      `/v1/lessons/${encodeURIComponent(lessonId)}/assets/upload-session`,
      { method: "POST", body: JSON.stringify(declaration) },
      true,
    );
  }
  finalizeAsset(assetId: string) {
    return this.request<ApiAssetStatus>(
      `/v1/assets/${encodeURIComponent(assetId)}/finalize`,
      { method: "POST" },
      true,
    );
  }
  retryAsset(assetId: string) {
    return this.request<ApiAssetStatus>(
      `/v1/assets/${encodeURIComponent(assetId)}/retry`,
      { method: "POST" },
      true,
    );
  }
  assetStatus(assetId: string) {
    return this.request<ApiAssetStatus>(
      `/v1/assets/${encodeURIComponent(assetId)}/status`,
      {},
      true,
    );
  }

  // Admin course review
  courseReviewQueue() {
    return this.request<ApiReviewQueueItem[]>("/v1/courses/review-queue", {}, true);
  }
  reviewCourse(courseId: string, approved: boolean) {
    return this.request<{
      course: ApiTeacherCourse;
      onchainConfig?: ApiPublicationPackage;
    }>(
      `/v1/courses/${encodeURIComponent(courseId)}/review`,
      { method: "PATCH", body: JSON.stringify({ approved }) },
      true,
    );
  }
  publicationPackage(courseId: string) {
    return this.request<ApiPublicationPackage>(
      `/v1/courses/${encodeURIComponent(courseId)}/publication-package`,
      {},
      true,
    );
  }
}

export function useUniversityApi() {
  const wallet = useWalletSession();
  return useMemo(
    () =>
      new UniversityApi(import.meta.env.VITE_API_BASE_URL, {
        getAccessToken: wallet.getAccessToken,
        wallet: wallet.address,
      }),
    [wallet.address, wallet.getAccessToken],
  );
}
