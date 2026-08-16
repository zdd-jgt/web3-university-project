import { getSignedUrl as getCloudFrontSignedUrl } from "@aws-sdk/cloudfront-signer";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { Errors } from "../common/app-error";

const URL_TTL_SECONDS = 5 * 60;
const UPLOAD_TTL_SECONDS = 15 * 60;
export type StorageAssetKind =
  | "video"
  | "captions"
  | {
      contentType: string;
      disposition: "inline" | "attachment";
      fileName: string;
    };

export type StorageObjectHead = {
  contentLength: bigint;
  contentType: string | null;
};

export interface StorageSigner {
  signRead(objectKey: string, kind: StorageAssetKind): Promise<{ url: string; expiresAt: Date }>;
  signWrite(
    objectKey: string,
    contentType: string,
    contentLength: bigint,
  ): Promise<{ url: string; expiresAt: Date; requiredHeaders: Record<string, string> }>;
  head(objectKey: string): Promise<StorageObjectHead | null>;
}

export const STORAGE_SIGNER = Symbol("STORAGE_SIGNER");

@Injectable()
export class S3StorageSigner implements StorageSigner {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    const bucket = process.env.S3_BUCKET?.trim();
    const region = process.env.S3_REGION?.trim();
    if (!bucket || !region) throw Errors.unavailable();
    const accessKeyId = process.env.S3_ACCESS_KEY?.trim();
    const secretAccessKey = process.env.S3_SECRET_KEY?.trim();
    if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
      throw Errors.unavailable();
    }
    this.bucket = bucket;
    this.client = new S3Client({
      region,
      ...(process.env.S3_ENDPOINT?.trim()
        ? { endpoint: process.env.S3_ENDPOINT.trim(), forcePathStyle: true }
        : {}),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  async signRead(objectKey: string, kind: StorageAssetKind) {
    validateObjectKey(objectKey);
    const response = readResponse(kind);
    const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000);
    const url = await getS3SignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ResponseContentType: response.contentType,
        ResponseContentDisposition: response.contentDisposition,
      }),
      { expiresIn: URL_TTL_SECONDS },
    );
    return { url, expiresAt };
  }

  async signWrite(objectKey: string, contentType: string, contentLength: bigint) {
    validateObjectKey(objectKey);
    if (
      !contentType.trim() ||
      contentLength <= 0n ||
      contentLength > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw Errors.validation();
    }
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000);
    const url = await getS3SignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: Number(contentLength),
      }),
      { expiresIn: UPLOAD_TTL_SECONDS },
    );
    return {
      url,
      expiresAt,
      requiredHeaders: {
        "content-type": contentType,
        "content-length": contentLength.toString(),
      },
    };
  }

  async head(objectKey: string): Promise<StorageObjectHead | null> {
    validateObjectKey(objectKey);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      if (result.ContentLength === undefined || result.ContentLength < 0) {
        throw Errors.unavailable();
      }
      return {
        contentLength: BigInt(result.ContentLength),
        contentType: result.ContentType?.trim().toLowerCase() ?? null,
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      if (error instanceof Error && error.name === "AppError") throw error;
      throw Errors.unavailable();
    }
  }
}

@Injectable()
export class CloudFrontStorageSigner implements StorageSigner {
  private readonly baseURL: string;
  private readonly keyPairId: string;
  private readonly privateKey: string;
  private readonly origin: S3StorageSigner;

  constructor() {
    const baseURL = process.env.CLOUDFRONT_MEDIA_URL?.trim().replace(/\/$/, "");
    const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID?.trim();
    const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
    if (!baseURL || !keyPairId || !privateKey || !baseURL.startsWith("https://")) {
      throw Errors.unavailable();
    }
    this.baseURL = baseURL;
    this.keyPairId = keyPairId;
    this.privateKey = privateKey;
    this.origin = new S3StorageSigner();
  }

  async signRead(objectKey: string, _kind: StorageAssetKind) {
    validateObjectKey(objectKey);
    const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000);
    const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
    const url = getCloudFrontSignedUrl({
      url: `${this.baseURL}/${encodedKey}`,
      keyPairId: this.keyPairId,
      privateKey: this.privateKey,
      dateLessThan: expiresAt.toISOString(),
    });
    return { url, expiresAt };
  }

  signWrite(objectKey: string, contentType: string, contentLength: bigint) {
    return this.origin.signWrite(objectKey, contentType, contentLength);
  }

  head(objectKey: string) {
    return this.origin.head(objectKey);
  }
}

export function contentTypeFor(kind: StorageAssetKind): string {
  if (typeof kind === "object") return kind.contentType;
  return kind === "captions" ? "text/vtt; charset=utf-8" : "video/mp4";
}

export function storageSignerFactory(): StorageSigner {
  return ["local", "test"].includes(process.env.APP_ENV ?? "")
    ? new S3StorageSigner()
    : new CloudFrontStorageSigner();
}

function validateObjectKey(objectKey: string): void {
  const segments = objectKey.split("/");
  if (
    !objectKey ||
    objectKey.startsWith("/") ||
    objectKey.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw Errors.validation();
  }
}

function readResponse(kind: StorageAssetKind) {
  if (typeof kind === "string") {
    return { contentType: contentTypeFor(kind), contentDisposition: "inline" };
  }
  const contentType = kind.contentType.trim().toLowerCase();
  const fileName = kind.fileName.normalize("NFKC").trim();
  if (
    !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(contentType) ||
    !fileName ||
    fileName.length > 180 ||
    /[\r\n/\\]/.test(fileName)
  ) {
    throw Errors.validation();
  }
  return {
    contentType,
    contentDisposition: `${kind.disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  };
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.$metadata?.httpStatusCode === 404 || candidate.name === "NotFound";
}
