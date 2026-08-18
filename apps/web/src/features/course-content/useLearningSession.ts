import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiLearningSession, apiErrorMessage, type UniversityApi } from "../../lib/api";

/** Renew the signed URL this long before urlExpiresAt so playback never hits an expired link. */
export const SESSION_RENEW_LEAD_MS = 30_000;
export const SESSION_RENEW_RETRY_MS = 5_000;

export type LearningSessionPhase = "starting" | "ready" | "failed";

type LearningSessionCallbacks = {
  onBeforeSessionRenew?: (current: ApiLearningSession, next: ApiLearningSession) => void;
  onSessionChanged?: (sessionId: string | null) => void;
};

/**
 * Owns the learning-session lifecycle for one lesson: single-flight start
 * (React StrictMode safe), stale-response rejection on lesson switches and
 * proactive renewal before the signed URL expires. Renewal always produces a
 * brand-new session; the old sessionId and heartbeat sequence are never reused.
 */
export function useLearningSession(
  api: UniversityApi,
  lessonId: string,
  callbacks: LearningSessionCallbacks = {},
) {
  const [session, setSession] = useState<ApiLearningSession | null>(null);
  const [phase, setPhase] = useState<LearningSessionPhase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [renewalError, setRenewalError] = useState<string | null>(null);
  const [renewalRetryAt, setRenewalRetryAt] = useState<number | null>(null);
  const inflightRef = useRef<{ lessonId: string; promise: Promise<ApiLearningSession> } | null>(
    null,
  );
  const generationRef = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const begin = useCallback(
    async (generation: number, renewal: boolean) => {
      if (!renewal) {
        setError(null);
        setPhase("starting");
      }
      // Single-flight: while an identical start is already in progress (for example React
      // StrictMode's duplicated effects), the existing request is shared instead of posting again.
      const inflight = inflightRef.current;
      const promise =
        !renewal && inflight && inflight.lessonId === lessonId
          ? inflight.promise
          : api.startLearningSession(lessonId);
      inflightRef.current = { lessonId, promise };
      try {
        const next = await promise;
        if (inflightRef.current?.promise === promise) inflightRef.current = null;
        // A stale response (lesson switched, session superseded) must never overwrite the current one.
        if (generation !== generationRef.current) return;
        if (renewal && sessionRef.current) {
          callbacksRef.current.onBeforeSessionRenew?.(sessionRef.current, next);
        }
        setSession(next);
        setPhase("ready");
        setError(null);
        setRenewalError(null);
        setRenewalRetryAt(null);
      } catch (caught) {
        if (inflightRef.current?.promise === promise) inflightRef.current = null;
        if (generation !== generationRef.current) return;
        const current = sessionRef.current;
        const expiresAt = current ? new Date(current.urlExpiresAt).getTime() : Number.NaN;
        if (renewal && current && Number.isFinite(expiresAt) && Date.now() < expiresAt) {
          // The API preserves the active session when credential preparation fails. Keep the
          // existing player alive and retry with a bounded delay while its URL is still valid.
          setRenewalError(apiErrorMessage(caught));
          setRenewalRetryAt(Math.min(expiresAt, Date.now() + SESSION_RENEW_RETRY_MS));
          return;
        }
        setSession(null);
        setPhase("failed");
        setError(apiErrorMessage(caught));
        setRenewalError(null);
        setRenewalRetryAt(null);
      }
    },
    [api, lessonId],
  );

  useEffect(() => {
    generationRef.current += 1;
    setSession(null);
    setRenewalError(null);
    setRenewalRetryAt(null);
    void begin(generationRef.current, false);
    // Each lesson (and only the latest effect run) may own the visible session.
  }, [begin]);

  const urlExpiresAt = session?.urlExpiresAt ?? null;
  useEffect(() => {
    if (phase !== "ready" || !urlExpiresAt) return;
    const expiresAt = new Date(urlExpiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return;
    const renewAt = renewalRetryAt ?? expiresAt - SESSION_RENEW_LEAD_MS;
    const delay = Math.max(0, renewAt - Date.now());
    const timer = setTimeout(() => {
      // Renewal swaps in a fresh session; the old sessionId and heartbeat sequence are dropped.
      generationRef.current += 1;
      void begin(generationRef.current, true);
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, urlExpiresAt, renewalRetryAt, begin]);

  const retry = useCallback(() => {
    generationRef.current += 1;
    inflightRef.current = null;
    setSession(null);
    setRenewalError(null);
    setRenewalRetryAt(null);
    void begin(generationRef.current, false);
  }, [begin]);

  const sessionId = session?.sessionId ?? null;
  useEffect(() => {
    // A switched or renewed session is a fresh identity: consumers reset sequence-scoped and
    // transient error state here without undoing a server-confirmed lesson completion.
    callbacksRef.current.onSessionChanged?.(sessionId);
  }, [sessionId]);

  return { session, phase, error, renewalError, retry };
}
