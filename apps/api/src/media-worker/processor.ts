import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { inflateRawSync } from "node:zlib";
import { LessonContentKind } from "@prisma/client";
import type { MediaObjectStore } from "./object-store";
import { type MediaJob, ProcessingFailure, type ReadyMediaFacts } from "./types";

const run = promisify(execFile);
const VIDEO_MAX_BYTES = 2_147_483_648n;
const DOCUMENT_MAX_BYTES = 104_857_600n;
const MAX_DURATION_MS = 43_200_000;
const TOOL_TIMEOUT_MS = 120_000;

type ProbeOutput = {
  format?: { duration?: string; format_name?: string };
  streams?: Array<{ codec_type?: string; codec_name?: string }>;
};

export class MediaProcessor {
  constructor(
    private readonly objects: MediaObjectStore,
    private readonly ffmpeg = process.env.FFMPEG_PATH?.trim() || "ffmpeg",
    private readonly ffprobe = process.env.FFPROBE_PATH?.trim() || "ffprobe",
  ) {}

  async process(job: MediaJob): Promise<ReadyMediaFacts> {
    const directory = await mkdtemp(path.join(tmpdir(), "web3u-media-"));
    const source = path.join(directory, "source");
    try {
      await this.objects.download(job.sourceObjectKey, source, job.expectedSizeBytes);
      const sourceStat = await stat(source);
      if (sourceStat.size <= 0 || BigInt(sourceStat.size) !== job.expectedSizeBytes) {
        throw new ProcessingFailure("SIZE_MISMATCH", false);
      }
      return job.kind === LessonContentKind.VIDEO
        ? await this.processVideo(job, source, directory)
        : await this.processDocument(job, source, directory);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }

  private async processVideo(job: MediaJob, source: string, directory: string) {
    if (job.expectedSizeBytes > VIDEO_MAX_BYTES || job.declaredMimeType !== "video/mp4") {
      throw new ProcessingFailure("DECLARATION_MISMATCH", false);
    }
    const inputProbe = await this.probe(source, "INPUT_VIDEO_INVALID");
    if (!inputProbe.streams?.some((stream) => stream.codec_type === "video")) {
      throw new ProcessingFailure("INPUT_VIDEO_INVALID", false);
    }
    const output = path.join(directory, "ready.mp4");
    try {
      await run(
        this.ffmpeg,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          source,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          "-threads",
          "1",
          "-f",
          "mp4",
          output,
        ],
        { timeout: TOOL_TIMEOUT_MS, maxBuffer: 1_048_576 },
      );
    } catch (error) {
      throw toolFailure(error, "TRANSCODE_FAILED");
    }
    const outputProbe = await this.probe(output, "OUTPUT_VIDEO_INVALID");
    const video = outputProbe.streams?.find((stream) => stream.codec_type === "video");
    const audio = outputProbe.streams?.find((stream) => stream.codec_type === "audio");
    const durationMs = Math.round(Number(outputProbe.format?.duration) * 1000);
    if (
      video?.codec_name !== "h264" ||
      (audio && audio.codec_name !== "aac") ||
      !Number.isFinite(durationMs) ||
      durationMs < 1 ||
      durationMs > MAX_DURATION_MS
    ) {
      throw new ProcessingFailure("OUTPUT_VIDEO_INVALID", false);
    }
    return this.publish(job, output, ".mp4", "video/mp4", durationMs);
  }

  private async processDocument(job: MediaJob, source: string, _directory: string) {
    if (job.expectedSizeBytes > DOCUMENT_MAX_BYTES) {
      throw new ProcessingFailure("FILE_TOO_LARGE", false);
    }
    const bytes = await readFile(source);
    const detected = detectDocument(bytes, job.declaredMimeType);
    if (!detected) throw new ProcessingFailure("DOCUMENT_INVALID", false);
    return this.publish(job, source, detected.extension, detected.mimeType, null);
  }

  private async publish(
    job: MediaJob,
    file: string,
    extension: string,
    detectedMimeType: string,
    durationMs: number | null,
  ): Promise<ReadyMediaFacts> {
    const fileStat = await stat(file);
    if (fileStat.size <= 0) throw new ProcessingFailure("OUTPUT_EMPTY", false);
    const sha256 = await sha256File(file);
    const readyObjectKey = `ready/${job.assetId}/v${job.assetVersion}${extension}`;
    await this.objects.upload(readyObjectKey, file, detectedMimeType);
    return {
      readyObjectKey,
      detectedMimeType,
      sizeBytes: BigInt(fileStat.size),
      sha256,
      durationMs,
    };
  }

