import { decodeAbiParameters, parseAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { createSwapPool, NATIVE_ETH_ADDRESS } from "./swap-domain";
import { buildExactInputPlan } from "./uniswap-v4";

const swapParameters = [
  {
    type: "tuple",
    components: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "minHopPriceX36", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

describe("Uniswap v4 transaction plan", () => {
  it("encodes exact-input swap, settlement and output collection for Universal Router 2.1.1", () => {
    const pool = createSwapPool(NATIVE_ETH_ADDRESS, "0x9999999999999999999999999999999999999999");
    const plan = buildExactInputPlan({ pool, amountIn: 1_000n, minimumOut: 9_500n });

    expect(plan.commands).toBe("0x10");
    expect(plan.inputs).toHaveLength(1);
    const [actions, parameters] = decodeAbiParameters(
      parseAbiParameters("bytes actions, bytes[] parameters"),
      plan.inputs[0],
    );
    expect(actions).toBe("0x060c0f");
    expect(parameters).toHaveLength(3);

    const [swap] = decodeAbiParameters(swapParameters, parameters[0]);
    const [settleCurrency, maximumInput] = decodeAbiParameters(
      parseAbiParameters("address currency, uint256 amount"),
      parameters[1],
    );
    const [takeCurrency, minimumOutput] = decodeAbiParameters(
      parseAbiParameters("address currency, uint256 amount"),
      parameters[2],
    );
    expect(swap.poolKey).toEqual(pool.key);
    expect(swap.zeroForOne).toBe(true);
    expect(swap.amountIn).toBe(1_000n);
    expect(swap.amountOutMinimum).toBe(9_500n);
    expect(swap.minHopPriceX36).toBe(0n);
    expect(settleCurrency).toBe(pool.inputCurrency);
    expect(maximumInput).toBe(1_000n);
    expect(takeCurrency).toBe(pool.outputCurrency);
    expect(minimumOutput).toBe(9_500n);
  });
});
