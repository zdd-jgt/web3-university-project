export type Range = { startMs: number; endMs: number };

/** Normalizes overlapping/touching half-open ranges; callers validate range shape first. */
export function mergeRanges(ranges: Range[]): Range[] {
  const ordered = [...ranges].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: Range[] = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (!previous || range.startMs > previous.endMs) merged.push({ ...range });
    else previous.endMs = Math.max(previous.endMs, range.endMs);
  }
  return merged;
}

export function coveredMs(ranges: Range[]): number {
  return ranges.reduce((total, range) => total + range.endMs - range.startMs, 0);
}

export function isLessonComplete(ranges: Range[], durationMs: number): boolean {
  return durationMs > 0 && coveredMs(mergeRanges(ranges)) / durationMs >= 0.95;
}
