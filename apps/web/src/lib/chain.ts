/** Public identifiers only. Contract addresses are injected at build time, never hard-coded. */
export const sepoliaChainId = 11_155_111;

export const contractAddresses = {
  courseCatalog: import.meta.env.VITE_COURSE_CATALOG_ADDRESS as `0x${string}` | undefined,
  courseMarket: import.meta.env.VITE_COURSE_MARKET_ADDRESS as `0x${string}` | undefined,
  ydToken: import.meta.env.VITE_YD_TOKEN_ADDRESS as `0x${string}` | undefined,
  certificate: import.meta.env.VITE_CERTIFICATE_SBT_ADDRESS as `0x${string}` | undefined,
  chainlinkPriceOracle: import.meta.env.VITE_CHAINLINK_PRICE_ORACLE_ADDRESS as
    | `0x${string}`
    | undefined,
};

/** ABI is aligned with packages/contracts/src; reads are advisory until a receipt is verified. */
export const courseCatalogAbi = [
  {
    type: "function",
    name: "getCourse",
    stateMutability: "view",
    inputs: [{ name: "courseId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "priceYD", type: "uint256" },
          { name: "payoutWallet", type: "address" },
          { name: "metadataHash", type: "bytes32" },
          { name: "version", type: "uint64" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPurchasableCourse",
    stateMutability: "view",
    inputs: [{ name: "courseId", type: "uint256" }],
    outputs: [
      { name: "priceYD", type: "uint256" },
      { name: "payoutWallet", type: "address" },
    ],
  },
] as const;

export const courseMarketAbi = [
  {
    type: "function",
    name: "buyCourse",
    stateMutability: "nonpayable",
    inputs: [
      { name: "courseId", type: "uint256" },
      { name: "expectedPrice", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hasPurchased",
    stateMutability: "view",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "courseId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const erc20ApprovalAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const certificateSbtAbi = [
  {
    type: "function",
    name: "certificateOf",
    stateMutability: "view",
    inputs: [
      { name: "student", type: "address" },
      { name: "courseId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const chainlinkPriceOracleAbi = [
  {
    type: "function",
    name: "latestPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "decimals", type: "uint8" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
] as const;
