import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

    expect(await screen.findByLabelText(/Teaching statement/)).toBeInTheDocument();
    expect(apiMock.myCourses).not.toHaveBeenCalled();
    expect(screen.queryByText("New course draft")).not.toBeInTheDocument();
  });

  it("fails closed with a labelled notice in demo mode", async () => {
    runtimeMock.isDemo = true;
    runtimeMock.reason = "VITE_PRIVY_APP_ID is not configured";
    renderPage();
    expect(await screen.findByText(/Demo mode/)).toBeInTheDocument();
    expect(apiMock.myCourses).not.toHaveBeenCalled();
  });

  it("submits the teacher application through the API", async () => {
    apiMock.myTeacherApplications.mockResolvedValue([]);
    apiMock.myCourses.mockResolvedValue([]);
    apiMock.applyTeacher.mockResolvedValue({ id: "application-1" });
    renderPage();

    const statement = await screen.findByLabelText(/Teaching statement/);
    const submit = screen.getByRole("button", { name: "Submit for review" });
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

    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));

    const gate = await screen.findByRole("alert");
    expect(gate).toHaveTextContent("READY protected asset");
    expect(screen.getByRole("button", { name: "Submit publication request" })).toBeDisabled();
  });
});