  private async probe(file: string, code: string): Promise<ProbeOutput> {
    try {
      const result = await run(
        this.ffprobe,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration,format_name:stream=codec_type,codec_name",
          "-of",
          "json",
          file,
        ],
        { timeout: TOOL_TIMEOUT_MS, maxBuffer: 1_048_576 },
      );
      return JSON.parse(result.stdout) as ProbeOutput;
    } catch (error) {
      throw toolFailure(error, code);
    }
  }
}

function detectDocument(
  bytes: Buffer,
  declaredMimeType: string,
): { mimeType: string; extension: string } | null {
  if (declaredMimeType === "application/pdf") {
    const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString("latin1");
    return bytes.subarray(0, 5).toString("latin1") === "%PDF-" && tail.includes("%%EOF")
      ? { mimeType: "application/pdf", extension: ".pdf" }
      : null;
  }
  if (declaredMimeType === "text/plain") {
    if (bytes.includes(0)) return null;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return { mimeType: "text/plain", extension: ".txt" };
    } catch {
      return null;
    }
  }
  const office = OFFICE_TYPES[declaredMimeType as keyof typeof OFFICE_TYPES];
  if (!office) return null;
  const entries = zipEntries(bytes, new Set(["[Content_Types].xml", office.requiredEntry]));
  const contentTypes = entries?.get("[Content_Types].xml");
  const required = entries?.get(office.requiredEntry);
  if (
    !contentTypes?.includes(Buffer.from("<Types")) ||
    !required?.includes(Buffer.from(office.rootMarker))
  ) {
    return null;
  }
  return { mimeType: declaredMimeType, extension: office.extension };
}

const OFFICE_TYPES = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extension: ".docx",
    requiredEntry: "word/document.xml",
    rootMarker: "<w:document",
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    extension: ".pptx",
    requiredEntry: "ppt/presentation.xml",
    rootMarker: "<p:presentation",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    extension: ".xlsx",
    requiredEntry: "xl/workbook.xml",
    rootMarker: "<workbook",
  },
} as const;

function zipEntries(bytes: Buffer, retainedNames: Set<string>): Map<string, Buffer> | null {
  const eocdStart = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= eocdStart; index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0 || eocd + 22 > bytes.length) return null;
  const count = bytes.readUInt16LE(eocd + 10);
  if (
    bytes.readUInt16LE(eocd + 4) !== 0 ||
    bytes.readUInt16LE(eocd + 6) !== 0 ||
    bytes.readUInt16LE(eocd + 8) !== count
  ) {
    return null;
  }
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (count > 10_000 || centralOffset + centralSize > bytes.length) return null;
  const files = new Map<string, Buffer>();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let entry = 0; entry < count; entry += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) return null;
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || end > bytes.length) return null;
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!safeZipEntry(name) || files.has(name) || localOffset + 30 > centralOffset) return null;
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) return null;
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (
      localFlags !== flags ||
      localMethod !== method ||
      dataEnd > centralOffset ||
      bytes.subarray(localNameStart, localNameStart + localNameLength).toString("utf8") !== name
    ) {
      return null;
    }
    totalUncompressed += uncompressedSize;
    if (uncompressedSize > 128 * 1024 * 1024 || totalUncompressed > 256 * 1024 * 1024) return null;
    let contents: Buffer;
    try {
      const compressed = bytes.subarray(dataStart, dataEnd);
      contents =
        method === 0
          ? Buffer.from(compressed)
          : inflateRawSync(compressed, { maxOutputLength: 128 * 1024 * 1024 });
    } catch {
      return null;
    }
    if (contents.length !== uncompressedSize || crc32(contents) !== expectedCrc) return null;
    if (retainedNames.has(name)) files.set(name, contents);
    cursor = end;
  }
  return cursor === centralOffset + centralSize ? files : null;
}

function safeZipEntry(name: string): boolean {
  const normalized = name.replaceAll("\\", "/");
  return (
    Boolean(normalized) && !normalized.startsWith("/") && !normalized.split("/").includes("..")
  );
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function toolFailure(error: unknown, fallbackCode: string): ProcessingFailure {
  if (
    error &&
    typeof error === "object" &&
    "killed" in error &&
    (error as { killed?: boolean }).killed
  ) {
    return new ProcessingFailure("PROCESSING_TIMEOUT", true);
  }
  return new ProcessingFailure(fallbackCode, true);
}
