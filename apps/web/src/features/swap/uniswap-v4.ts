import {
  type Address,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  parseAbiParameters,
} from "viem";
import { createSwapPool, NATIVE_ETH_ADDRESS, type SwapAsset, type SwapPool } from "./swap-domain";

export const TEST_USDT_ADDRESS = "0xd077a400968890eacc75cdc901f0356c943e4fdb" as const;
export const TEST_USDT_DECIMALS = 6;
export const YD_DECIMALS = 18;

/** Official Sepolia addresses, verified against Uniswap's deployment registry on 2026-08-16. */
export const UNISWAP_V4_SEPOLIA = {
  poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
  universalRouter: "0x7dfd4f31be6814d2906bde155c3e1b146eac1468",
  positionManager: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4",
  stateView: "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c",
  quoter: "0x61b3f2011a92d183c7dbadbda940a7555ccf9227",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const satisfies Record<string, Address>;

export const v4QuoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
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
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const stateViewAbi = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

export const permit2Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

export const universalRouterAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const swapExactInSingleParameters = [
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
const settleOrTakeParameters = parseAbiParameters("address currency, uint256 amount");
const v4SwapParameters = parseAbiParameters("bytes actions, bytes[] parameters");

export function poolFor(asset: SwapAsset, ydAddress: Address): SwapPool {
  const input = asset === "test-usdt" ? TEST_USDT_ADDRESS : NATIVE_ETH_ADDRESS;
  return createSwapPool(input, ydAddress);
}

export async function quoteExactInput(
  client: PublicClient,
  pool: SwapPool,
  amountIn: bigint,
  account?: Address,
): Promise<{ amountOut: bigint; gasEstimate: bigint; sqrtPriceX96: bigint }> {
  const data = encodeFunctionData({
    abi: v4QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: pool.key,
        zeroForOne: pool.zeroForOne,
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
  });
  const [quoteCall, slot0] = await Promise.all([
    client.call({ to: UNISWAP_V4_SEPOLIA.quoter, data, account }),
    client.readContract({
      address: UNISWAP_V4_SEPOLIA.stateView,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [pool.poolId],
    }),
  ]);
  if (!quoteCall.data) throw new Error("The Uniswap quoter returned no data.");
  const [amountOut, gasEstimate] = decodeFunctionResult({
    abi: v4QuoterAbi,
    functionName: "quoteExactInputSingle",
    data: quoteCall.data,
  });
  return { amountOut, gasEstimate, sqrtPriceX96: slot0[0] };
}

export function buildExactInputPlan({
  pool,
  amountIn,
  minimumOut,
}: {
  pool: SwapPool;
  amountIn: bigint;
  minimumOut: bigint;
}): { commands: Hex; inputs: readonly Hex[] } {
  const swap = encodeAbiParameters(swapExactInSingleParameters, [
    {
      poolKey: pool.key,
      zeroForOne: pool.zeroForOne,
      amountIn,
      amountOutMinimum: minimumOut,
      minHopPriceX36: 0n,
      hookData: "0x",
    },
  ]);
  const settle = encodeAbiParameters(settleOrTakeParameters, [pool.inputCurrency, amountIn]);
  const take = encodeAbiParameters(settleOrTakeParameters, [pool.outputCurrency, minimumOut]);
  const v4Swap = encodeAbiParameters(v4SwapParameters, ["0x060c0f", [swap, settle, take]]);

  return {
    // Universal Router 2.1.1 command 0x10 = V4_SWAP. Actions are
    // SWAP_EXACT_IN_SINGLE (0x06), SETTLE_ALL (0x0c), TAKE_ALL (0x0f).
    commands: "0x10",
    inputs: [v4Swap],
  };
}
