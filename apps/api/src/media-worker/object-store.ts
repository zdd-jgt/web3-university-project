import { createReadStream, createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ProcessingFailure } from "./types";

export interface MediaObjectStore {
  download(objectKey: string, destination: string, maxBytes: bigint): Promise<void>;
  upload(objectKey: string, source: string, contentType: string): Promise<void>;
}

type ObjectStoreConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export class S3MediaObjectStore implements MediaObjectStore {
  readonly client: S3Client;
  readonly bucket: string;

  constructor(config: ObjectStoreConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  static fromEnvironment(): S3MediaObjectStore {
    const bucket = process.env.S3_BUCKET?.trim();
    const region = process.env.S3_REGION?.trim();
    const accessKeyId = process.env.S3_ACCESS_KEY?.trim();
    const secretAccessKey = process.env.S3_SECRET_KEY?.trim();
    if (!bucket || !region || Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
      throw new ProcessingFailure("STORAGE_CONFIGURATION_INVALID", false);
    }
    return new S3MediaObjectStore({
      bucket,
      region,
      endpoint: process.env.S3_ENDPOINT?.trim(),
      accessKeyId,
      secretAccessKey,
    });
  }

  async download(objectKey: string, destination: string, maxBytes: bigint): Promise<void> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      if (!result.Body) throw new ProcessingFailure("SOURCE_MISSING", false);
      await pipeline(
        asNodeStream(result.Body),
        byteLimit(maxBytes),
        createWriteStream(destination, { flags: "wx" }),
      );
    } catch (error) {
      if (error instanceof ProcessingFailure) throw error;
      if (isMissingObject(error)) throw new ProcessingFailure("SOURCE_MISSING", false);
      throw new ProcessingFailure("STORAGE_READ_FAILED", true);
    }
  }

  async upload(objectKey: string, source: string, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: createReadStream(source),
          ContentType: contentType,
        }),
      );
    } catch {
      throw new ProcessingFailure("STORAGE_WRITE_FAILED", true);
    }
  }
}

function byteLimit(maxBytes: bigint): Transform {
  let received = 0n;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += BigInt(chunk.length);
      if (received > maxBytes) {
        callback(new ProcessingFailure("SIZE_MISMATCH", false));
        return;
      }
      callback(null, chunk);
    },
  });
}

function asNodeStream(body: unknown): NodeJS.ReadableStream {
  if (body && typeof body === "object" && "pipe" in body && typeof body.pipe === "function") {
    return body as NodeJS.ReadableStream;
  }
  throw new ProcessingFailure("STORAGE_STREAM_UNSUPPORTED", true);
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.$metadata?.httpStatusCode === 404 || candidate.name === "NoSuchKey";
}
