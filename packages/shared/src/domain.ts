export type CourseStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "UNPUBLISHED";
export type TeacherStatus = "APPLIED" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type CertificateStatus = "PENDING" | "BROADCAST" | "CONFIRMED" | "FAILED";

export interface PageInfo {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface CourseSummary {
  readonly id: string;
  readonly chainCourseId: string | null;
  readonly title: string;
  readonly summary: string;
  readonly coverUrl: string;
  readonly teacherName: string;
  readonly priceYD: string;
  readonly status: CourseStatus;
}

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly details?: Readonly<Record<string, string[]>>;
}
