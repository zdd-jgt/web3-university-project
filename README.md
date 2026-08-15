# Web3 University

A semi-centralized Web3 university coursework project targeting Ethereum
Sepolia. Course sales and certificates are verifiable onchain, while identity,
video delivery, comments, and learning progress remain in application services.

The repository currently provides a locally verified implementation baseline.
It has **not** been deployed to Sepolia and the swap page does **not** yet send
Uniswap transactions.

## Workspace

- `apps/web`: React + Vite desktop web application
- `apps/api`: NestJS REST API and Prisma migrations
- `services/worker`: Go event indexer and certificate mint worker
- `packages/contracts`: Foundry smart contracts
- `packages/subgraph`: The Graph subgraph
- `packages/shared`: shared TypeScript contracts
- `infra`: local containers and deployment preparation
- `docs`: architecture, decisions, and runbooks

Start with [the architecture](docs/architecture.md), [confirmed requirements](docs/requirements.md),
the [purchase/completion flow diagrams](docs/flows.md), the [local runbook](docs/runbook.md),
and the [evidence-based delivery status](docs/status.md).

The repository is initialized for Node.js 24.14.0 through Volta. Cloud
provisioning and Sepolia deployment require separate approval and credentials.

## Local verification entry points

Always use the pinned Volta executables instead of the machine's older default
Node installation:

```bash
/Users/jgt/.volta/bin/node --version
/Users/jgt/.volta/bin/pnpm install --frozen-lockfile
/Users/jgt/.volta/bin/pnpm check
/Users/jgt/.volta/bin/pnpm typecheck
/Users/jgt/.volta/bin/pnpm test
/Users/jgt/.volta/bin/pnpm build
```

The Go worker and Foundry contracts have separate verification commands in the
[runbook](docs/runbook.md). None of these local commands sends a Sepolia
transaction.
