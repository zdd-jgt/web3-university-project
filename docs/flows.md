# Core flows

These diagrams separate user intent, application state, and onchain facts. A
successful browser request is never treated as proof of a transaction.

## System boundary

```mermaid
flowchart LR
  Browser[React desktop web] -->|Privy access token| API[NestJS API]
  Browser -->|sign / approve / buy| Wallet[Embedded or browser wallet]
  Wallet -->|transactions| Sepolia[Ethereum Sepolia]
  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis)]
  API -->|short-lived URL| Objects[(MinIO locally / private S3 online)]
  PG -->|durable outbox| Worker[Go certificate worker]
  Worker -->|idempotency read + mint| SBT[CertificateSBT]
  Indexer[Go event indexer] -->|confirmed logs| PG
  Sepolia --> Indexer
  Sepolia --> Graph[The Graph history]
  Browser -->|historical queries| Graph
  Browser -->|fresh state reads| Sepolia
```

## Course purchase

```mermaid
sequenceDiagram
  actor User
  participant Web
  participant YD as YDToken
  participant Catalog as CourseCatalog
  participant Market as CourseMarket
  participant Indexer
  participant DB as PostgreSQL

  User->>Web: Select a published course
  Web->>Catalog: Read status, price, payout wallet
  Catalog-->>Web: Current authoritative offer
  User->>YD: approve(Market, exact price)
  YD-->>User: Approval receipt
  Web->>Catalog: Re-read status and price
  User->>Market: buy(courseId, expectedPrice, deadline)
  Market->>Catalog: Validate current offer
  Market->>YD: transferFrom buyer to teacher (75%)
  Market->>YD: transferFrom buyer to treasury (25%)
  Market-->>Indexer: CoursePurchased event
  Indexer->>DB: Store canonical event and entitlement projection
  DB-->>Web: Purchased-course access after confirmation
```

`expectedPrice` prevents a silent administrator price change between page load
and transaction execution. `deadline` prevents an old signed transaction from
being accepted much later. The contract, not the browser, calculates the 75/25
split.

## Completion and automatic certificate

```mermaid
sequenceDiagram
  actor Student
  participant Player as Video player
  participant API as NestJS API
  participant DB as PostgreSQL
  participant Worker as Go worker
  participant SBT as CertificateSBT

  Student->>API: Request private lesson URL
  API->>DB: Verify linked purchasing wallet entitlement
  API-->>Player: Short-lived signed MP4 URL
  loop Playback segments
    Player->>API: Idempotent watched range
    API->>DB: Merge validated segment coverage
  end
  API->>DB: All required lessons >= 95%?
  DB-->>API: Course progress = 100%
  API->>DB: Transaction: completion + unique outbox job
  Worker->>DB: Claim job with lease / SKIP LOCKED
  Worker->>SBT: certificateOf(buyer, courseId)
  alt Certificate already exists
    Worker->>DB: Reconcile token id and mark delivered
  else Not minted
    Worker->>SBT: mintCertificate(buyer, courseId, tokenURI)
    Worker->>DB: Persist transaction hash
    Worker->>SBT: Wait for required confirmations
    Worker->>DB: Mark completion minted
  end
```

The progress rule proves submitted playback coverage, not human attention. The
worker does not decide completion; it only executes a durable, retryable mint
job produced by the API transaction.

## Swap and oracle boundaries

```mermaid
flowchart TB
  TestUSDT[Test USDT] --> PoolA[Uniswap v4 Test USDT / YD pool]
  SepoliaETH[Native SepoliaETH] --> PoolB[Uniswap v4 ETH / YD pool]
  PoolA --> YD[YD used for course purchase]
  PoolB --> YD
  Feed[Chainlink ETH / USD Data Feed] --> Demo[Freshness demo page]
  Feed -. human reference only .-> InitialPrice[Initial ETH / YD pool setup]
  Demo -. never authorizes .-> None[No progress, purchase, or mint decision]
```

The two pools are independent. The initial Test USDT ratio is `1 Test USDT =
10 YD`; a pool needs both assets and liquidity before it can trade. The
Chainlink wrapper is isolated because ETH/USD cannot observe lesson progress or
define YD's market price.

### Student swap transaction

```mermaid
sequenceDiagram
  actor Student
  participant Web
  participant TestUSDT as Test USDT
  participant Permit2
  participant Quoter as v4 Quoter / StateView
  participant Router as Universal Router 2.1.1
  participant Pool as v4 PoolManager

  Student->>Web: Enter input and slippage
  Web->>Quoter: eth_call exact-input quote + current slot0
  Quoter-->>Web: amountOut, gas estimate, sqrtPriceX96
  Web-->>Student: Quote, price impact, minimum output, 20-minute rule
  alt Test USDT input
    Student->>TestUSDT: approve(Permit2, exact input)
    Student->>Permit2: approve(Router, exact input, 1-hour expiry)
  else Native SepoliaETH input
    Note over Student,Web: No ERC-20 approve
  end
  Web->>Quoter: Re-read fresh quote before write
  Student->>Router: execute(V4_SWAP, minimumOut, deadline)
  Router->>Pool: Swap exact input
  Pool-->>Student: YD or revert atomically
```

The browser never invents an exchange rate. A missing pool, missing liquidity,
wrong network, missing YD address, failed quote, incomplete authorization, stale
deadline, or violated minimum output stops the write or makes it revert.
