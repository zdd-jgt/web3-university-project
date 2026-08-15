import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { getAddress, verifyTypedData, type Address, type Hex } from "viem";
import type { VerifiedIdentity } from "../auth/identity-verifier";
import type { Principal } from "../auth/principal";
import { Errors } from "../common/app-error";
import { PrismaService } from "../prisma/prisma.service";

const profileTypes = {
  ProfileUpdate: [
    { name: "action", type: "string" },
    { name: "userId", type: "string" },
    { name: "wallet", type: "address" },
    { name: "displayName", type: "string" },
    { name: "nonce", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(identity: VerifiedIdentity): Promise<Principal> {
    const user = await this.prisma.user.upsert({
      where: { privySubject: identity.privySubject },
      create: {
        privySubject: identity.privySubject,
        role: localBootstrapRole(identity.privySubject),
      },
      update: {},
    });
    const existing = await this.prisma.wallet.findUnique({
      where: { chainId_address: { chainId: identity.chainId, address: identity.walletAddress } },
    });
    if (existing && existing.userId !== user.id) throw Errors.forbidden();
    const hasPrimary = await this.prisma.wallet.count({
      where: { userId: user.id, isPrimary: true },
    });
    const wallet = existing
      ? await this.prisma.wallet.update({
          where: { id: existing.id },
          data: { verifiedAt: new Date() },
        })
      : await this.prisma.wallet.create({
          data: {
            userId: user.id,
            address: identity.walletAddress,
            chainId: identity.chainId,
            verifiedAt: new Date(),
            isPrimary: hasPrimary === 0,
          },
        });
    return {
      userId: user.id,
      privySubject: user.privySubject,
      wallet: { id: wallet.id, address: wallet.address, chainId: wallet.chainId },
      role: user.role,
    };
  }

  async createProfileChallenge(principal: Principal, displayName: string) {
    const normalizedName = displayName.trim();
    if (!normalizedName || normalizedName.length > 80) throw Errors.validation();
    const nonce = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.prisma.profileChallenge.create({
      data: { userId: principal.userId, nonce, expiresAt },
    });
    const signingData = profileTypedData(principal, nonce, expiresAt, normalizedName);
    return {
      nonce,
      expiresAt,
      typedData: {
        ...signingData,
        message: { ...signingData.message, expiresAt: signingData.message.expiresAt.toString() },
      },
    };
  }

  async updateProfile(principal: Principal, nonce: string, signature: string, displayName: string) {
    const normalizedName = displayName.trim();
    if (!normalizedName || normalizedName.length > 80 || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      throw Errors.validation();
    }
    const challenge = await this.prisma.profileChallenge.findFirst({
      where: { userId: principal.userId, nonce, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, expiresAt: true },
    });
    if (!challenge) throw Errors.replay();

    let valid = false;
    try {
      valid = await verifyTypedData({
        address: getAddress(principal.wallet.address),
        ...profileTypedData(principal, nonce, challenge.expiresAt, normalizedName),
        signature: signature as Hex,
      });
    } catch {
      throw Errors.forbidden();
    }
    if (!valid) throw Errors.forbidden();

    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.profileChallenge.updateMany({
        where: {
          id: challenge.id,
          userId: principal.userId,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw Errors.replay();
      return tx.user.update({
        where: { id: principal.userId },
        data: { displayName: normalizedName },
        select: { displayName: true },
      });
    });
  }
}

function profileTypedData(
  principal: Principal,
  nonce: string,
  expiresAt: Date,
  displayName: string,
) {
  return {
    domain: {
      name: "Web3 University",
      version: "1",
      chainId: principal.wallet.chainId,
      verifyingContract: profileVerifyingContract(),
    },
    types: profileTypes,
    primaryType: "ProfileUpdate" as const,
    message: {
      action: "UPDATE_PROFILE",
      userId: principal.userId,
      wallet: getAddress(principal.wallet.address),
      displayName,
      nonce,
      expiresAt: BigInt(Math.floor(expiresAt.getTime() / 1000)),
    },
  };
}

function profileVerifyingContract(): Address {
  const configured = process.env.PROFILE_VERIFYING_CONTRACT?.trim();
  const fallback = ["local", "test"].includes(process.env.APP_ENV ?? "")
    ? "0x0000000000000000000000000000000000000001"
    : undefined;
  if (!configured && !fallback) throw Errors.unavailable();
  try {
    return getAddress(configured ?? fallback ?? "");
  } catch {
    throw Errors.unavailable();
  }
}

function localBootstrapRole(privySubject: string): "ADMIN" | "STUDENT" {
  const isLocal = ["local", "test"].includes(process.env.APP_ENV ?? "");
  return isLocal && process.env.LOCAL_ADMIN_SUBJECT?.trim() === privySubject ? "ADMIN" : "STUDENT";
}
