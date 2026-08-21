import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  createConfig as createPrivyWagmiConfig,
  WagmiProvider as PrivyWagmiProvider,
} from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import type { Address } from "viem";
import { createConfig as createWagmiConfig, http, useAccount, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { contractAddresses } from "./chain";
import { PLATFORM_NAME } from "./localization";

const appId = import.meta.env.VITE_PRIVY_APP_ID;
const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
const configuredMarketplace = Boolean(
  contractAddresses.courseCatalog && contractAddresses.courseMarket && contractAddresses.ydToken,
);

export const runtime = {
  hasPrivy: Boolean(appId),
  hasRpc: Boolean(rpcUrl),
  hasMarketplace: configuredMarketplace,
  isDemo: !appId || !rpcUrl,
  chain: "Sepolia",
  reason: !appId ? "VITE_PRIVY_APP_ID 未配置" : !rpcUrl ? "VITE_SEPOLIA_RPC_URL 未配置" : "",
};

const wagmiOptions = {
  chains: [sepolia] as const,
  transports: { [sepolia.id]: http(rpcUrl) },
  ssr: false,
};
const privyWagmiConfig = createPrivyWagmiConfig(wagmiOptions);
const demoWagmiConfig = createWagmiConfig(wagmiOptions);
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export type WalletSession = {
  mode: "demo" | "live";
  ready: boolean;
  authenticated: boolean;
  address?: Address;
  chainId?: number;
  connectorName?: string;
  canTransact: boolean;
  blockedReason: string;
  connect: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string | null>;
};

const WalletSessionContext = createContext<WalletSession | null>(null);

function sessionFromAccount({
  address,
  chainId,
  connectorName,
  ready,
  authenticated,
  connect,
  logout,
  getAccessToken,
}: Omit<WalletSession, "mode" | "canTransact" | "blockedReason">): WalletSession {
  const blockedReason = runtime.isDemo
    ? `演示模式：${runtime.reason}。`
    : !ready
      ? "钱包会话仍在加载中。"
      : !authenticated
        ? "请先通过 Privy 登录，再连接钱包。"
        : !address
          ? "请连接内嵌钱包或桌面外部钱包。"
          : chainId !== sepolia.id
            ? "请将当前钱包切换到 Sepolia。"
            : "";
  return {
    mode: runtime.isDemo ? "demo" : "live",
    ready,
    authenticated,
    address,
    chainId,
    connectorName,
    canTransact: !blockedReason,
    blockedReason,
    connect,
    logout,
    getAccessToken,
  };
}

function PrivyWalletSession({ children }: { children: ReactNode }) {
  const { ready, authenticated, connectOrCreateWallet, connectWallet, getAccessToken, logout } =
    usePrivy();
  const { address, chainId, connector, isConnected } = useAccount();
  const session = sessionFromAccount({
    ready,
    authenticated,
    address: isConnected ? address : undefined,
    chainId: isConnected ? chainId : undefined,
    connectorName: connector?.name,
    connect: authenticated ? connectWallet : connectOrCreateWallet,
    logout,
    getAccessToken,
  });
  return <WalletSessionContext.Provider value={session}>{children}</WalletSessionContext.Provider>;
}

function DemoWalletSession({ children }: { children: ReactNode }) {
  const session = sessionFromAccount({
    ready: true,
    authenticated: false,
    connect: () => undefined,
    logout: () => undefined,
    getAccessToken: async () => null,
  });
  return <WalletSessionContext.Provider value={session}>{children}</WalletSessionContext.Provider>;
}

function ProviderBoundary({ children }: { children: ReactNode }) {
  if (appId && rpcUrl) {
    return (
      <PrivyProvider
        appId={appId}
        config={{
          defaultChain: sepolia,
          supportedChains: [sepolia],
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
          appearance: {
            landingHeader: "登录或注册",
            loginMessage: `使用邮箱、社交账号或钱包登录${PLATFORM_NAME}。`,
          },
          intl: {
            defaultCountry: "CN",
            textLocalization: {
              "connectionStatus.successfullyConnected": "已成功连接 {walletName}",
              "connectionStatus.errorTitle": "连接失败",
              "connectionStatus.connecting": "正在连接钱包",
              "connectionStatus.connectOneWallet": "请连接一个钱包以继续",
              "connectionStatus.checkOtherWindows": "请检查其他钱包窗口",
              "connectionStatus.stillHere": "仍在等待钱包响应",
              "connectionStatus.tryConnectingAgain": "重新连接",
              "connectionStatus.or": "或",
              "connectionStatus.useDifferentLink": "使用其他连接方式",
              "connectWallet.connectYourWallet": "连接钱包",
              "connectWallet.waitingForWallet": "正在等待钱包确认",
              "connectWallet.connectToAccount": "连接到你的账户",
              "connectWallet.installAndConnect": "安装并连接钱包",
              "connectWallet.tryConnectingAgain": "重新连接",
              "connectWallet.openInApp": "在钱包应用中打开",
              "connectWallet.copyLink": "复制连接",
              "connectWallet.retry": "重试",
              "connectWallet.searchPlaceholder": "搜索钱包",
              "connectWallet.noWalletsFound": "未找到钱包",
              "connectWallet.lastUsed": "上次使用",
              "connectWallet.selectYourWallet": "选择钱包",
              "connectWallet.selectNetwork": "选择网络",
              "connectWallet.goToWallet": "前往钱包",
              "connectWallet.scanToConnect": "扫码连接",
              "connectWallet.openOrInstall": "打开或安装钱包",
            },
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <PrivyWagmiProvider config={privyWagmiConfig}>
            <PrivyWalletSession>{children}</PrivyWalletSession>
          </PrivyWagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={demoWagmiConfig}>
        <DemoWalletSession>{children}</DemoWalletSession>
      </WagmiProvider>
    </QueryClientProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <ProviderBoundary>{children}</ProviderBoundary>;
}

export function useWalletSession() {
  const session = useContext(WalletSessionContext);
  if (!session) throw new Error("钱包会话只能在 AppProviders 内使用。");
  return session;
}
