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

The swap page uses these public Sepolia contracts:

- Uniswap v4 Universal Router 2.1.1:
  `0x7dfd4f31be6814d2906bde155c3e1b146eac1468`
- v4 Quoter: `0x61b3f2011a92d183c7dbadbda940a7555ccf9227`
- StateView: `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c`
- Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- Tether WDK Test USD₮:
  `0xd077a400968890eacc75cdc901f0356c943e4fdb` (6 decimals)

Set `VITE_SEPOLIA_RPC_URL` and the deployed `VITE_YD_TOKEN_ADDRESS` to enable
public quotes. This does not create either pool. Follow
[`uniswap-v4-pool-plan.md`](uniswap-v4-pool-plan.md) and obtain explicit asset
amount approval before initializing or funding positions.
