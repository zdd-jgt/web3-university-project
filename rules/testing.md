# Testing rules

- Use Node 24 through `/Users/jgt/.volta/bin` and the repository-pinned pnpm.
- Run one heavy command at a time on this machine.
- Prefer focused tests first, then affected package typecheck/build, and only
  then broader regression when justified.
- Go integration tests that require PostgreSQL must report when
  `WORKER_TEST_DATABASE_URL` is absent and tests are skipped.
- Local, testnet, deployed, and browser evidence are separate levels.
