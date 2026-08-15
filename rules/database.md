# Database rules

- `apps/api/prisma` is the only schema and migration owner.
- Go may consume generated sqlc queries but must not create migrations.
- Chain events are stored with chain/block provenance before rebuildable
  projections whenever rollback or reorg compensation is required.
- Migration verification uses a local PostgreSQL database and must include a
  recovery note; no production data operations are authorized.
