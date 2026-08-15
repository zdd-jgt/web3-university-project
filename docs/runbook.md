# Local development runbook

This runbook is local-only. It does not deploy contracts, create cloud
resources, use paid services, or send testnet transactions.

## 1. Use the pinned Node 24 toolchain

```bash
cd /Users/jgt/JGTCode/codex/project/web3-university-project
/Users/jgt/.volta/bin/node --version
/Users/jgt/.volta/bin/pnpm --version
/Users/jgt/.volta/bin/pnpm install --frozen-lockfile
```

Do not use a bare `node`, `npm`, or `pnpm` command on this machine; the older
default Node environment is outside this project's supported baseline.

## 2. Start local dependencies

```bash
docker compose -f infra/compose.yaml up -d postgres redis minio anvil
docker compose -f infra/compose.yaml ps
```

Open <http://localhost:9001>, sign in with the development-only credentials from
`infra/compose.yaml`, and create the private bucket
`web3-university-videos`. This is a manual local bootstrap step.

## 3. Apply the database migrations

```bash
DATABASE_URL='postgresql://web3u:web3u@localhost:5432/web3u?schema=public' \
  /Users/jgt/.volta/bin/pnpm --filter @web3-university/api exec prisma migrate deploy
```

Copy `apps/api/.env.example` to an untracked `.env` and keep all real secrets
out of Git.

## 4. Start the API and web app

```bash
/Users/jgt/.volta/bin/pnpm --filter @web3-university/api start:dev
/Users/jgt/.volta/bin/pnpm --filter @web3-university/web dev
```

The API listens on <http://localhost:3000> and its health endpoint is
`GET /v1/health`. The web app defaults to <http://localhost:5173>.

Without real Privy and Sepolia configuration, the web app stays in its clearly
labelled demonstration mode. Copy `apps/web/.env.example` only when those public
browser values are available.

## 5. Verify TypeScript, Go, and Solidity

```bash
/Users/jgt/.volta/bin/pnpm check
/Users/jgt/.volta/bin/pnpm typecheck
/Users/jgt/.volta/bin/pnpm test
/Users/jgt/.volta/bin/pnpm build

cd services/worker
go test ./...
go vet ./...
```

Run the pinned Foundry container from the repository root:

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace/packages/contracts \
  ghcr.io/foundry-rs/foundry:v1.7.1 \
  forge test -vvv
```

See `packages/contracts/README.md` if the ignored Foundry libraries have not yet
been installed.

## 6. Stop local services

```bash
docker compose -f infra/compose.yaml stop
```

`stop` preserves the named volumes. Deleting volumes is intentionally not part
of this runbook.

## Testnet boundary

Before Sepolia work, replace every placeholder address/start block, prepare the
two independent liquidity positions, verify test-token addresses, and obtain
separate approval for deployment, keys, RPC/cloud accounts, and any operation
that may cost money. The displayed `1 Test USDT = 10 YD` ratio is only an
intended initial pool ratio until both sides are funded and the pool is created.
