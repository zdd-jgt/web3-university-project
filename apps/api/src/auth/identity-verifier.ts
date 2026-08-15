import { Injectable } from "@nestjs/common";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  PrivyClient,
  RateLimitError,
  type User,
} from "@privy-io/node";
import { Errors } from "../common/app-error";

export type VerifiedIdentity = { privySubject: string; walletAddress: string; chainId: number };
export interface IdentityVerifier {
  verify(token: string, requestedWallet?: string): Promise<VerifiedIdentity>;
}
export const IDENTITY_VERIFIER = Symbol("IDENTITY_VERIFIER");

function normalizeWallet(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) throw Errors.unauthenticated();
  return normalized;
}

@Injectable()
export class LocalIdentityVerifier implements IdentityVerifier {
  async verify(token: string, requestedWallet?: string): Promise<VerifiedIdentity> {
    if (!["local", "test"].includes(process.env.APP_ENV ?? "")) throw Errors.unauthenticated();
    // Explicitly development-only format; never enable it in staging/production.
    const parts = token.split(":");
    if (parts.length !== 3 || parts[0] !== "local" || !parts[1] || !parts[2])
      throw Errors.unauthenticated();
    const chainId = Number(process.env.CHAIN_ID ?? "11155111");
    if (!Number.isSafeInteger(chainId) || chainId < 1) throw Errors.unauthenticated();
    const walletAddress = normalizeWallet(parts[2]);
    if (requestedWallet && normalizeWallet(requestedWallet) !== walletAddress) {
      throw Errors.unauthenticated();
    }
    return { privySubject: parts[1], walletAddress, chainId };
  }
}

@Injectable()
export class PrivyProductionVerifier implements IdentityVerifier {
  private readonly client: PrivyClient;
  private readonly chainId: number;

  constructor() {
    const appId = process.env.PRIVY_APP_ID?.trim();
    const appSecret = process.env.PRIVY_APP_SECRET?.trim();
    const chainId = Number(process.env.CHAIN_ID ?? "11155111");
    if (!appId || !appSecret || !Number.isSafeInteger(chainId) || chainId < 1) {
      throw Errors.unavailable();
    }
    this.chainId = chainId;
    this.client = new PrivyClient({
      appId,
      appSecret,
      ...(process.env.PRIVY_VERIFICATION_KEY?.trim()
        ? { jwtVerificationKey: process.env.PRIVY_VERIFICATION_KEY.trim() }
        : {}),
    });
  }

  async verify(token: string, requestedWallet?: string): Promise<VerifiedIdentity> {
    if (!requestedWallet) throw Errors.unauthenticated();
    const walletAddress = normalizeWallet(requestedWallet);
    try {
      const claims = await this.client.utils().auth().verifyAuthToken(token);
      const user = await this.client.users()._get(claims.user_id);
      if (!isLinkedEthereumWallet(user, walletAddress)) throw Errors.unauthenticated();
      return { privySubject: claims.user_id, walletAddress, chainId: this.chainId };
    } catch (error) {
      if (
        error instanceof APIConnectionError ||
        error instanceof APIConnectionTimeoutError ||
        error instanceof RateLimitError
      ) {
        throw Errors.unavailable();
      }
      throw Errors.unauthenticated();
    }
  }
}

function isLinkedEthereumWallet(user: User, walletAddress: string): boolean {
  return user.linked_accounts.some((account) => {
    if (account.type !== "wallet" || !("chain_type" in account)) return false;
    return account.chain_type === "ethereum" && normalizeWallet(account.address) === walletAddress;
  });
}

export function identityVerifierFactory(): IdentityVerifier {
  return ["local", "test"].includes(process.env.APP_ENV ?? "")
    ? new LocalIdentityVerifier()
    : new PrivyProductionVerifier();
}
