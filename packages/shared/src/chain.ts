export const SEPOLIA_CHAIN_ID = 11_155_111;
export const LOCAL_ANVIL_CHAIN_ID = 31_337;

export const YD_DECIMALS = 18;
export const TEST_USDT_DECIMALS = 6;

export const TEST_ASSET_NOTICE =
  "Sepolia ETH, Test USDT, and YD are teaching assets with no monetary value.";

export type ContractName =
  | "YDToken"
  | "CourseCatalog"
  | "CourseMarket"
  | "CertificateSBT"
  | "ChainlinkPriceOracle";

export interface ContractDeployment {
  readonly chainId: number;
  readonly name: ContractName;
  readonly address: `0x${string}`;
  readonly version: number;
  readonly startBlock: bigint;
  readonly active: boolean;
}
