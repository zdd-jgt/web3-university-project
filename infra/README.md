# Local infrastructure

The compose file prepares local-only PostgreSQL, Redis, MinIO, and Anvil. The
credentials are deliberately development-only and must never be reused online.

```bash
docker compose -f infra/compose.yaml config
docker compose -f infra/compose.yaml up -d
docker compose -f infra/compose.yaml ps
```

Create the bucket `web3-university-videos` manually through the MinIO console at
<http://localhost:9001> using the development credentials from
`infra/compose.yaml`. The API does not create the bucket. No cloud resource is
created by these commands.

## Recovery boundary

Local volumes are disposable developer state. The eventual EC2 runbook must
define PostgreSQL backup, restore verification, secret injection, immutable
image tags, health checks, and rollback before any external deployment.
