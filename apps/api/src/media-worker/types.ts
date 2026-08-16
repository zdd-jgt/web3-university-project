import type { LessonContentKind } from "@prisma/client";

export type MediaJob = {
  jobId: string;
  assetId: string;
  assetVersion: number;
  attempts: number;
  kind: LessonContentKind;
  sourceObjectKey: string;
  declaredMimeType: string;
  expectedSizeBytes: bigint;
};

export type ReadyMediaFacts = {
  readyObjectKey: string;
  detectedMimeType: string;
  sizeBytes: bigint;
  sha256: string;
  durationMs: number | null;
};

export class ProcessingFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "ProcessingFailure";
  }
}
