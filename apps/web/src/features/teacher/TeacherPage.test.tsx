import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiTeacherLesson } from "../../lib/api";

const { runtimeMock, walletMock, apiMock } = vi.hoisted(() => ({
  runtimeMock: { isDemo: false, reason: "" },
  walletMock: {
    authenticated: true,
    address: "0x00000000000000000000000000000000000000aa",
  },
  apiMock: {
    available: true,
    me: vi.fn(),
    myTeacherApplications: vi.fn(),
    myCourses: vi.fn(),
    applyTeacher: vi.fn(),
    createCourse: vi.fn(),
    updateCourse: vi.fn(),
    addLesson: vi.fn(),
    submitCourse: vi.fn(),
    createUploadSession: vi.fn(),
    finalizeAsset: vi.fn(),
    retryAsset: vi.fn(),
    assetStatus: vi.fn(),
  },
}));

vi.mock("../../lib/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/runtime")>();
  return { ...actual, runtime: runtimeMock, useWalletSession: () => walletMock };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, useUniversityApi: () => apiMock };
});

import { TeacherPage } from "./TeacherPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeacherPage />
    </QueryClientProvider>,
  );
}

const draftCourse = {
  id: "course-1",
  title: "Draft Course",
  description: "A draft description",
  status: "DRAFT" as const,
  priceYD: null,
  requestedPriceYD: null,
  requestedPayoutWallet: null,
  certificateMetadataUri: null,
  updatedAt: "2026-08-16T00:00:00.000Z",
  lessons: [{ id: "lesson-1", title: "Lesson 1", position: 1, required: true, asset: null }],
};

describe("TeacherPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.isDemo = false;
    runtimeMock.reason = "";
    walletMock.authenticated = true;
    apiMock.me.mockResolvedValue({ userId: "teacher-1", role: "TEACHER" });
  });

  it("lets a student manage the application without requesting teacher-only courses", async () => {
    apiMock.me.mockResolvedValue({ userId: "student-1", role: "STUDENT" });
    apiMock.myTeacherApplications.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByLabelText(/教学陈述/)).toBeInTheDocument();
    expect(apiMock.myCourses).not.toHaveBeenCalled();
    expect(screen.queryByText("新建课程草稿")).not.toBeInTheDocument();
  });

  it("fails closed with a labelled notice in demo mode", async () => {
    runtimeMock.isDemo = true;
    runtimeMock.reason = "VITE_PRIVY_APP_ID is not configured";
    renderPage();
    expect(await screen.findByText(/演示模式/)).toBeInTheDocument();
    expect(apiMock.myCourses).not.toHaveBeenCalled();
  });

  it("submits the teacher application through the API", async () => {
    apiMock.myTeacherApplications.mockResolvedValue([]);
    apiMock.myCourses.mockResolvedValue([]);
    apiMock.applyTeacher.mockResolvedValue({ id: "application-1" });
    renderPage();

    const statement = await screen.findByLabelText(/教学陈述/);
    const submit = screen.getByRole("button", { name: "提交审核" });
    expect(submit).toBeDisabled();

    fireEvent.change(statement, {
      target: { value: "I teach Solidity security practices." },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(apiMock.applyTeacher).toHaveBeenCalledWith("I teach Solidity security practices."),
    );
  });

  it("keeps publication submission disabled until required lessons are READY", async () => {
    apiMock.myTeacherApplications.mockResolvedValue([
      {
        id: "application-1",
        userId: "user-1",
        statement: "Approved teaching statement.",
        status: "APPROVED",
        reviewedBy: "admin-1",
        reviewedAt: "2026-08-16T00:00:00.000Z",
        createdAt: "2026-08-16T00:00:00.000Z",
      },
    ]);
    apiMock.myCourses.mockResolvedValue([draftCourse]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "管理" }));

    const gate = await screen.findByRole("alert");
    expect(gate).toHaveTextContent("就绪（READY）的受保护资产");
    expect(screen.getByRole("button", { name: "提交发布申请" })).toBeDisabled();
  });
});

const approvedApplication = {
  id: "application-1",
  userId: "user-1",
  statement: "Approved teaching statement.",
  status: "APPROVED" as const,
  reviewedBy: "admin-1",
  reviewedAt: "2026-08-16T00:00:00.000Z",
  createdAt: "2026-08-16T00:00:00.000Z",
};

function assetFixture(
  id: string,
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED",
  failureCode: string | null,
) {
  return {
    id,
    kind: "VIDEO" as const,
    status,
    originalFileName: "clip.mp4",
    declaredMimeType: "video/mp4",
    detectedMimeType: status === "READY" ? "video/mp4" : null,
    sizeBytes: "1024",
    durationMs: status === "READY" ? 600_000 : null,
    sha256: null,
    captionsObjectKey: null,
    sourceObjectKey: `media/${id}`,
    failureCode,
    readyAt: status === "READY" ? "2026-08-17T00:00:00.000Z" : null,
  };
}

async function openDraftEditor(lessons: ApiTeacherLesson[]) {
  apiMock.myTeacherApplications.mockResolvedValue([approvedApplication]);
  apiMock.myCourses.mockResolvedValue([{ ...draftCourse, lessons }]);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "管理" }));
}

