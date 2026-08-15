# Delivery status

## Evidence vocabulary

- `implemented`: source exists, but no successful execution is implied.
- `locally tested`: the listed local command or journey exited successfully.
- `sepolia deployed`: a contract or service has a verifiable Sepolia receipt.
- `online verified`: an externally reachable user journey was observed.

## Current evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Node workspace | locally tested | Volta pins Node 24.14.0 and pnpm 10.32.0; install, lint, types, tests, and builds are run through the explicit Volta path. |
| Foundry contracts | locally tested | Five non-upgradeable contracts; 6 suites / 25 tests passed in pinned Foundry v1.7.1, including fuzz tests. No deployment. |
| NestJS API | locally tested | Prisma migrations, authentication boundaries, review flow, comments, progress/outbox, signed media reads, and local runtime health have local test evidence. |
| Go worker/indexer | locally tested | Unit tests, vet, and PostgreSQL integration tests cover leased mint jobs, purchase projection, and approved catalog binding. |
| React desktop web | locally tested | TypeScript, component/unit tests, and Vite production build pass. Financial writes are enabled only with complete live configuration. |
| The Graph | locally tested | Code generation and build pass; all manifest addresses and start blocks remain explicit deployment placeholders. |
| Local infrastructure | locally tested | PostgreSQL, Redis, MinIO, and Anvil run through Docker Compose; migrations and a private local media bucket were exercised. |
| Privy | implemented | Provider, access-token forwarding, linked-wallet checks, and EIP-712 profile signing exist; no real Privy tenant/session was exercised. |
| Private video | partial | Entitlement-gated signed reads, captions requirement, and progress reporting exist. Upload initiation, processing, and admin READY workflow are not end-to-end. |
| Teacher/admin web flows | partial | API review rules exist, but several dashboard screens remain demonstrative rather than fully wired forms. |
| Uniswap pools/swap | planned | UI explains separate Test USDT/YD and native ETH/YD pools. No pool initialization, liquidity, Router/Permit2 integration, or swap transaction exists. |
| Sepolia/cloud | not started | No Sepolia transaction, Alchemy/Infura RPC proof, AWS resource, Graph deployment, DNS, or public URL was created. |

## Known limits before a real testnet release

- Browser visual, responsive, and keyboard interaction checks could not be run
  because no in-app browser instance was available during this delivery.
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
