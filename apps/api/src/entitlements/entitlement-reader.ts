import { Injectable } from "@nestjs/common";
import { Errors } from "../common/app-error";
import { PrismaService } from "../prisma/prisma.service";

export interface EntitlementReader {
  assertPurchased(walletAddress: string, chainId: number, chainCourseId: string): Promise<void>;
}
export const ENTITLEMENT_READER = Symbol("ENTITLEMENT_READER");

@Injectable()
export class LocalEntitlementReader implements EntitlementReader {
  async assertPurchased(
    _walletAddress: string,
    _chainId: number,
    chainCourseId: string,
  ): Promise<void> {
    if (!["local", "test"].includes(process.env.APP_ENV ?? "")) throw Errors.forbidden();
    const courseIds = new Set(
      (process.env.LOCAL_PURCHASED_COURSE_IDS ?? "").split(",").filter(Boolean),
    );
    if (!courseIds.has(chainCourseId)) throw Errors.forbidden();
  }
}

@Injectable()
export class RpcEntitlementReader implements EntitlementReader {
  async assertPurchased(
    _walletAddress: string,
    _chainId: number,
    _chainCourseId: string,
  ): Promise<void> {
    // An approved ABI/client integration belongs here. Missing or unavailable RPC must
    // never be interpreted as a purchase.
    throw Errors.unavailable();
  }
}

@Injectable()
export class ProjectedEntitlementReader implements EntitlementReader {
  constructor(private readonly prisma: PrismaService) {}
  async assertPurchased(
    walletAddress: string,
    chainId: number,
    chainCourseId: string,
  ): Promise<void> {
    if (!Number.isSafeInteger(chainId) || chainId < 1) throw Errors.unavailable();
    const entitlement = await this.prisma.entitlementProjection.findFirst({
      where: { chainId, buyerWallet: walletAddress, chainCourseId, revokedAt: null },
      select: { id: true },
    });
    if (!entitlement) throw Errors.forbidden();
  }
}

export function entitlementReaderFactory(prisma: PrismaService): EntitlementReader {
  const explicitStaticCourseIds = process.env.LOCAL_PURCHASED_COURSE_IDS?.trim();
  return ["local", "test"].includes(process.env.APP_ENV ?? "") && explicitStaticCourseIds
    ? new LocalEntitlementReader()
    : new ProjectedEntitlementReader(prisma);
}
