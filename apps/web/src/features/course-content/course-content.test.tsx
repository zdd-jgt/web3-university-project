import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    available: true,
    startLearningSession: vi.fn(),
    learningHeartbeat: vi.fn(),
    confirmDocumentRead: vi.fn(),
  },
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, useUniversityApi: () => apiMock };
});

import { DocumentLesson } from "./DocumentLesson";
import { VideoLessonPlayer } from "./VideoLessonPlayer";

function renderPlayer(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

// Expiries stay safely in the future so background renewal timers never fire during
// tests that do not exercise renewal explicitly.
const videoSession = {
  sessionId: "session-1",
  lessonId: "lesson-1",
  kind: "VIDEO" as const,
  url: "https://signed.example/video.mp4",
  urlExpiresAt: new Date(Date.now() + 600_000).toISOString(),
  sessionExpiresAt: new Date(Date.now() + 1_200_000).toISOString(),
};

const documentSession = {
  ...videoSession,
  sessionId: "session-2",
  lessonId: "lesson-2",
  kind: "DOCUMENT" as const,
  url: "https://signed.example/doc.pdf",
};

describe("VideoLessonPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a learning session and reports heartbeats with increasing sequences", async () => {
    apiMock.startLearningSession.mockResolvedValue(videoSession);
    apiMock.learningHeartbeat.mockResolvedValue({
      replayed: false,
      accepted: true,
      eventId: "event-1",
      coveredMs: 42_000,
      lessonComplete: false,
      completion: null,
    });
    const onProgressChanged = vi.fn();
    renderPlayer(
      <VideoLessonPlayer
        api={apiMock as never}
        lessonId="lesson-1"
        complete={false}
        onProgressChanged={onProgressChanged}
      />,
    );

    const video = await screen
      .findByText(/你的浏览器不支持受保护的视频播放/)
      .then(() => document.querySelector("video"));
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("https://signed.example/video.mp4");
    expect(apiMock.startLearningSession).toHaveBeenCalledWith("lesson-1");

    if (video) video.currentTime = 42;
    fireEvent.play(video as Element);
    await waitFor(() =>
      expect(apiMock.learningHeartbeat).toHaveBeenCalledWith("session-1", 1, 42_000),
    );
    expect(onProgressChanged).toHaveBeenCalled();

    if (video) video.currentTime = 52;
    fireEvent.pause(video as Element);
    await waitFor(() =>
      expect(apiMock.learningHeartbeat).toHaveBeenCalledWith("session-1", 2, 52_000),
    );
  });

  it("explains a server-rejected heartbeat in Chinese while retaining its diagnostic code", async () => {
    apiMock.startLearningSession.mockResolvedValue(videoSession);
    apiMock.learningHeartbeat.mockResolvedValue({
      replayed: false,
      accepted: false,
      reason: "SEEK",
      eventId: "event-rejected",
      coveredMs: 0,
      lessonComplete: false,
      completion: null,
    });
    renderPlayer(
      <VideoLessonPlayer
        api={apiMock as never}
        lessonId="lesson-1"
        complete={false}
        onProgressChanged={vi.fn()}
      />,
    );

    const video = await screen
      .findByText(/你的浏览器不支持受保护的视频播放/)
      .then(() => document.querySelector("video"));
    fireEvent.play(video as Element);

    expect(await screen.findByText(/检测到跳播，本次不计入进度（SEEK）/)).toBeInTheDocument();
  });

  it("recovers through an explicit resume after a rejected heartbeat", async () => {
    apiMock.startLearningSession.mockResolvedValue(videoSession);
    apiMock.learningHeartbeat.mockRejectedValue(new Error("conflict"));
    renderPlayer(
      <VideoLessonPlayer
        api={apiMock as never}
        lessonId="lesson-1"
        complete={false}
        onProgressChanged={vi.fn()}
      />,
    );

    const video = await screen
      .findByText(/你的浏览器不支持受保护的视频播放/)
      .then(() => document.querySelector("video"));
    fireEvent.play(video as Element);
    expect(await screen.findByText(/播放会话不可用/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "恢复学习会话" }));

    apiMock.learningHeartbeat.mockResolvedValue({
      replayed: false,
      accepted: true,
      completion: null,
    });
    apiMock.startLearningSession.mockResolvedValue({ ...videoSession, sessionId: "session-9" });
    fireEvent.click(screen.getByRole("button", { name: "恢复学习会话" }));
    await waitFor(() => expect(apiMock.startLearningSession).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/播放会话不可用/)).not.toBeInTheDocument();
  });

  it("creates exactly one learning session under React StrictMode", async () => {
    apiMock.startLearningSession.mockResolvedValue(videoSession);
    renderPlayer(
      <StrictMode>
        <VideoLessonPlayer
          api={apiMock as never}
          lessonId="lesson-1"
          complete={false}
          onProgressChanged={vi.fn()}
        />
      </StrictMode>,
    );

    const video = await screen
      .findByText(/你的浏览器不支持受保护的视频播放/)
      .then(() => document.querySelector("video"));
    expect(video?.getAttribute("src")).toBe("https://signed.example/video.mp4");
    // StrictMode re-runs mount effects; the single-flight guard keeps the POST to one.
    await waitFor(() => expect(apiMock.startLearningSession).toHaveBeenCalledTimes(1));
  });

  it("keeps the current lesson session when responses arrive out of order", async () => {
    let resolveStale: (value: typeof videoSession) => void = () => {};
    const stale = new Promise<typeof videoSession>((resolve) => {
      resolveStale = resolve;
    });
    apiMock.startLearningSession.mockReturnValueOnce(stale).mockResolvedValue({
      ...videoSession,
      sessionId: "session-2",
      lessonId: "lesson-2",
      url: "https://signed.example/video-2.mp4",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <VideoLessonPlayer
          api={apiMock as never}
          lessonId="lesson-1"
          complete={false}
          onProgressChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(apiMock.startLearningSession).toHaveBeenCalledTimes(1));

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <VideoLessonPlayer
          api={apiMock as never}
          lessonId="lesson-2"
          complete={false}
          onProgressChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(document.querySelector("video")?.getAttribute("src")).toBe(
        "https://signed.example/video-2.mp4",
      ),
    );

    // The late lesson-1 response arrives after the switch; it must be discarded.
    resolveStale(videoSession);
    await waitFor(() => expect(apiMock.startLearningSession).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector("video")?.getAttribute("src")).toBe(
      "https://signed.example/video-2.mp4",
    );
  });

  it("stops heartbeats once the server reports the lesson complete", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T09:00:00.000Z"));
    try {
      apiMock.startLearningSession
        .mockResolvedValueOnce({
          ...videoSession,
          urlExpiresAt: "2026-08-17T09:10:00.000Z",
          sessionExpiresAt: "2026-08-17T09:20:00.000Z",
        })
        .mockResolvedValueOnce({
          ...videoSession,
          sessionId: "session-2",
          url: "https://signed.example/video-renewed.mp4",
          urlExpiresAt: "2026-08-17T09:20:00.000Z",
          sessionExpiresAt: "2026-08-17T09:30:00.000Z",
        });
      apiMock.learningHeartbeat.mockResolvedValue({
        replayed: false,
        accepted: true,
        eventId: "event-1",
        coveredMs: 570_000,
        lessonComplete: true,
        completion: { id: "completion-1", status: "PENDING" },
      });
      renderPlayer(
        <VideoLessonPlayer
          api={apiMock as never}
          lessonId="lesson-1"
          complete={false}
          onProgressChanged={vi.fn()}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
      if (video) video.currentTime = 42;
      fireEvent.play(video as Element);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(apiMock.learningHeartbeat).toHaveBeenCalledTimes(1);
      expect(screen.getByText("课时已完成")).toBeInTheDocument();

      // Playback keeps going, including through a credential renewal, but no further heartbeat
      // may leave and the local completion fact must not be reset.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(570_000);
      });
      expect(apiMock.startLearningSession).toHaveBeenCalledTimes(2);
      expect(apiMock.learningHeartbeat).toHaveBeenCalledTimes(1);
      expect(screen.getByText("课时已完成")).toBeInTheDocument();
      expect(screen.queryByText(/播放会话不可用/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renews before expiry, restores playback position and starts a fresh sequence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T09:00:00.000Z"));
    try {
      apiMock.learningHeartbeat.mockResolvedValue({
        replayed: false,
        accepted: true,
        lessonComplete: false,
        completion: null,
      });
      apiMock.startLearningSession
        .mockResolvedValueOnce({
          ...videoSession,
          urlExpiresAt: "2026-08-17T09:01:00.000Z",
          sessionExpiresAt: "2026-08-17T09:20:00.000Z",
        })
        .mockResolvedValueOnce({
          ...videoSession,
          sessionId: "session-2",
          url: "https://signed.example/video-renewed.mp4",
          urlExpiresAt: "2026-08-17T09:11:00.000Z",
          sessionExpiresAt: "2026-08-17T09:30:00.000Z",
        });
      renderPlayer(
        <VideoLessonPlayer
          api={apiMock as never}
          lessonId="lesson-1"
          complete={false}
          onProgressChanged={vi.fn()}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(document.querySelector("video")?.getAttribute("src")).toBe(
        "https://signed.example/video.mp4",
      );
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
      const resume = vi.fn().mockResolvedValue(undefined);
      if (video) {
        Object.defineProperty(video, "play", { configurable: true, value: resume });
        video.currentTime = 42;
        fireEvent.play(video);
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // 60s URL lifetime minus the 30s renewal lead triggers renewal at t+30s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(apiMock.startLearningSession).toHaveBeenCalledTimes(2);
      expect(document.querySelector("video")?.getAttribute("src")).toBe(
        "https://signed.example/video-renewed.mp4",
      );
      if (video) {
        // jsdom does not perform the browser media reload, so reset to zero to model it explicitly.
        video.currentTime = 0;
        fireEvent.loadedMetadata(video);
        expect(video.currentTime).toBe(42);
      }
      expect(resume).toHaveBeenCalledTimes(1);

      // The renewed session starts a fresh heartbeat sequence on the new sessionId.
      apiMock.learningHeartbeat.mockClear();
      if (video) video.currentTime = 47;
      fireEvent.play(video as Element);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(apiMock.learningHeartbeat).toHaveBeenCalledTimes(1);
      expect(apiMock.learningHeartbeat).toHaveBeenCalledWith("session-2", 1, 47_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the current player while a failed renewal retries automatically", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T09:00:00.000Z"));
    try {
      apiMock.startLearningSession
        .mockResolvedValueOnce({
          ...videoSession,
          urlExpiresAt: "2026-08-17T09:01:00.000Z",
          sessionExpiresAt: "2026-08-17T09:20:00.000Z",
        })
        .mockRejectedValueOnce(new Error("renewal rejected"))
        .mockResolvedValue({
          ...videoSession,
          sessionId: "session-3",
          url: "https://signed.example/video-3.mp4",
          urlExpiresAt: "2026-08-17T09:21:00.000Z",
          sessionExpiresAt: "2026-08-17T09:40:00.000Z",
        });
      renderPlayer(
        <VideoLessonPlayer
          api={apiMock as never}
          lessonId="lesson-1"
          complete={false}
          onProgressChanged={vi.fn()}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(screen.getByText(/正在重试刷新访问凭证/)).toBeInTheDocument();
      expect(document.querySelector("video")?.getAttribute("src")).toBe(
        "https://signed.example/video.mp4",
      );
      expect(screen.queryByText(/播放会话不可用/)).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(apiMock.startLearningSession).toHaveBeenCalledTimes(3);
      expect(document.querySelector("video")?.getAttribute("src")).toBe(
        "https://signed.example/video-3.mp4",
      );
      expect(screen.queryByText(/播放会话不可用/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let a hanging old-session heartbeat block the renewed session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T09:00:00.000Z"));
    try {
      let resolveOld: (value: {
        replayed: boolean;
        accepted: boolean;
        lessonComplete: boolean;
        completion: null;
      }) => void = () => {};
      const oldHeartbeat = new Promise<{
        replayed: boolean;
        accepted: boolean;
        lessonComplete: boolean;
        completion: null;
      }>((resolve) => {
        resolveOld = resolve;
      });
      apiMock.startLearningSession
        .mockResolvedValueOnce({
          ...videoSession,
          urlExpiresAt: "2026-08-17T09:01:00.000Z",
        })
        .mockResolvedValueOnce({
          ...videoSession,
          sessionId: "session-2",
          url: "https://signed.example/video-renewed.mp4",
          urlExpiresAt: "2026-08-17T09:11:00.000Z",
        });
      apiMock.learningHeartbeat.mockReturnValueOnce(oldHeartbeat).mockResolvedValue({
        replayed: false,
        accepted: true,
        lessonComplete: false,
        completion: null,
      });
      renderPlayer(
        <VideoLessonPlayer
          api={apiMock as never}
          lessonId="lesson-1"
          complete={false}
          onProgressChanged={vi.fn()}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
      if (video) video.currentTime = 10;
      fireEvent.play(video as Element);
      expect(apiMock.learningHeartbeat).toHaveBeenCalledWith("session-1", 1, 10_000);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      if (video) video.currentTime = 15;
      fireEvent.play(video as Element);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(apiMock.learningHeartbeat).toHaveBeenCalledWith("session-2", 1, 15_000);

      resolveOld({ replayed: false, accepted: true, lessonComplete: false, completion: null });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.queryByText(/播放会话不可用/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("DocumentLesson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires opening the document before the confirmation can be sent", async () => {
    apiMock.startLearningSession.mockResolvedValue(documentSession);
    apiMock.confirmDocumentRead.mockResolvedValue({
      lessonCompletionId: "completion-1",
      completion: null,
    });
    const onProgressChanged = vi.fn();
    renderPlayer(
      <DocumentLesson
        api={apiMock as never}
        lessonId="lesson-2"
        fileName="Protocol notes"
        mimeType="application/pdf"
        complete={false}
        onProgressChanged={onProgressChanged}
      />,
    );

    const confirm = await screen.findByRole("button", {
      name: "确认我已阅读该文档",
    });
    expect(confirm).toBeDisabled();
    const openLink = screen.getByRole("link", { name: /打开文档/ });
    expect(openLink).toHaveAttribute("href", "https://signed.example/doc.pdf");

    fireEvent.click(openLink);
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(apiMock.confirmDocumentRead).toHaveBeenCalledWith("session-2"));
    expect(onProgressChanged).toHaveBeenCalled();
  });

  it("shows a labelled failure with retry when the access session cannot start", async () => {
    apiMock.startLearningSession.mockRejectedValue(new Error("forbidden"));
    renderPlayer(
      <DocumentLesson
        api={apiMock as never}
        lessonId="lesson-2"
        fileName="Protocol notes"
        mimeType="application/pdf"
        complete={false}
        onProgressChanged={vi.fn()}
      />,
    );

    expect(await screen.findByText(/文档访问会话不可用/)).toBeInTheDocument();
    apiMock.startLearningSession.mockResolvedValue(documentSession);
    fireEvent.click(screen.getByRole("button", { name: "重试文档访问" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认我已阅读该文档" })));
  });

  it("creates exactly one access session under React StrictMode", async () => {
    apiMock.startLearningSession.mockResolvedValue(documentSession);
    renderPlayer(
      <StrictMode>
        <DocumentLesson
          api={apiMock as never}
          lessonId="lesson-2"
          fileName="Protocol notes"
          mimeType="application/pdf"
          complete={false}
          onProgressChanged={vi.fn()}
        />
      </StrictMode>,
    );

    await screen.findByRole("button", { name: "确认我已阅读该文档" });
    await waitFor(() => expect(apiMock.startLearningSession).toHaveBeenCalledTimes(1));
  });
});
