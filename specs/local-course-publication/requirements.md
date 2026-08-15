# Local Course Publication Requirements

## Feature information

- Feature ID: F-001
- Name: Local course publication closure
- Environment: PostgreSQL plus Ethereum Anvil, chain ID 31337
- Delivery mode: one task at a time through XJ

## Goal

Prove locally that an approved course is not public until an authorized
`CourseCatalog.configureCourse` transaction is confirmed and the Go Worker has
matched the on-chain event to the exact reviewed course proposal.

## Non-goals

- Administrator browser UI, Privy tenant setup or browser chain switching.
- Sepolia, Alchemy, AWS, The Graph deployment or any paid service.
- Course purchase, YD swap, learning progress or certificate minting.
- Price updates, delisting, re-listing or full deep-reorg reconstruction.
- Changes to the Prisma schema or database migrations.

## User stories

- As an administrator, I can approve a valid pending course and recover the
  same server-generated publication package if the local chain transaction was
  not sent or was interrupted.
- As a learner, I cannot see an API-approved course until its matching chain
  event has reached the configured confirmation threshold.
- As an operator, I can run one local evidence flow that distinguishes API
  approval, transaction receipt, Worker projection and public visibility.

## Functional requirements

- FR-001: An authenticated ADMIN can list courses in `PENDING_REVIEW` and
  `APPROVED`; other roles cannot access this review queue.
- FR-002: Approval atomically changes only `PENDING_REVIEW` to `APPROVED` and
  returns a server-derived `configureCourse` package.
- FR-003: An ADMIN can recover the publication package for an `APPROVED` course
  without repeating the review transition.
- FR-004: The package derives chain ID, catalog address, deterministic course
  ID, reviewed YD price, reviewed payout wallet and submission hash from trusted
  server state and configuration, never from browser-supplied chain facts.
- FR-005: Only a wallet holding `COURSE_MANAGER_ROLE` can configure a local
  course, and the emitted event contains the exact package fields.
- FR-006: Worker projection changes a course to `PUBLISHED` only after the
  configured confirmation depth and only when course ID, price, payout wallet
  and metadata hash all match the approved proposal.
- FR-007: Public course list/detail endpoints return only `PUBLISHED` courses.
- FR-008: Re-reading the publication package and replaying an already handled
  log are idempotent and do not create a second course projection.

## Non-functional requirements

- NFR-001: All implementation and verification tasks execute sequentially.
- NFR-002: Node commands use the repository-pinned Node 24 and pnpm binaries.
- NFR-003: Local private keys and RPC secrets are runtime inputs and are never
  committed or printed into durable evidence.
- NFR-004: Failed or unavailable Docker checks are reported as blocked, not as
  passed.
- NFR-005: Focused checks run before repository-wide checks to reduce local
  memory and CPU pressure.

## Edge cases

- Missing or malformed chain/catalog configuration must fail before approval is
  persisted.
- A concurrent or repeated review must not overwrite the first transition.
- A recovered package for a DRAFT, PENDING_REVIEW, PUBLISHED or missing course
  must fail closed.
- Wrong chain, catalog, course ID, price, payout wallet or hash must not publish
  the database course.
- A transaction receipt alone must not make the API course public; Worker
  confirmation and projection are required.
- Docker daemon unavailability prevents local chain evidence but does not block
  the independent API task.

## Acceptance criteria

- AC-001: ADMIN review queue returns only pending or approved-awaiting-chain
  courses; non-ADMIN access is forbidden.
- AC-002: Approval returns a deterministic publication package, leaves the
  course `APPROVED`, and the same package can be recovered later.
- AC-003: Invalid media readiness, missing deployment configuration, invalid
  state, repeated review and unauthorized review all fail without a false
  `PUBLISHED` state.
- AC-004: The local Catalog accepts the exact package only from a Course Manager
  and emits the exact course ID, price, payout wallet and hash.
- AC-005: Before the configured confirmation threshold, the course remains
  absent from public APIs.
- AC-006: Mismatched Catalog events leave the course `APPROVED`; an exact,
  confirmed event writes the chain binding and changes it to `PUBLISHED`.
- AC-007: Replaying the handled event is idempotent, and the public list/detail
  exposes the course exactly once after projection.
- AC-008: The public API hides the course before projection and returns it after
  the exact projection, without a second public row.
- AC-009: A local run records API state, transaction hash/receipt, Worker
  checkpoint/projection and public API result without exposing a private key.

## Dependencies

- Existing NestJS course workflow and Prisma models.
- Existing `CourseCatalog` contract and Anvil-only deployment script.
- Existing Go Catalog indexer and PostgreSQL projection.
- Local Docker Desktop for Foundry, PostgreSQL and Anvil checks in T-002 onward.
- XJ Harness and a valid Git baseline.

## Open questions

- None for F-001. Browser-based administrator signing is deliberately deferred
  to F-002.
