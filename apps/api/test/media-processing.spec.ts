import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { LessonContentKind } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { failureDisposition } from "../src/media-worker/job-store";
import { S3MediaObjectStore } from "../src/media-worker/object-store";
import { MediaProcessor } from "../src/media-worker/processor";
import { ProcessingFailure } from "../src/media-worker/types";

const run = promisify(execFile);
const endpoint = process.env.MEDIA_TEST_S3_ENDPOINT?.trim();
if (process.env.XJ_REQUIRE_MEDIA === "1" && !endpoint) {
  throw new Error("MEDIA_TEST_S3_ENDPOINT is required for XJ media evidence");
}

const integration = endpoint ? describe : describe.skip;

integration("real-byte media processing", () => {
  const bucket = `web3u-media-${randomUUID()}`;
  const store = new S3MediaObjectStore({
    bucket,
    region: "us-east-1",
    endpoint,
    accessKeyId: process.env.MEDIA_TEST_S3_ACCESS_KEY ?? "minio",
    secretAccessKey: process.env.MEDIA_TEST_S3_SECRET_KEY ?? "change-me-now",
  });
  const directoryPromise = mkdtemp(path.join(tmpdir(), "web3u-media-test-"));

  beforeAll(async () => {
    await store.client.send(new CreateBucketCommand({ Bucket: bucket }));
  });

  afterAll(async () => {
    const listed = await store.client.send(new ListObjectsV2Command({ Bucket: bucket }));
    if (listed.Contents?.length) {
      await store.client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: listed.Contents.flatMap((item) => (item.Key ? [{ Key: item.Key }] : [])),
          },
        }),
      );
    }
    await store.client.send(new DeleteBucketCommand({ Bucket: bucket }));
    await rm(await directoryPromise, { force: true, recursive: true });
  });

  it("transcodes an actual video into verified H.264/AAC MP4 facts", async () => {
    const directory = await directoryPromise;
    const source = path.join(directory, "input.mp4");
    await run(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=duration=0.5:size=64x64:rate=10",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=1000:duration=0.5",
        "-shortest",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        source,
      ],
      { timeout: 30_000 },
    );
    await store.upload("source/video.mp4", source, "video/mp4");
    const bytes = await readFile(source);
    const result = await new MediaProcessor(store).process({
      jobId: "job-video",
      assetId: "asset-video",
      assetVersion: 2,
      attempts: 1,
      kind: LessonContentKind.VIDEO,
      sourceObjectKey: "source/video.mp4",
      declaredMimeType: "video/mp4",
      expectedSizeBytes: BigInt(bytes.length),
    });

    expect(result).toMatchObject({
      readyObjectKey: "ready/asset-video/v2.mp4",
      detectedMimeType: "video/mp4",
    });
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sizeBytes).toBeGreaterThan(0n);
  }, 60_000);

  it("accepts real PDF bytes but rejects a script renamed as PDF", async () => {
    const directory = await directoryPromise;
    const pdf = path.join(directory, "guide.pdf");
    const fake = path.join(directory, "fake.pdf");
    await writeFile(pdf, "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    await writeFile(fake, "<script>alert(1)</script>");
    await store.upload("source/guide.pdf", pdf, "application/pdf");
    await store.upload("source/fake.pdf", fake, "application/pdf");
    const pdfSize = (await readFile(pdf)).length;
    const fakeSize = (await readFile(fake)).length;
    const processor = new MediaProcessor(store);

    await expect(
      processor.process({
        jobId: "job-pdf",
        assetId: "asset-pdf",
        assetVersion: 0,
        attempts: 1,
        kind: LessonContentKind.DOCUMENT,
        sourceObjectKey: "source/guide.pdf",
        declaredMimeType: "application/pdf",
        expectedSizeBytes: BigInt(pdfSize),
      }),
    ).resolves.toMatchObject({ detectedMimeType: "application/pdf", durationMs: null });

    await expect(
      processor.process({
        jobId: "job-fake",
        assetId: "asset-fake",
        assetVersion: 0,
        attempts: 1,
        kind: LessonContentKind.DOCUMENT,
        sourceObjectKey: "source/fake.pdf",
        declaredMimeType: "application/pdf",
        expectedSizeBytes: BigInt(fakeSize),
      }),
    ).rejects.toEqual(new ProcessingFailure("DOCUMENT_INVALID", false));
  });

  it("accepts a structurally valid DOCX container and rejects forged ZIP metadata", async () => {
    const directory = await directoryPromise;
    const docx = path.join(directory, "guide.docx");
    const forged = path.join(directory, "forged.docx");
    const validBytes = storedZip([
      ["[Content_Types].xml", Buffer.from("<Types></Types>")],
      ["word/document.xml", Buffer.from("<w:document><w:body/></w:document>")],
    ]);
    const forgedBytes = Buffer.from(validBytes);
    forgedBytes.writeUInt32LE(0, forgedBytes.indexOf(Buffer.from("word/document.xml")) - 30);
    await writeFile(docx, validBytes);
    await writeFile(forged, forgedBytes);
    await store.upload("source/guide.docx", docx, OFFICE_MIME);
    await store.upload("source/forged.docx", forged, OFFICE_MIME);
    const processor = new MediaProcessor(store);

    await expect(
      processor.process(documentJob("docx", "source/guide.docx", BigInt(validBytes.length))),
    ).resolves.toMatchObject({ detectedMimeType: OFFICE_MIME, durationMs: null });
    await expect(
      processor.process(documentJob("forged", "source/forged.docx", BigInt(forgedBytes.length))),
    ).rejects.toEqual(new ProcessingFailure("DOCUMENT_INVALID", false));
  });
});

describe("media retry policy", () => {
  it("backs off retryable failures and enters FAILED at the attempt limit", () => {
    expect(failureDisposition(1, true, 3)).toEqual({ status: "PENDING", retryDelayMs: 1000 });
    expect(failureDisposition(2, true, 3)).toEqual({ status: "PENDING", retryDelayMs: 2000 });
    expect(failureDisposition(3, true, 3)).toEqual({ status: "FAILED", retryDelayMs: 0 });
    expect(failureDisposition(1, false, 3)).toEqual({ status: "FAILED", retryDelayMs: 0 });
  });
});

const OFFICE_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function documentJob(id: string, sourceObjectKey: string, expectedSizeBytes: bigint) {
  return {
    jobId: `job-${id}`,
    assetId: `asset-${id}`,
    assetVersion: 0,
    attempts: 1,
    kind: LessonContentKind.DOCUMENT,
    sourceObjectKey,
    declaredMimeType: OFFICE_MIME,
    expectedSizeBytes,
  };
}

function storedZip(entries: Array<[string, Buffer]>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, contents] of entries) {
    const nameBytes = Buffer.from(name);
    const crc = testCrc32(contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, contents);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(contents.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + contents.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, eocd]);
}

function testCrc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
