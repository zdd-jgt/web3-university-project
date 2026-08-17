# Delivery status

## Evidence vocabulary

- `implemented`: source exists, but no successful execution is implied.
- `locally tested`: the listed local command or journey exited successfully.
- `sepolia deployed`: a contract or service has a verifiable Sepolia receipt.
- `online verified`: an externally reachable user journey was observed.

## Current evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Node workspace | partial | Volta pins Node 24.14.0 and pnpm 10.32.0; frozen install passes. The current root Biome check is blocked by pre-existing formatting drift in two `.xj` run-state files and `xj-harness.config.mjs`; this swap scope passes Biome independently. |
| Foundry contracts | locally tested | Five non-upgradeable contracts; 6 suites / 25 tests passed in pinned Foundry v1.7.1, including fuzz tests. No deployment. |
| NestJS API | locally tested | Prisma migrations, authentication boundaries, review flow, comments, progress/outbox, signed media reads, and local runtime health have local test evidence. |
| Go worker/indexer | locally tested | Unit tests, vet, and PostgreSQL integration tests cover leased mint jobs, purchase projection, and approved catalog binding. |
| React desktop web | locally tested | TypeScript, component/unit tests, and Vite production build pass. Financial writes are enabled only with complete live configuration. |
| The Graph | locally tested | Code generation and build pass; all manifest addresses and start blocks remain explicit deployment placeholders. |
| Local infrastructure | locally tested | PostgreSQL, Redis, MinIO, and Anvil run through Docker Compose; migrations and a private local media bucket were exercised. |
| Privy | implemented | Provider, access-token forwarding, linked-wallet checks, and EIP-712 profile signing exist; no real Privy tenant/session was exercised. |
| Private video | partial | Entitlement-gated signed reads, captions requirement, and progress reporting exist. Upload initiation, processing, and admin READY workflow are not end-to-end. |
| Teacher/admin web flows | locally tested | Teacher studio, admin console and purchaser comments are source-wired to authenticated API boundaries. Unit/component tests cover teacher application, draft editing, lesson/upload declarations, publication review packages, purchaser posting, course-teacher replies and reasoned admin moderation; server-side role, object and entitlement checks remain authoritative. Demo mode stays labelled and fails closed. A real browser-to-API-to-storage journey is not claimed. |
| Uniswap swap web | locally tested | The web adapter builds canonical v4 PoolKeys, reads the official Sepolia Quoter and StateView, displays quote/impact/slippage/minimum/deadline, applies the Test USDT ERC-20 and Permit2 authorization boundary, and encodes an exact-input Universal Router 2.1.1 transaction. Pure and component tests pass. |
| Uniswap pools | planned | No pool was initialized or funded. The Test USDT/YD 1:10 ratio and the manually calculated ETH/YD ratio are deployment inputs, not existing market facts. |
| Sepolia/cloud | not started | No Sepolia transaction, Alchemy/Infura RPC proof, AWS resource, Graph deployment, DNS, or public URL was created. |

## Known limits before a real testnet release

- Browser visual, responsive, and keyboard interaction checks could not be run
  because no in-app browser instance was available during this delivery.
- The teacher upload flow was exercised only against mocked API responses; a
  real MinIO/S3 signed PUT, media processing READY transition, and caption
  delivery remain unverified end-to-end.
- Playback coverage detects submitted contiguous ranges, not whether a human was
  attentive. A hostile purchased client can still attempt to forge learning
  events; this is coursework-grade, not proctoring.
- The catalog index currently lacks an immutable raw-event table. A deep reorg
  that removes an already-projected course configuration needs reconciliation.
- Purchase indexing assumes one `CourseMarket` contract per chain because the
  current raw-event key does not include the contract address.
- A real testnet release still needs deployed addresses, exact deployment
  blocks, funded test wallets, LP initialization, secrets, operational alerts,
  backup/restore proof, and a separately approved deployment runbook.
- The swap code has not executed against a live YD deployment or funded v4
  pool. A passing encoder test proves the call shape, not market liquidity or a
  successful Sepolia receipt.
