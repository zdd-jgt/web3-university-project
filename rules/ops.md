# Operations rules

- Default to `prepare-only` and local validation.
- Docker Compose may be used for PostgreSQL, Redis, MinIO, and Anvil only after
  the local Docker daemon is available.
- Sepolia, AWS, DNS, The Graph deployment, image push, permissions, keys, or
  paid RPC actions stay blocked until separately confirmed.
- A deployment plan must define health, stop conditions, configuration rollback,
  artifact rollback, and data recovery before external execution.
