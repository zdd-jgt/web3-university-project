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
  reason: !appId
    ? "VITE_PRIVY_APP_ID is not configured"
    : !rpcUrl
      ? "VITE_SEPOLIA_RPC_URL is not configured"
      : "",
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
    ? `Demo mode: ${runtime.reason}.`
    : !ready
      ? "Wallet session is still loading."
      : !authenticated
        ? "Sign in with Privy before connecting a wallet."
        : !address
          ? "Connect an embedded or desktop external wallet."
          : chainId !== sepolia.id
            ? "Switch the active wallet to Sepolia."
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
  if (!session) throw new Error("Wallet session is unavailable outside AppProviders.");
  return session;
}
