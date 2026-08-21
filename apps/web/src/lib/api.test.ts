import { describe, expect, it, vi } from "vitest";
import { ApiRequestError, ApiUnavailableError, apiErrorMessage, UniversityApi } from "./api";

describe("UniversityApi", () => {
  it("fails closed before any request when the API base URL is missing", async () => {
    const api = new UniversityApi(undefined, { getAccessToken: async () => null });
    await expect(api.listCourses()).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it("adds Privy bearer and active wallet headers to protected requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "session-1",
          lessonId: "lesson-1",
          kind: "VIDEO",
          url: "https://signed.example",
          urlExpiresAt: "2026-08-17T00:00:00.000Z",
          sessionExpiresAt: "2026-08-17T00:20:00.000Z",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new UniversityApi("https://api.example/", {
      getAccessToken: async () => "privy-token",
      wallet: "0x0000000000000000000000000000000000000001",
    });

    await api.startLearningSession("lesson-1");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/v1/lessons/lesson-1/learning-sessions", "https://api.example/"),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer privy-token");
    expect(headers.get("x-wallet-address")).toBe("0x0000000000000000000000000000000000000001");
  });

  it("posts teacher and admin workflow calls to the documented routes", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new UniversityApi("https://api.example/", {
      getAccessToken: async () => "privy-token",
      wallet: "0x0000000000000000000000000000000000000001",
    });

    await api.applyTeacher("statement");
    await api.teacherApplicationQueue();
    await api.reviewTeacherApplication("application-1", true);
    await api.submitCourse("course-1", {
      priceYD: "60",
      payoutWallet: "0x0000000000000000000000000000000000000001",
      certificateMetadataUri: "ipfs://Qm",
    });
    await api.createUploadSession("lesson-1", {
      kind: "VIDEO",
      fileName: "a.mp4",
      declaredMimeType: "video/mp4",
      sizeBytes: 10,
    });

    const paths = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(paths).toEqual([
      "https://api.example/v1/teacher-applications",
      "https://api.example/v1/teacher-applications/review-queue",
      "https://api.example/v1/teacher-applications/application-1/review",
      "https://api.example/v1/courses/course-1/submit",
      "https://api.example/v1/lessons/lesson-1/assets/upload-session",
    ]);
    const submitInit = fetchMock.mock.calls[3][1];
    expect(JSON.parse(submitInit.body)).toEqual({
      priceYD: "60",
      payoutWallet: "0x0000000000000000000000000000000000000001",
      certificateMetadataUri: "ipfs://Qm",
    });
  });

  it("routes comment workflow calls and omits parentId for top-level comments", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new UniversityApi("https://api.example/", {
      getAccessToken: async () => "privy-token",
      wallet: "0x0000000000000000000000000000000000000001",
    });

    await api.me();
    await api.createComment("course-1", "Great lesson");
    await api.createComment("course-1", "Teacher answer", "comment-1");
    await api.moderateComment("course-1", "comment-1", true, "spam");
    await api.commentReviewQueue();

    const paths = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(paths).toEqual([
      "https://api.example/v1/profile/me",
      "https://api.example/v1/courses/course-1/comments",
      "https://api.example/v1/courses/course-1/comments",
      "https://api.example/v1/courses/course-1/comments/comment-1/moderate",
      "https://api.example/v1/comments/review-queue",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ body: "Great lesson" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      body: "Teacher answer",
      parentId: "comment-1",
    });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ hidden: true, reason: "spam" });
  });

  it("routes learning session, heartbeat and document confirmation calls", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new UniversityApi("https://api.example/", {
      getAccessToken: async () => "privy-token",
      wallet: "0x0000000000000000000000000000000000000001",
    });

    await api.startLearningSession("lesson-1");
    await api.learningHeartbeat("session-1", 3, 42_000);
    await api.confirmDocumentRead("session-2");
    await api.courseProgress("course-1");

    const paths = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(paths).toEqual([
      "https://api.example/v1/lessons/lesson-1/learning-sessions",
      "https://api.example/v1/learning-sessions/session-1/heartbeats",
      "https://api.example/v1/learning-sessions/session-2/document-confirmation",
      "https://api.example/v1/courses/course-1/progress",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      sequence: 3,
      positionMs: 42_000,
    });
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  });

  it("raises an ApiRequestError with status and maps friendly messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response("{}", { status: 409 })),
    );
    const api = new UniversityApi("https://api.example/", {
      getAccessToken: async () => "privy-token",
      wallet: "0x0000000000000000000000000000000000000001",
    });

    const error = await api.reviewCourse("course-1", true).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(409);
    expect(apiErrorMessage(error)).toMatch(/冲突/);
  });
});
