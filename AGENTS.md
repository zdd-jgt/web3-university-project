# Project agent rules

- Read `rules/refactoring.md` before changing TypeScript or TSX structure.
- Use Node.js 24.14.0 and pnpm 10.32.0 through the repository Volta pins.
- `apps/api` is the only owner of Prisma schema and database migrations.
- `services/worker` may use generated SQL but must not create migrations.
- Smart-contract state is authoritative for purchases and certificates.
- Never commit private keys, access tokens, RPC secrets, or real credentials.
- Cloud provisioning, Sepolia deployment, and paid services require explicit
  approval separate from local development.
- Report commands actually run, failures, unrun checks, and residual risks.

## XJ workflow

- Execute one feature and one task at a time; parallel work requires explicit
  confirmation and isolated write scopes.
- Read `specs/xj-feature-plan.md`, the active feature four-file spec, and
  `.xj/workflow.json` before XJ execution.
- Only the coordinator may write XJ plan, trace, state, or memory files.
- XJ code tasks require a valid Git baseline and the `xj-run` event lifecycle;
  missing Harness support is a blocker, never an excuse to fabricate state.
