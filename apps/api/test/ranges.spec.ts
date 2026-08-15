import { describe, expect, it } from "vitest";
import { coveredMs, isLessonComplete, mergeRanges } from "../src/learning/ranges";
describe("learning range normalization", () => {
  it("merges overlapping and touching segments without double-counting", () => {
    const ranges = mergeRanges([
      { startMs: 400, endMs: 600 },
      { startMs: 0, endMs: 200 },
      { startMs: 200, endMs: 500 },
    ]);
    expect(ranges).toEqual([{ startMs: 0, endMs: 600 }]);
    expect(coveredMs(ranges)).toBe(600);
  });
  it("does not merge a real gap", () =>
    expect(
      mergeRanges([
        { startMs: 0, endMs: 10 },
        { startMs: 11, endMs: 20 },
      ]),
    ).toEqual([
      { startMs: 0, endMs: 10 },
      { startMs: 11, endMs: 20 },
    ]));
  it("requires at least 95 percent coverage, not rounded display progress", () => {
    expect(isLessonComplete([{ startMs: 0, endMs: 949 }], 1000)).toBe(false);
    expect(isLessonComplete([{ startMs: 0, endMs: 950 }], 1000)).toBe(true);
  });
});
