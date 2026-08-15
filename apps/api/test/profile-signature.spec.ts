import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../src/auth/principal";
import type { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

const account = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

describe("profile EIP-712 challenge", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    delete process.env.PROFILE_VERIFYING_CONTRACT;
  });

  it("binds the name, wallet, nonce and expiry before consuming the challenge", async () => {
    let saved:
      | { id: string; userId: string; nonce: string; expiresAt: Date; usedAt: Date | null }
      | undefined;
    let displayName: string | undefined;
    const prisma = {
      profileChallenge: {
        create: async ({ data }: { data: Omit<NonNullable<typeof saved>, "id" | "usedAt"> }) => {
          saved = { id: "challenge-1", ...data, usedAt: null };
          return saved;
        },
        findFirst: async () => (saved && !saved.usedAt ? saved : null),
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          profileChallenge: {
            updateMany: async () => {
              if (!saved || saved.usedAt) return { count: 0 };
              saved.usedAt = new Date();
              return { count: 1 };
            },
          },
          user: {
            update: async ({ data }: { data: { displayName: string } }) => {
              displayName = data.displayName;
              return { displayName };
            },
          },
        }),
    } as unknown as PrismaService;
    const principal: Principal = {
      userId: "user-1",
      privySubject: "did:privy:user-1",
      wallet: { id: "wallet-1", address: account.address, chainId: 11_155_111 },
      role: "STUDENT",
    };
    const service = new UsersService(prisma);
    const challenge = await service.createProfileChallenge(principal, "Alice");
    const signature = await account.signTypedData({
      ...challenge.typedData,
      message: {
        ...challenge.typedData.message,
        expiresAt: BigInt(challenge.typedData.message.expiresAt),
      },
    });

    await expect(
      service.updateProfile(principal, challenge.nonce, signature, "Mallory"),
    ).rejects.toMatchObject({ status: 403 });
    expect(saved?.usedAt).toBeNull();

    await expect(
      service.updateProfile(principal, challenge.nonce, signature, "Alice"),
    ).resolves.toEqual({ displayName: "Alice" });
    expect(displayName).toBe("Alice");

    await expect(
      service.updateProfile(principal, challenge.nonce, signature, "Alice"),
    ).rejects.toMatchObject({ status: 409 });
  });
});
