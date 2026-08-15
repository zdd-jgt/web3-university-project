import { getSignedUrl as getCloudFrontSignedUrl } from "@aws-sdk/cloudfront-signer";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { Errors } from "../common/app-error";

const URL_TTL_SECONDS = 5 * 60;
export type StorageAssetKind = "video" | "captions";

export interface StorageSigner {
  signRead(objectKey: string, kind: StorageAssetKind): Promise<{ url: string; expiresAt: Date }>;
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
    const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000);
    const url = await getS3SignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ResponseContentType: contentTypeFor(kind),
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: URL_TTL_SECONDS },
    );
    return { url, expiresAt };
  }
}

@Injectable()
export class CloudFrontStorageSigner implements StorageSigner {
  private readonly baseURL: string;
  private readonly keyPairId: string;
  private readonly privateKey: string;

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
}

export function contentTypeFor(kind: StorageAssetKind): string {
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
