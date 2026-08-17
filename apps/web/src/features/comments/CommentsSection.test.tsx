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
    comments: vi.fn(),
    createComment: vi.fn(),
    me: vi.fn(),
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

import { CommentsSection } from "./CommentsSection";

function renderSection(teacherId = "teacher-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommentsSection courseId="course-1" teacherId={teacherId} />
    </QueryClientProvider>,
  );
}

const thread = {
  id: "comment-1",
  body: "How are replay attacks prevented?",
  createdAt: "2026-08-16T00:00:00.000Z",
  authorId: "user-2",
  replies: [
    {
      id: "comment-2",
      body: "With nonces and chain-scoped domains.",
      createdAt: "2026-08-16T01:00:00.000Z",
      authorId: "teacher-1",
    },
  ],
};

describe("CommentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.isDemo = false;
    runtimeMock.reason = "";
    walletMock.authenticated = true;
  });

  it("shows comments for everyone but disables posting in demo mode", async () => {
    runtimeMock.isDemo = true;
    runtimeMock.reason = "VITE_SEPOLIA_RPC_URL is not configured";
    apiMock.comments.mockResolvedValue([thread]);
    renderSection();

    expect(await screen.findByText("How are replay attacks prevented?")).toBeInTheDocument();
    expect(screen.getByText(/Demo mode: posting is disabled/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post comment" })).not.toBeInTheDocument();
  });

  it("posts a comment through the API for an authenticated purchaser", async () => {
    apiMock.comments.mockResolvedValue([thread]);
    apiMock.me.mockResolvedValue({ userId: "user-2", role: "STUDENT" });
    apiMock.createComment.mockResolvedValue({
      id: "comment-3",
      body: "Follow-up",
      authorId: "user-2",
      createdAt: "2026-08-16T02:00:00.000Z",
    });
    renderSection();

    const box = await screen.findByLabelText("Add a comment");
    fireEvent.change(box, { target: { value: "Follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await waitFor(() =>
      expect(apiMock.createComment).toHaveBeenCalledWith("course-1", "Follow-up"),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Comment posted.");
  });

  it("offers a reply form only to the course teacher and sends the parent id", async () => {
    apiMock.comments.mockResolvedValue([thread]);
    apiMock.me.mockResolvedValue({ userId: "teacher-1", role: "TEACHER" });
    apiMock.createComment.mockResolvedValue({
      id: "comment-4",
      body: "Clarified",
      authorId: "teacher-1",
      createdAt: "2026-08-16T03:00:00.000Z",
    });
    renderSection("teacher-1");

    expect(await screen.findByText("Teacher")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Reply as teacher" }));
    fireEvent.change(screen.getByLabelText("Teacher reply"), {
      target: { value: "Clarified in lesson 3." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() =>
      expect(apiMock.createComment).toHaveBeenCalledWith(
        "course-1",
        "Clarified in lesson 3.",
        "comment-1",
      ),
    );
  });

  it("hides the reply affordance from non-teacher sessions", async () => {
    apiMock.comments.mockResolvedValue([thread]);
    apiMock.me.mockResolvedValue({ userId: "user-2", role: "STUDENT" });
    renderSection("teacher-1");

    expect(await screen.findByText("How are replay attacks prevented?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply as teacher" })).not.toBeInTheDocument();
  });
});
