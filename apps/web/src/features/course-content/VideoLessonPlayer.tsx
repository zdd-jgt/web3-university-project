import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Status } from "../../components/ui";
import { apiErrorMessage, type UniversityApi } from "../../lib/api";
import { formatZhTime, learningReasonLabel } from "../../lib/localization";
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
      setHeartbeatRejected(result.accepted ? null : learningReasonLabel(result.reason));
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
        <span>播放会话不可用</span>
        <small>{lost ?? error ?? "学习会话已被服务端拒绝。"}</small>
        <Button
          type="button"
          onClick={() => {
            setLost(null);
            retry();
          }}
        >
          恢复学习会话
        </Button>
      </div>
    );
  }

  if (phase === "starting" || !session) {
    return (
      <div className="video-shell">
        <span>正在开启受保护的播放会话…</span>
        <small>服务端会先核验你的购买凭证，再签发短期有效的视频链接。</small>
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
              setResumeNotice("播放位置已恢复，请按播放键继续。");
            });
          } catch {
            playingRef.current = false;
            setResumeNotice("播放位置已恢复，请按播放键继续。");
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
        你的浏览器不支持受保护的视频播放。
      </video>
      <div className="video-session-meta">
        <Status tone={done ? "success" : "neutral"}>
          {done ? "课时已完成" : "覆盖率由服务端心跳校验"}
        </Status>
        <small className="muted">
          会话于 {formatZhTime(session.sessionExpiresAt)} 过期 · 拖动进度与暂停时间不计入覆盖率。
        </small>
      </div>
      {renewalError && (
        <p className="fine-print" role="status">
          正在重试刷新访问凭证，当前播放不受影响（{renewalError}）。
        </p>
      )}
      {resumeNotice && (
        <p className="fine-print" role="status">
          {resumeNotice}
        </p>
      )}
      {heartbeatRejected && (
        <p className="error" role="alert">
          上一条进度上报未被接受（{heartbeatRejected}
          ）。请继续正常播放，重复或乱序的上报按设计会被忽略。
        </p>
      )}
    </div>
  );
}
