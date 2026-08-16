import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { formatUnits, type Hash } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { PageIntro } from "../../components/layout";
import { Button, Card, Field } from "../../components/ui";
import { contractAddresses, erc20ApprovalAbi, sepoliaChainId } from "../../lib/chain";
import { runtime, useWalletSession } from "../../lib/runtime";
import {
  deadlineFrom,
  minimumAmountOut,
  parsePositiveAmount,
  parseSlippageBps,
  priceImpactBps,
  SWAP_DEADLINE_SECONDS,
  type SwapAsset,
} from "./swap-domain";
import {
  buildExactInputPlan,
  permit2Abi,
  poolFor,
  quoteExactInput,
  TEST_USDT_ADDRESS,
  TEST_USDT_DECIMALS,
  UNISWAP_V4_SEPOLIA,
  universalRouterAbi,
  YD_DECIMALS,
} from "./uniswap-v4";

type ActionState = {
  phase: "idle" | "authorizing" | "swapping" | "success" | "error";
  message: string;
  hash?: Hash;
};

const idleAction: ActionState = { phase: "idle", message: "" };

function assetLabel(asset: SwapAsset) {
  return asset === "test-usdt" ? "Test USDT" : "SepoliaETH";
}

function swapErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (/user rejected|denied/i.test(error.message)) return "你取消了钱包请求，没有继续发送交易。";
    if (/allowance|approve/i.test(error.message)) return "授权尚未生效，请确认交易后重试。";
    if (/insufficient funds|exceeds balance/i.test(error.message))
      return "测试资产或 Gas 余额不足。";
    if (/revert|too little received|slippage/i.test(error.message)) {
      return "链上价格或流动性已经变化，交易未完成。请刷新报价后重试。";
    }
  }
  return "操作未完成。请检查 Sepolia 网络、测试资产余额和池流动性后重试。";
}

function formatTokenAmount(
  amount: bigint | undefined,
  decimals: number,
  maximumFractionDigits = 6,
) {
  if (amount === undefined) return "—";
  const value = Number(formatUnits(amount, decimals));
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits })
    : formatUnits(amount, decimals);
}

