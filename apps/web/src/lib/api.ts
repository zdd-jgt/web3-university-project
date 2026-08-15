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
    video: { durationMs: number; status: "PROCESSING" | "READY" } | null;
  }>;
};

export class ApiUnavailableError extends Error {}

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
    if (!this.baseUrl) throw new ApiUnavailableError("VITE_API_BASE_URL is not configured.");
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (authenticated) {
      const token = await this.auth.getAccessToken();
      if (!token || !this.auth.wallet)
        throw new ApiUnavailableError("Sign in and connect a wallet before calling this API.");
      headers.set("authorization", `Bearer ${token}`);
      headers.set("x-wallet-address", this.auth.wallet);
    }
    const response = await fetch(new URL(path, this.baseUrl), { ...init, headers });
    if (!response.ok) throw new Error(`API request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }

  listCourses() {
    return this.request<ApiCourse[]>("/v1/courses?page=1&limit=20");
  }
  courseDetail(courseId: string) {
    return this.request<ApiCourseDetail>(`/v1/courses/${encodeURIComponent(courseId)}`);
  }
  comments(courseId: string) {
    return this.request<unknown[]>(
      `/v1/courses/${encodeURIComponent(courseId)}/comments?page=1&limit=20`,
    );
  }
  videoUrl(lessonId: string) {
    return this.request<{ url: string; captionsUrl?: string }>(
      `/v1/courses/lessons/${encodeURIComponent(lessonId)}/video-url`,
      {},
      true,
    );
  }
  recordProgress(lessonId: string, startMs: number, endMs: number, idempotencyKey: string) {
    return this.request(
      `/v1/lessons/${encodeURIComponent(lessonId)}/progress`,
      {
        method: "POST",
        headers: { "x-idempotency-key": idempotencyKey },
        body: JSON.stringify({ startMs, endMs }),
      },
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
