import {
  type Address,
  encodeAbiParameters,
  getAddress,
  type Hex,
  keccak256,
  parseAbiParameters,
  parseUnits,
} from "viem";

export const NATIVE_ETH_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const NO_HOOKS_ADDRESS = NATIVE_ETH_ADDRESS;
export const SWAP_FEE = 3_000;
export const SWAP_TICK_SPACING = 60;
export const DEFAULT_SLIPPAGE_BPS = 50;
export const SWAP_DEADLINE_SECONDS = 20 * 60;
export const UINT128_MAX = (1n << 128n) - 1n;

const Q192 = 1n << 192n;
const poolKeyParameters = parseAbiParameters(
  "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
);

export type SwapAsset = "test-usdt" | "sepolia-eth";

export type PoolKey = {
  readonly currency0: Address;
  readonly currency1: Address;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: Address;
};

export type SwapPool = {
  readonly key: PoolKey;
  readonly poolId: Hex;
  readonly inputCurrency: Address;
  readonly outputCurrency: Address;
  readonly zeroForOne: boolean;
};

/** A v4 pool is identified by sorted currencies plus fee, tick spacing and hook address. */
export function createSwapPool(inputCurrency: Address, outputCurrency: Address): SwapPool {
  const input = getAddress(inputCurrency);
  const output = getAddress(outputCurrency);
  if (input === output) throw new Error("A pool requires two different currencies.");

  const [currency0, currency1] = BigInt(input) < BigInt(output) ? [input, output] : [output, input];
  const key: PoolKey = {
    currency0,
    currency1,
    fee: SWAP_FEE,
    tickSpacing: SWAP_TICK_SPACING,
    hooks: NO_HOOKS_ADDRESS,
  };
  const encodedKey = encodeAbiParameters(poolKeyParameters, [key]);
  return {
    key,
    poolId: keccak256(encodedKey),
    inputCurrency: input,
    outputCurrency: output,
    zeroForOne: input === currency0,
  };
}

export function parsePositiveAmount(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const fractionalDigits = normalized.split(".")[1]?.length ?? 0;
  if (fractionalDigits > decimals) return null;
  try {
    const amount = parseUnits(normalized, decimals);
    return amount > 0n && amount <= UINT128_MAX ? amount : null;
  } catch {
    return null;
  }
}

export function parseSlippageBps(value: string): number | null {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0.1 || percent > 5) return null;
  return Math.round(percent * 100);
}

export function minimumAmountOut(quotedAmountOut: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error("Slippage must be an integer number of basis points below 100%.");
  }
  return (quotedAmountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Returns an estimate that includes the LP fee because it compares the quote with the current mid-price. */
export function priceImpactBps({
  amountIn,
  quotedAmountOut,
  sqrtPriceX96,
  zeroForOne,
}: {
  amountIn: bigint;
  quotedAmountOut: bigint;
  sqrtPriceX96: bigint;
  zeroForOne: boolean;
}): number | null {
  if (amountIn <= 0n || quotedAmountOut <= 0n || sqrtPriceX96 <= 0n) return null;
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  const spotAmountOut = zeroForOne ? (amountIn * priceX192) / Q192 : (amountIn * Q192) / priceX192;
  if (spotAmountOut <= 0n || quotedAmountOut >= spotAmountOut) return 0;
  return Number(((spotAmountOut - quotedAmountOut) * 10_000n) / spotAmountOut);
}

export function deadlineFrom(nowMilliseconds: number): bigint {
  return BigInt(Math.floor(nowMilliseconds / 1_000) + SWAP_DEADLINE_SECONDS);
}