describe("Lesson asset upload and statuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.isDemo = false;
    runtimeMock.reason = "";
    walletMock.authenticated = true;
    apiMock.me.mockResolvedValue({ userId: "teacher-1", role: "TEACHER" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects unsupported file types before requesting an upload session", async () => {
    await openDraftEditor(draftCourse.lessons);
    const input = await screen.findByLabelText("为课时 Lesson 1 上传资产");
    const bad = new File(["payload"], "tool.exe", { type: "application/x-msdownload" });
    fireEvent.change(input, { target: { files: [bad] } });

    expect(await screen.findByText(/仅接受 MP4 视频/)).toBeInTheDocument();
    expect(apiMock.createUploadSession).not.toHaveBeenCalled();
  });

  it("uploads an MP4 through protected storage, finalizes it and tracks status to READY", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    apiMock.createUploadSession.mockResolvedValue({
      assetId: "asset-1",
      uploadUrl: "https://storage.example/put",
      requiredHeaders: { "x-amz-checksum-sha256": "abc" },
      expiresAt: "2026-08-17T01:00:00.000Z",
      status: "UPLOADING",
      version: 1,
    });
    apiMock.finalizeAsset.mockResolvedValue({
      assetId: "asset-1",
      status: "PROCESSING",
      version: 2,
    });
    const processingStatus = {
      assetId: "asset-1",
      kind: "VIDEO",
      originalFileName: "clip.mp4",
      declaredMimeType: "video/mp4",
      detectedMimeType: null,
      sizeBytes: "64",
      durationMs: null,
      status: "PROCESSING",
      uploadExpiresAt: null,
      processingStartedAt: "2026-08-17T00:00:00.000Z",
      readyAt: null,
      failureCode: null,
      version: 2,
    };
    apiMock.assetStatus.mockResolvedValue(processingStatus);
    await openDraftEditor(draftCourse.lessons);

    const input = await screen.findByLabelText("为课时 Lesson 1 上传资产");
    const clip = new File([new Uint8Array(64)], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [clip] } });

    await waitFor(() =>
      expect(apiMock.createUploadSession).toHaveBeenCalledWith("lesson-1", {
        kind: "VIDEO",
        fileName: "clip.mp4",
        declaredMimeType: "video/mp4",
        sizeBytes: 64,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.example/put",
      expect.objectContaining({ method: "PUT", body: clip }),
    );
    await waitFor(() => expect(apiMock.finalizeAsset).toHaveBeenCalledWith("asset-1"));
    expect(await screen.findByText(/已开始处理/)).toBeInTheDocument();

    // The status poll flips to READY and refreshes the course list through onChanged.
    await waitFor(() => expect(apiMock.assetStatus).toHaveBeenCalledWith("asset-1"));
    const callsBeforeReady = apiMock.myCourses.mock.calls.length;
    apiMock.assetStatus.mockResolvedValue({
      ...processingStatus,
      status: "READY",
      detectedMimeType: "video/mp4",
      durationMs: 600_000,
      readyAt: "2026-08-17T00:05:00.000Z",
      version: 3,
    });
    await waitFor(
      () => expect(apiMock.myCourses.mock.calls.length).toBeGreaterThan(callsBeforeReady),
      { timeout: 5_000 },
    );
  });

  it("shows UPLOADING, PROCESSING and READY rows and offers retry only for processing failures", async () => {
    apiMock.retryAsset.mockResolvedValue({ assetId: "asset-fail", status: "PROCESSING" });
    await openDraftEditor([
      {
        id: "l-up",
        title: "Uploading lesson",
        position: 1,
        required: true,
        asset: assetFixture("asset-up", "UPLOADING", null),
      },
      {
        id: "l-proc",
        title: "Processing lesson",
        position: 2,
        required: true,
        asset: assetFixture("asset-proc", "PROCESSING", null),
      },
      {
        id: "l-ready",
        title: "Ready lesson",
        position: 3,
        required: true,
        asset: assetFixture("asset-ready", "READY", null),
      },
      {
        id: "l-fail",
        title: "Failed lesson",
        position: 4,
        required: true,
        asset: assetFixture("asset-fail", "FAILED", "PROBE_FAILED"),
      },
      {
        id: "l-upfail",
        title: "Upload-failed lesson",
        position: 5,
        required: true,
        asset: assetFixture("asset-upfail", "FAILED", "UPLOAD_TIMEOUT"),
      },
    ]);

    expect(await screen.findByText("Uploading lesson")).toBeInTheDocument();
    expect(screen.getAllByText("上传中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("处理中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("就绪").length).toBeGreaterThan(0);
    expect(screen.getAllByText("失败").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/视频验真失败（PROBE_FAILED）/)).toBeInTheDocument();
    expect(screen.getByText(/处理失败（诊断码：UPLOAD_TIMEOUT）/)).toBeInTheDocument();

    // UPLOAD_-prefixed failures require a fresh upload, so only PROBE_FAILED is retryable.
    const retryButtons = screen.getAllByRole("button", { name: "重试处理" });
    expect(retryButtons).toHaveLength(1);
    fireEvent.click(retryButtons[0]);
    await waitFor(() => expect(apiMock.retryAsset).toHaveBeenCalledWith("asset-fail"));
  });
});
