import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Status } from "../../components/ui";
import { apiErrorMessage, type UniversityApi } from "../../lib/api";
import { useLearningSession } from "./useLearningSession";

const HEARTBEAT_INTERVAL_MS = 10_000;

export function VideoLessonPlayer({
  api,
  lessonId,
  complete,
  onProgressChanged,
}: {
  api: UniversityApi;
  lessonId: string;
  complete: boolean;
  onProgressChanged: () => void;
}) {
  const [heartbeatRejected, setHeartbeatRejected] = useState<string | null>(null);
  const [lessonDone, setLessonDone] = useState(false);
  const [lost, setLost] = useState<string | null>(null);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sequenceRef = useRef(0);
  const inFlightRef = useRef<{ sessionId: string } | null>(null);
  const playingRef = useRef(false);
  const playbackHandoffRef = useRef<{ position: number; shouldPlay: boolean } | null>(null);
  const capturePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    playbackHandoffRef.current = {
      position: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      shouldPlay: playingRef.current,
    };
  }, []);
  const { session, phase, error, renewalError, retry } = useLearningSession(api, lessonId, {
    onBeforeSessionRenew: capturePlayback,
    onSessionChanged: () => {
      // Each new server session owns an independent heartbeat sequence. Lesson completion is
      // intentionally not reset here because credential renewal must not undo a completed lesson.
      sequenceRef.current = 0;
      setHeartbeatRejected(null);
      setLost(null);
    },
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const doneRef = useRef(false);
  doneRef.current = lessonDone || complete;
  const onProgressRef = useRef(onProgressChanged);
  onProgressRef.current = onProgressChanged;

  const sendHeartbeat = useCallback(async () => {
    const active = sessionRef.current;
    const video = videoRef.current;
    if (!active || !video || inFlightRef.current?.sessionId === active.sessionId || doneRef.current)
      return;
    const target = active.sessionId;
    inFlightRef.current = { sessionId: target };
    const sequence = sequenceRef.current + 1;
    const positionMs = Math.floor(video.currentTime * 1000);
    try {
      const result = await api.learningHeartbeat(target, sequence, positionMs);
      // A superseded session's verdict is stale and must not touch current state.
      if (sessionRef.current?.sessionId !== target) return;
      sequenceRef.current = sequence;
      setHeartbeatRejected(result.accepted ? null : (result.reason ?? "rejected"));
      if (result.accepted) {
        onProgressRef.current();
        // Server-authoritative completion (95% coverage): heartbeats stop immediately.
        if (result.lessonComplete) setLessonDone(true);
      }
    } catch (caught) {
      // A finished lesson or a superseded session must never surface a stale session error.
      if (doneRef.current || sessionRef.current?.sessionId !== target) return;
      capturePlayback();
      setLost(apiErrorMessage(caught));
    } finally {
      if (inFlightRef.current?.sessionId === target) inFlightRef.current = null;
    }
  }, [api, capturePlayback]);

  useEffect(() => {
    if (phase !== "ready") return;
    const timer = setInterval(() => {
      if (playingRef.current) void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [phase, sendHeartbeat]);

  if (phase === "failed" || lost) {
    return (
      <div className="video-shell" role="alert">
        <span>Playback session unavailable</span>
        <small>{lost ?? error ?? "The learning session was rejected by the server."}</small>
        <Button
          type="button"
          onClick={() => {
            setLost(null);
            retry();
          }}
        >
          Resume learning session
        </Button>
      </div>
    );
  }

  if (phase === "starting" || !session) {
    return (
      <div className="video-shell">
        <span>Opening protected playback session…</span>
        <small>The server verifies your purchase before signing a short-lived video URL.</small>
      </div>
    );
  }

  const done = lessonDone || complete;
  return (
    <div className="video-player-stack">
      {/* biome-ignore lint/a11y/useMediaCaption: the learning-session protocol signs the video URL only; caption tracks are a declared product gap, not silently missing. */}
      <video
        ref={videoRef}
        className="video-shell"
        controls
        src={session.url}
        onLoadedMetadata={(event) => {
          const handoff = playbackHandoffRef.current;
          if (!handoff) return;
          playbackHandoffRef.current = null;
          event.currentTarget.currentTime = handoff.position;
          if (!handoff.shouldPlay) return;
          try {
            const resumed = event.currentTarget.play();
            void resumed?.catch(() => {
              playingRef.current = false;
              setResumeNotice("Playback position restored. Press play to continue.");
            });
          } catch {
            playingRef.current = false;
            setResumeNotice("Playback position restored. Press play to continue.");
          }
        }}
        onPlay={() => {
          playingRef.current = true;
          setResumeNotice(null);
          void sendHeartbeat();
        }}
        onPause={() => {
          if (playbackHandoffRef.current) return;
          playingRef.current = false;
          void sendHeartbeat();
        }}
        onEnded={() => {
          playingRef.current = false;
          void sendHeartbeat();
        }}
      >
        Your browser does not support protected video playback.
      </video>
      <div className="video-session-meta">
        <Status tone={done ? "success" : "neutral"}>
          {done ? "Lesson complete" : "Coverage is verified by server-side heartbeats"}
        </Status>
        <small className="muted">
          Session expires {new Date(session.sessionExpiresAt).toLocaleTimeString()} · seeking and
          paused time never count toward coverage.
        </small>
      </div>
      {renewalError && (
        <p className="fine-print" role="status">
          Access refresh is retrying. Current playback remains active ({renewalError}).
        </p>
      )}
      {resumeNotice && (
        <p className="fine-print" role="status">
          {resumeNotice}
        </p>
      )}
      {heartbeatRejected && (
        <p className="error" role="alert">
          The last progress report was not accepted ({heartbeatRejected}). Keep playing normally;
          replayed or out-of-order reports are ignored by design.
        </p>
      )}
    </div>
  );
}
