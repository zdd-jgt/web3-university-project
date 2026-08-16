import { describe, expect, it } from "vitest";
import {
  createSwapPool,
  minimumAmountOut,
  NATIVE_ETH_ADDRESS,
  parsePositiveAmount,
  parseSlippageBps,
  priceImpactBps,
} from "./swap-domain";

const yd = "0x9999999999999999999999999999999999999999" as const;

describe("swap domain", () => {
  it("sorts the PoolKey while retaining the input direction", () => {
    const pool = createSwapPool(NATIVE_ETH_ADDRESS, yd);

    expect(pool.key.currency0).toBe(NATIVE_ETH_ADDRESS);
    expect(pool.key.currency1).toBe(yd);
    expect(pool.zeroForOne).toBe(true);
    expect(pool.key.fee).toBe(3_000);
    expect(pool.key.tickSpacing).toBe(60);
    expect(pool.poolId).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("accepts plain positive decimal amounts within token precision", () => {
    expect(parsePositiveAmount("1.25", 6)).toBe(1_250_000n);
    expect(parsePositiveAmount("1e3", 6)).toBeNull();
    expect(parsePositiveAmount("0", 18)).toBeNull();
    expect(parsePositiveAmount("1.0000001", 6)).toBeNull();
  });

  it("bounds slippage to the user-visible safety range", () => {
    expect(parseSlippageBps("0.5")).toBe(50);
    expect(parseSlippageBps("0.09")).toBeNull();
    expect(parseSlippageBps("5.01")).toBeNull();
    expect(minimumAmountOut(10_000n, 50)).toBe(9_950n);
  });

  it("estimates price impact against the current Q96 mid-price", () => {
    const q96 = 1n << 96n;
    expect(
      priceImpactBps({
        amountIn: 10_000n,
        quotedAmountOut: 9_900n,
        sqrtPriceX96: q96,
        zeroForOne: true,
      }),
    ).toBe(100);
  });
});
