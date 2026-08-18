import { ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Status } from "../../components/ui";
import { apiErrorMessage, type UniversityApi } from "../../lib/api";
import { useLearningSession } from "./useLearningSession";

export function DocumentLesson({
  api,
  lessonId,
  fileName,
  mimeType,
  complete,
  onProgressChanged,
}: {
  api: UniversityApi;
  lessonId: string;
  fileName: string;
  mimeType: string | null;
  complete: boolean;
  onProgressChanged: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const { session, phase, error, renewalError, retry } = useLearningSession(api, lessonId, {
    onSessionChanged: () => setConfirmError(null),
  });

  const onProgressRef = useRef(onProgressChanged);
  onProgressRef.current = onProgressChanged;

  async function confirmRead() {
    if (!session) return;
    setConfirmError(null);
    setConfirming(true);
    try {
      await api.confirmDocumentRead(session.sessionId);
      onProgressRef.current();
    } catch (caught) {
      setConfirmError(apiErrorMessage(caught));
    } finally {
      setConfirming(false);
    }
  }

  if (phase === "failed") {
    return (
      <div className="video-shell" role="alert">
        <span>Document access session unavailable</span>
        <small>{error ?? "The server rejected the access session."}</small>
        <Button type="button" onClick={() => retry()}>
          Retry document access
        </Button>
      </div>
    );
  }

  if (phase === "starting" || !session) {
    return (
      <div className="video-shell">
        <span>Opening document access session…</span>
        <small>The server verifies your purchase before signing a short-lived read URL.</small>
      </div>
    );
  }

  return (
    <div className="document-lesson">
      <div className="row spread">
        <div>
          <p className="eyebrow">PROTECTED DOCUMENT</p>
          <h2>{fileName}</h2>
          <p className="muted">{mimeType ?? "Verified MIME type unavailable"}</p>
        </div>
        <Status tone={complete ? "success" : "neutral"}>
          {complete ? "Read confirmed" : "Awaiting confirmation"}
        </Status>
      </div>
      <p>
        Open the document with your short-lived access link, then confirm you have read it. Opening
        the link alone does not complete the lesson, and the confirmation is idempotent.
      </p>
      <div className="button-row">
        <a
          className="button secondary"
          href={session.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpened(true)}
        >
          Open document <ExternalLink size={13} />
        </a>
        <Button
          type="button"
          disabled={!opened || confirming || complete}
          onClick={() => void confirmRead()}
        >
          {complete
            ? "Lesson complete"
            : confirming
              ? "Confirming…"
              : "Confirm I have read this document"}
        </Button>
      </div>
      <p className="fine-print">
        Access link expires {new Date(session.urlExpiresAt).toLocaleTimeString()}. Confirmation
        without a successful access is rejected by the server.
      </p>
      {renewalError && (
        <p className="fine-print" role="status">
          Access refresh is retrying. The current document link remains available ({renewalError}).
        </p>
      )}
      {confirmError && (
        <p className="error" role="alert">
          {confirmError}
        </p>
      )}
    </div>
  );
}
