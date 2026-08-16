export type HeartbeatState = {
  lastSequence: number;
  lastPositionMs: number;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
};

export type HeartbeatInput = { sequence: number; positionMs: number };

export type HeartbeatDecision = {
  acceptedRange: { startMs: number; endMs: number } | null;
  reason: "BASELINE" | "PLAYING" | "PAUSED" | "SEEK" | "STALE";
};

const MIN_HEARTBEAT_INTERVAL_MS = 500;
const MAX_HEARTBEAT_INTERVAL_MS = 30_000;
const POSITION_TOLERANCE_MS = 250;
const PLAYBACK_RATE_TOLERANCE = 1.15;

export function decideHeartbeat(
  state: HeartbeatState,
  input: HeartbeatInput,
  now: Date,
): HeartbeatDecision {
  if (input.sequence !== state.lastSequence + 1) throw new Error("OUT_OF_ORDER");
  if (state.lastSequence === 0 || !state.lastHeartbeatAt) {
    return { acceptedRange: null, reason: "BASELINE" };
  }
  const elapsedMs = now.getTime() - state.lastHeartbeatAt.getTime();
  const positionDeltaMs = input.positionMs - state.lastPositionMs;
  if (elapsedMs < MIN_HEARTBEAT_INTERVAL_MS || elapsedMs > MAX_HEARTBEAT_INTERVAL_MS) {
    return { acceptedRange: null, reason: "STALE" };
  }
  if (positionDeltaMs === 0) return { acceptedRange: null, reason: "PAUSED" };
  const allowedPositionDelta = elapsedMs * PLAYBACK_RATE_TOLERANCE + POSITION_TOLERANCE_MS;
  if (positionDeltaMs < 0 || positionDeltaMs > allowedPositionDelta) {
    return { acceptedRange: null, reason: "SEEK" };
  }
  return {
    acceptedRange: { startMs: state.lastPositionMs, endMs: input.positionMs },
    reason: "PLAYING",
  };
}