export function SwapPage() {
  const [asset, setAsset] = useState<SwapAsset>("test-usdt");
  const [amount, setAmount] = useState("10");
  const [slippage, setSlippage] = useState("0.5");
  const [action, setAction] = useState<ActionState>(idleAction);
  const wallet = useWalletSession();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const ydAddress = contractAddresses.ydToken;
  const inputDecimals = asset === "test-usdt" ? TEST_USDT_DECIMALS : 18;
  const amountIn = parsePositiveAmount(amount, inputDecimals);
  const slippageBps = parseSlippageBps(slippage);
  const pool = ydAddress ? poolFor(asset, ydAddress) : undefined;
  const quoteEnabled = Boolean(runtime.hasRpc && publicClient && pool && amountIn && slippageBps);

  const quote = useQuery({
    queryKey: ["uniswap-v4-quote", pool?.poolId, amountIn?.toString()],
    queryFn: async () => {
      if (!publicClient || !pool || !amountIn) throw new Error("Swap configuration is incomplete.");
      return quoteExactInput(publicClient, pool, amountIn, wallet.address);
    },
    enabled: quoteEnabled,
    staleTime: 10_000,
    retry: 1,
    refetchInterval: 15_000,
  });

  const authorization = useQuery({
    queryKey: ["uniswap-v4-authorization", wallet.address, amountIn?.toString()],
    queryFn: async () => {
      if (!publicClient || !wallet.address || !amountIn) {
        throw new Error("Wallet authorization cannot be read.");
      }
      const [tokenAllowance, permitAllowance] = await Promise.all([
        publicClient.readContract({
          address: TEST_USDT_ADDRESS,
          abi: erc20ApprovalAbi,
          functionName: "allowance",
          args: [wallet.address, UNISWAP_V4_SEPOLIA.permit2],
        }),
        publicClient.readContract({
          address: UNISWAP_V4_SEPOLIA.permit2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [wallet.address, TEST_USDT_ADDRESS, UNISWAP_V4_SEPOLIA.universalRouter],
        }),
      ]);
      const now = BigInt(Math.floor(Date.now() / 1_000));
      return {
        tokenAllowance,
        permitAmount: permitAllowance[0],
        permitExpiration: permitAllowance[1],
        ready:
          tokenAllowance >= amountIn &&
          permitAllowance[0] >= amountIn &&
          BigInt(permitAllowance[1]) > now + BigInt(SWAP_DEADLINE_SECONDS),
      };
    },
    enabled: Boolean(
      asset === "test-usdt" && publicClient && wallet.address && wallet.canTransact && amountIn,
    ),
    staleTime: 5_000,
  });

  const quotedAmountOut = quote.data?.amountOut;
  const minimumOut =
    quotedAmountOut !== undefined && slippageBps !== null
      ? minimumAmountOut(quotedAmountOut, slippageBps)
      : undefined;
  const impact =
    quote.data && amountIn && pool
      ? priceImpactBps({
          amountIn,
          quotedAmountOut: quote.data.amountOut,
          sqrtPriceX96: quote.data.sqrtPriceX96,
          zeroForOne: pool.zeroForOne,
        })
      : null;
  const numericInput = Number(amount);
  const numericOutput = quotedAmountOut ? Number(formatUnits(quotedAmountOut, YD_DECIMALS)) : 0;
  const rate =
    numericInput > 0 && Number.isFinite(numericOutput) ? numericOutput / numericInput : 0;
  const busy = action.phase === "authorizing" || action.phase === "swapping";
  const canQuote = quoteEnabled && !quote.isError;

  async function confirmTransaction(hash: Hash, failureMessage: string) {
    if (!publicClient) throw new Error("Sepolia RPC is unavailable.");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(failureMessage);
  }

  async function authorizeTestUsdt() {
    try {
      if (!publicClient || !wallet.address || !amountIn || asset !== "test-usdt") {
        throw new Error("Connect a Sepolia wallet and enter a valid amount first.");
      }
      setAction({ phase: "authorizing", message: "正在检查 Test USDT 授权…" });
      let tokenAllowance = await publicClient.readContract({
        address: TEST_USDT_ADDRESS,
        abi: erc20ApprovalAbi,
        functionName: "allowance",
        args: [wallet.address, UNISWAP_V4_SEPOLIA.permit2],
      });
      if (tokenAllowance > 0n && tokenAllowance < amountIn) {
        setAction({ phase: "authorizing", message: "请先确认清理旧的 Test USDT 授权。" });
        const resetHash = await writeContractAsync({
          chainId: sepoliaChainId,
          address: TEST_USDT_ADDRESS,
          abi: erc20ApprovalAbi,
          functionName: "approve",
          args: [UNISWAP_V4_SEPOLIA.permit2, 0n],
        });
        await confirmTransaction(resetHash, "The Test USDT allowance reset reverted.");
        tokenAllowance = 0n;
      }
      if (tokenAllowance < amountIn) {
        setAction({ phase: "authorizing", message: "请确认 Test USDT 仅授权本次输入数量。" });
        const approvalHash = await writeContractAsync({
          chainId: sepoliaChainId,
          address: TEST_USDT_ADDRESS,
          abi: erc20ApprovalAbi,
          functionName: "approve",
          args: [UNISWAP_V4_SEPOLIA.permit2, amountIn],
        });
        await confirmTransaction(approvalHash, "The Test USDT approval reverted.");
      }

      const permitAllowance = await publicClient.readContract({
        address: UNISWAP_V4_SEPOLIA.permit2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [wallet.address, TEST_USDT_ADDRESS, UNISWAP_V4_SEPOLIA.universalRouter],
      });
      const expiration = Math.floor(Date.now() / 1_000) + 60 * 60;
      if (permitAllowance[0] < amountIn || BigInt(permitAllowance[1]) <= deadlineFrom(Date.now())) {
        setAction({
          phase: "authorizing",
          message: "请确认 Permit2 对 Uniswap Router 的限时授权。",
        });
        const permitHash = await writeContractAsync({
          chainId: sepoliaChainId,
          address: UNISWAP_V4_SEPOLIA.permit2,
          abi: permit2Abi,
          functionName: "approve",
          args: [TEST_USDT_ADDRESS, UNISWAP_V4_SEPOLIA.universalRouter, amountIn, expiration],
        });
        await confirmTransaction(permitHash, "The Permit2 approval reverted.");
      }
      await authorization.refetch();
      setAction({ phase: "idle", message: "Test USDT 授权已确认，可以兑换。" });
    } catch (error) {
      setAction({ phase: "error", message: swapErrorMessage(error) });
    }
  }

  async function executeSwap() {
    try {
      if (!publicClient || !wallet.address || !pool || !amountIn || slippageBps === null) {
        throw new Error("Connect a Sepolia wallet and enter valid swap settings first.");
      }
      if (asset === "test-usdt") {
        const freshAuthorization = await authorization.refetch();
        if (!freshAuthorization.data?.ready) throw new Error("Test USDT allowance is incomplete.");
      }
      setAction({ phase: "swapping", message: "正在重新读取链上报价…" });
      const freshQuote = await quoteExactInput(publicClient, pool, amountIn, wallet.address);
      const freshMinimum = minimumAmountOut(freshQuote.amountOut, slippageBps);
      const deadline = deadlineFrom(Date.now());
      const plan = buildExactInputPlan({ pool, amountIn, minimumOut: freshMinimum });
      setAction({ phase: "swapping", message: "请在钱包中核对并确认兑换交易。" });
      const hash = await writeContractAsync({
        chainId: sepoliaChainId,
        address: UNISWAP_V4_SEPOLIA.universalRouter,
        abi: universalRouterAbi,
        functionName: "execute",
        args: [plan.commands, [...plan.inputs], deadline],
        value: asset === "sepolia-eth" ? amountIn : 0n,
      });
      await confirmTransaction(hash, "The Uniswap swap reverted.");
      await quote.refetch();
      if (asset === "test-usdt") await authorization.refetch();
      setAction({ phase: "success", message: "兑换交易已在 Sepolia 确认。", hash });
    } catch (error) {
      setAction({ phase: "error", message: swapErrorMessage(error) });
    }
  }

  function primaryAction() {
    if (!ydAddress || !runtime.hasRpc) {
      return (
        <Button disabled type="button">
          等待 YD 与 Sepolia RPC 配置
        </Button>
      );
    }
    if (!wallet.canTransact) {
      return (
        <Button type="button" onClick={wallet.connect}>
          登录并连接 Sepolia 钱包
        </Button>
      );
    }
    if (asset === "test-usdt" && !authorization.data?.ready) {
      return (
        <Button
          disabled={busy || !canQuote || !quotedAmountOut || authorization.isLoading}
          type="button"
          onClick={authorizeTestUsdt}
        >
          {action.phase === "authorizing" ? "授权确认中…" : "授权 Test USDT"}
        </Button>
      );
    }
    return (
      <Button disabled={busy || !canQuote || !quotedAmountOut} type="button" onClick={executeSwap}>
        {action.phase === "swapping" ? "兑换确认中…" : "兑换为 YD"}
      </Button>
    );
  }

  return (
    <div className="page narrow">
      <PageIntro eyebrow="UNISWAP V4 · SEPOLIA" title="用测试资产兑换 YD。">
        报价直接模拟官方 Uniswap v4 池。两个池独立定价，课程购买仍然是另一笔 YD 授权和购买交易。
      </PageIntro>
      <Card className="swap-card">
        <label className="select-field" htmlFor="pay-asset">
          你支付
          <select
            id="pay-asset"
            value={asset}
            onChange={(event) => {
              setAsset(event.target.value as SwapAsset);
              setAction(idleAction);
            }}
          >
            <option value="test-usdt">Test USDT</option>
            <option value="sepolia-eth">SepoliaETH</option>
          </select>
        </label>
        <Field
          label={`${assetLabel(asset)} 数量`}
          id="swap-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setAction(idleAction);
          }}
          error={amountIn ? undefined : `请输入有效数量，最多 ${inputDecimals} 位小数。`}
        />
        <div className="swap-arrow" aria-hidden="true">
          <ArrowDownUp />
        </div>
        <div className="quote-output" aria-live="polite">
          <span>预计获得</span>
          <strong>
            {quote.isFetching && !quotedAmountOut
              ? "读取链上报价…"
              : `${formatTokenAmount(quotedAmountOut, YD_DECIMALS)} YD`}
          </strong>
          <small>Uniswap v4 Quoter 模拟 · 每 15 秒刷新</small>
        </div>
        <dl className="quote-details">
          <div>
            <dt>当前报价</dt>
            <dd>
              {rate > 0
                ? `1 ${assetLabel(asset)} ≈ ${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} YD`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>价格影响（含 0.30% 池费）</dt>
            <dd>{impact === null ? "—" : `${(impact / 100).toFixed(2)}%`}</dd>
          </div>
          <div>
            <dt>滑点容忍</dt>
            <dd>
              <label>
                <input
                  aria-label="滑点容忍百分比"
                  value={slippage}
                  onChange={(event) => {
                    setSlippage(event.target.value);
                    setAction(idleAction);
                  }}
                />
                %
              </label>
            </dd>
          </div>
          <div>
            <dt>最少获得</dt>
            <dd>{formatTokenAmount(minimumOut, YD_DECIMALS)} YD</dd>
          </div>
          <div>
            <dt>交易截止时间</dt>
            <dd>点击兑换后 20 分钟</dd>
          </div>
          <div>
            <dt>授权方式</dt>
            <dd>
              {asset === "test-usdt" ? "Test USDT → Permit2 → Router" : "原生 ETH，无需 approve"}
            </dd>
          </div>
        </dl>
        {slippageBps === null && (
          <p className="error" role="alert">
            滑点必须在 0.1% 到 5% 之间。
          </p>
        )}
        {quote.isError && (
          <p className="error" role="alert">
            无法取得报价。池可能尚未创建、没有可用流动性，或者 Sepolia RPC 暂时不可用。
          </p>
        )}
        {impact !== null && impact >= 500 && (
          <p className="warning-callout" role="alert">
            <TriangleAlert size={18} />
            价格影响达到 5% 或以上，请减少兑换数量或等待流动性改善。
          </p>
        )}
        {action.message && (
          <p className={action.phase === "error" ? "error" : "fine-print"} role="status">
            {busy && <RefreshCw className="spin" size={14} />} {action.message}
          </p>
        )}
        {primaryAction()}
        {action.hash && (
          <a
            className="text-link"
            href={`https://sepolia.etherscan.io/tx/${action.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            查看兑换交易 <ExternalLink size={13} />
          </a>
        )}
        <p className="fine-print">
          Test USDT、SepoliaETH 和 YD 都没有真实价值。授权和兑换分别由钱包明确确认；平台不接触私钥。
        </p>
      </Card>
    </div>
  );
}
