# Local Course Publication Design

## First-principles decision

The user-visible fact is not “an administrator clicked publish”; it is “the
public course is backed by the exact approved proposal and a confirmed Catalog
event.” Therefore neither the browser, the API approval response nor a raw
transaction receipt may directly set `PUBLISHED`.

Two designs were compared:

| Design | Scope | Main risk |
| --- | --- | --- |
| A. Local API → Anvil → Worker → public API evidence | Proves the authoritative state transition with minimal new surface | Does not yet offer browser administrator signing |
| B. Full administrator browser flow first | Adds queue, Privy, local network switching, wallet signing and UI recovery together | UI/auth complexity can hide an unproven chain/database invariant |

F-001 selects design A. Design B becomes F-002 after A passes.

## Architecture and sequence

```text
ADMIN identity
  -> NestJS review: PENDING_REVIEW -> APPROVED + publication package
  -> Course Manager signs configureCourse on Anvil
  -> CourseCatalog emits CourseConfigured
  -> Go Worker waits for confirmations and verifies all reviewed fields
  -> PostgreSQL writes chain binding and PUBLISHED
  -> public course API returns the course
```

## Module boundaries

- `apps/api/src/courses`: owns review authorization, review state, queue and
  deterministic publication-package construction. It never broadcasts a
  transaction and never writes `PUBLISHED`.
- `packages/contracts`: owns `COURSE_MANAGER_ROLE`, Catalog validation and
  `CourseConfigured` emission. It does not know the off-chain course UUID or
  media state.
- `services/worker`: owns confirmed-log ingestion and the guarded projection
  from approved proposal to published chain binding.
- PostgreSQL: stores the workflow and rebuildable projection. Proposal fields
  and chain-fact fields remain separate.
- Public API: reads only rows whose projection status is `PUBLISHED`.

## API contracts

### Review queue

`GET /v1/courses/review-queue` requires ADMIN and returns only
`PENDING_REVIEW` or `APPROVED`, ordered by update time. The response contains
review facts needed to select a course, but no client-authored chain overrides.

### Review

`PATCH /v1/courses/:id/review` with `{ approved: true }` keeps the existing
contract: it atomically writes `APPROVED` and returns:

```text
{
  course,
  onchainConfig: {
    chainId,
    catalogAddress,
    functionName: "configureCourse",
    args: [chainCourseId, priceYD, payoutWallet, submissionHash]
  }
}
```

### Publication-package recovery

`GET /v1/courses/:id/publication-package` requires ADMIN. It accepts only an
`APPROVED` course and rebuilds the same package from server state. It does not
repeat review, broadcast, or report the course as published.

## Contract and event contract

- `configureCourse(uint256,uint256,address,bytes32)` remains the only write.
- The caller must hold `COURSE_MANAGER_ROLE`.
- The local helper reads values from explicit environment variables; no private
  key is embedded in source, docs or test snapshots.
- F-001 does not change CourseMarket, YDToken, CertificateSBT or the oracle.

## Worker projection contract

The Worker processes only the configured chain and Catalog address after the
confirmation threshold. A database update is allowed only if:

- status is `APPROVED`;
- `submissionHash == metadataHash`;
- deterministic `keccak256("web3-university:" + course UUID) == courseId`;
- `requestedPriceYD == event priceYD`;
- normalized `requestedPayoutWallet == event payoutWallet`.

All predicates remain in the guarded database update, even if checked earlier
in Go. A zero-row update is a safe no-op.

## Failure and recovery

- API config unavailable: fail before changing review state.
- Wallet rejection or process interruption: course stays `APPROVED`; recover
  the same package and retry later.
- Transaction revert: course stays `APPROVED`; surface the receipt failure.
- Unconfirmed event: no public projection.
- Event mismatch: safe no-op, preserving `APPROVED` for investigation.
- Worker restart: resume from checkpoint with overlap replay; projection remains
  idempotent.
- Docker unavailable: block the affected XJ run and retain completed API
  evidence; do not substitute Sepolia.

## Security and privacy

- API ADMIN role and on-chain Course Manager are independent gates; both must
  pass in the complete flow.
- The browser is untrusted and cannot choose authoritative package fields.
- No secrets or PII are written to XJ evidence.
- Local Anvil assets have no value; no real token or paid RPC is used.

## Release and migration impact

- No database migration.
- No external deployment.
- API adds two ADMIN read endpoints.
- Local scripts and tests under `infra/scripts` are development-only.
- Known P1 residual: Catalog projection lacks a full immutable raw-event ledger,
  so a reorg deeper than the configured overlap cannot be fully compensated in
  F-001.

## Technical decisions

- TD-001: Select local invariant proof before administrator browser UX.
- TD-002: Rebuild a publication package from immutable reviewed proposal fields
  rather than storing a browser transaction intent.
- TD-003: Keep the guarded SQL update as the final publication gate.
- TD-004: Use focused XJ verification commands and serialize Docker workloads.
