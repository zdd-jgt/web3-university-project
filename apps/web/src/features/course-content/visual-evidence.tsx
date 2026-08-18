import { createRoot } from "react-dom/client";
import type { ApiLearningSession, UniversityApi } from "../../lib/api";
import "../../styles.css";
import { DocumentLesson } from "./DocumentLesson";
import { VideoLessonPlayer } from "./VideoLessonPlayer";

const expiresInMs = (milliseconds: number) => new Date(Date.now() + milliseconds).toISOString();

const evidence = {
  sessionStarts: 0,
  latestSessionId: null as string | null,
};

declare global {
  interface Window {
    __t005Evidence: typeof evidence;
  }
}

window.__t005Evidence = evidence;

const sessions: Record<string, ApiLearningSession> = {
  "visual-document": {
    sessionId: "visual-document-session",
    lessonId: "visual-document",
    kind: "DOCUMENT",
    url: "data:application/pdf;base64,JVBERi0xLjQK",
    urlExpiresAt: expiresInMs(5 * 60_000),
    sessionExpiresAt: expiresInMs(20 * 60_000),
  },
};

const visualApi = {
  startLearningSession: async (lessonId: string) => {
    if (lessonId !== "visual-video") return sessions[lessonId];
    evidence.sessionStarts += 1;
    evidence.latestSessionId = `visual-video-session-${evidence.sessionStarts}`;
    return {
      sessionId: evidence.latestSessionId,
      lessonId,
      kind: "VIDEO" as const,
      // The first credential renews after about 8 seconds (38s TTL - 30s lead).
      // Query parameters model distinct signed URLs while Vite serves the same local MP4 bytes.
      url: `http://127.0.0.1:4174/learning-evidence.mp4?session=${evidence.sessionStarts}`,
      urlExpiresAt: expiresInMs(evidence.sessionStarts === 1 ? 38_000 : 5 * 60_000),
      sessionExpiresAt: expiresInMs(20 * 60_000),
    };
  },
  learningHeartbeat: async () => ({
    replayed: false,
    accepted: true,
    lessonComplete: false,
    completion: null,
  }),
  confirmDocumentRead: async () => ({ lessonCompletionId: "visual", completion: null }),
} as unknown as UniversityApi;

function LearningContentVisualEvidence() {
  return (
    <main className="page">
      <header className="page-intro">
        <p className="eyebrow">T-005 LOCAL COMPONENT EVIDENCE</p>
        <h1>Protected course content</h1>
        <p>
          Actual learning components rendered with deterministic local sessions. Behavior and
          renewal recovery are verified separately by component tests.
        </p>
      </header>
      <section className="grid two">
        <article className="card">
          <p className="eyebrow">VIDEO LESSON</p>
          <h2>Introduction to contract state</h2>
          <VideoLessonPlayer
            api={visualApi}
            lessonId="visual-video"
            complete={false}
            onProgressChanged={() => undefined}
          />
        </article>
        <article className="card">
          <DocumentLesson
            api={visualApi}
            lessonId="visual-document"
            fileName="Course safety guide.pdf"
            mimeType="application/pdf"
            complete={false}
            onProgressChanged={() => undefined}
          />
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <LearningContentVisualEvidence />,
);
