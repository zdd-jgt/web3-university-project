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
    teacherApplicationQueue: vi.fn(),
    reviewTeacherApplication: vi.fn(),
    courseReviewQueue: vi.fn(),
    reviewCourse: vi.fn(),
    publicationPackage: vi.fn(),
    commentReviewQueue: vi.fn(),
    moderateComment: vi.fn(),
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

import { AdminPage } from "./AdminPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.isDemo = false;
    runtimeMock.reason = "";
    walletMock.authenticated = true;
    apiMock.me.mockResolvedValue({ userId: "admin-1", role: "ADMIN" });
    apiMock.commentReviewQueue.mockResolvedValue([]);
  });

  it("does not request admin queues for an authenticated non-admin", async () => {
    apiMock.me.mockResolvedValue({ userId: "student-1", role: "STUDENT" });
    renderPage();

    expect(await screen.findByText(/not authorized for the admin console/i)).toBeInTheDocument();
    expect(apiMock.teacherApplicationQueue).not.toHaveBeenCalled();
    expect(apiMock.courseReviewQueue).not.toHaveBeenCalled();
    expect(apiMock.commentReviewQueue).not.toHaveBeenCalled();
  });

  it("fails closed with a labelled notice in demo mode", async () => {
    runtimeMock.isDemo = true;
    runtimeMock.reason = "VITE_SEPOLIA_RPC_URL is not configured";
    renderPage();
    expect(await screen.findByText(/Demo mode/)).toBeInTheDocument();
    expect(apiMock.teacherApplicationQueue).not.toHaveBeenCalled();
  });

  it("reviews a pending teacher application through the API", async () => {
    apiMock.teacherApplicationQueue.mockResolvedValue([
      {
        id: "application-1",
        userId: "user-7",
        statement: "I teach DeFi protocol design and audits.",
        status: "PENDING",
        reviewedBy: null,
        reviewedAt: null,
        createdAt: "2026-08-16T00:00:00.000Z",
      },
    ]);
    apiMock.courseReviewQueue.mockResolvedValue([]);
    apiMock.reviewTeacherApplication.mockResolvedValue({ id: "application-1" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(apiMock.reviewTeacherApplication).toHaveBeenCalledWith("application-1", true),
    );
  });

  it("approves a course submission and surfaces the onchain publication package", async () => {
    apiMock.teacherApplicationQueue.mockResolvedValue([]);
    apiMock.courseReviewQueue.mockResolvedValue([
      {
        id: "course-1",
        title: "A practical ERC-20",
        teacherId: "user-7",
        status: "PENDING_REVIEW",
        requestedPriceYD: "60000000000000000000",
        requestedPayoutWallet: "0x0000000000000000000000000000000000000007",
        submissionHash: "0xabc123",
        certificateMetadataUri: "ipfs://QmTest",
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: "2026-08-16T00:00:00.000Z",
      },
    ]);
    apiMock.reviewCourse.mockResolvedValue({
      course: { id: "course-1", status: "APPROVED" },
      onchainConfig: {
        chainId: 11155111,
        catalogAddress: "0x0000000000000000000000000000000000000001",
        functionName: "configureCourse",
        args: [
          "42",
          "60000000000000000000",
          "0x0000000000000000000000000000000000000007",
          "0xabc123",
        ],
      },
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Approve submission" }));
    await waitFor(() => expect(apiMock.reviewCourse).toHaveBeenCalledWith("course-1", true));
    expect(await screen.findByText("ONCHAIN PUBLICATION PACKAGE")).toBeInTheDocument();
  });

  it("hides a visible comment with a moderation reason through the API", async () => {
    apiMock.teacherApplicationQueue.mockResolvedValue([]);
    apiMock.courseReviewQueue.mockResolvedValue([]);
    apiMock.commentReviewQueue.mockResolvedValue([
      {
        id: "comment-9",
        body: "Buy my tokens",
        createdAt: "2026-08-16T00:00:00.000Z",
        authorId: "user-3",
        parentId: null,
        courseId: "course-1",
        courseTitle: "A practical ERC-20",
        hidden: false,
        moderatedBy: null,
        moderationReason: null,
      },
    ]);
    apiMock.moderateComment.mockResolvedValue({
      id: "comment-9",
      deletedAt: "2026-08-16T01:00:00.000Z",
      moderatedBy: "admin-1",
      moderationReason: "spam",
    });
    renderPage();

    fireEvent.change(await screen.findByLabelText("Moderation reason"), {
      target: { value: "spam" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() =>
      expect(apiMock.moderateComment).toHaveBeenCalledWith("course-1", "comment-9", true, "spam"),
    );
  });

  it("refuses to moderate without a reason", async () => {
    apiMock.teacherApplicationQueue.mockResolvedValue([]);
    apiMock.courseReviewQueue.mockResolvedValue([]);
    apiMock.commentReviewQueue.mockResolvedValue([
      {
        id: "comment-9",
        body: "Buy my tokens",
        createdAt: "2026-08-16T00:00:00.000Z",
        authorId: "user-3",
        parentId: null,
        courseId: "course-1",
        courseTitle: "A practical ERC-20",
        hidden: false,
        moderatedBy: null,
        moderationReason: null,
      },
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Hide" }));
    expect(
      await screen.findByText(/moderation reason of at least 3 characters/),
    ).toBeInTheDocument();
    expect(apiMock.moderateComment).not.toHaveBeenCalled();
  });
});
