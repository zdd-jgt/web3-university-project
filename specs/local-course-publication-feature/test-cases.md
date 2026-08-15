# Local Course Publication Feature Test Cases

## TC-001 ADMIN review queue

- Maps to: AC-001
- Type / priority: API service and controller, P1
- Preconditions: pending, approved, draft and published fixtures
- Data / mocks: Prisma course query and ADMIN principal
- Execution: `api-course-publish`
- Expected: only pending and approved-awaiting-chain courses are returned in
  update order.
- Evidence: Vitest output and XJ T-001 event record.

## TC-002 review queue authorization

- Maps to: AC-001, AC-003
- Type / priority: controller authorization negative test, P0
- Preconditions: STUDENT or TEACHER principal
- Data / mocks: no database mutation is permitted
- Execution: `api-course-publish`
- Expected: request fails forbidden before the service is trusted.
- Evidence: Vitest output and XJ T-001 event record.

## TC-003 recoverable deterministic publication package

- Maps to: AC-002
- Type / priority: service contract, P0
- Preconditions: valid READY required media, local chain/catalog configuration
- Data / mocks: approved proposal with fixed UUID, price, payout and hash
- Execution: `api-course-publish`
- Expected: review leaves `APPROVED`; recovery returns identical chain ID,
  catalog, deterministic ID, price, payout and hash.
- Evidence: Vitest assertions and XJ T-001 event record.

## TC-004 review and recovery fail closed

- Maps to: AC-003
- Type / priority: state and configuration negative tests, P0
- Preconditions: missing Catalog config, non-ready media, wrong status and
  repeated review variants
- Data / mocks: update call counter
- Execution: `api-course-publish`
- Expected: no invalid variant writes `PUBLISHED`; missing config mutates no
  review state, and recovery accepts only `APPROVED`.
- Evidence: Vitest assertions and XJ T-001 event record.

## TC-005 authorized local Catalog publication

- Maps to: AC-004
- Type / priority: Foundry contract integration, P0
- Preconditions: Anvil chain semantics and Course Manager fixture
- Data / mocks: deterministic nonzero course ID, 4 YD, teacher wallet and hash
- Execution: `contracts-course-publish`
- Expected: configuration succeeds and the event/state exactly matches input.
- Evidence: Foundry output hash in XJ T-002.

## TC-006 unauthorized and invalid Catalog publication

- Maps to: AC-004
- Type / priority: Foundry negative tests, P0
- Preconditions: unprivileged caller and invalid field variants
- Data / mocks: unauthorized wallet, zero price/address/hash
- Execution: `contracts-course-publish`
- Expected: each call reverts and emits no accepted course configuration.
- Evidence: Foundry output hash in XJ T-002.

## TC-007 confirmation gate

- Maps to: AC-005
- Type / priority: Go indexer test, P0
- Preconditions: confirmed head below event confirmation threshold
- Data / mocks: controlled RPC head/log source
- Execution: `worker-catalog`
- Expected: event is not projected and public status remains absent.
- Evidence: Go test output hash in XJ T-003.

## TC-008 exact-match projection

- Maps to: AC-006
- Type / priority: PostgreSQL integration, P0
- Preconditions: migrated local PostgreSQL and an `APPROVED` proposal
- Data / mocks: wrong course ID, price, payout, hash and one exact event
- Execution: `worker-catalog` with `WORKER_TEST_DATABASE_URL`
- Expected: every mismatch is a no-op; only the exact event writes chain facts
  and `PUBLISHED`.
- Evidence: Go/PostgreSQL test output and XJ T-003 event record. A skipped test
  is not acceptance evidence.

## TC-009 replay idempotency

- Maps to: AC-007
- Type / priority: projection idempotency, P1
- Preconditions: exact event already projected
- Data / mocks: replayed log identity and same course row
- Execution: focused Worker test
- Expected: one stable projection with no duplicate chain binding.
- Evidence: focused test output recorded under T-003.

## TC-010 public visibility before and after projection

- Maps to: AC-008
- Type / priority: API query test, P0
- Preconditions: one APPROVED row and one PUBLISHED row
- Data / mocks: Prisma query boundary or migrated PostgreSQL fixture
- Execution: `api-course-publish`
- Expected: list/detail hides APPROVED and returns PUBLISHED exactly once.
- Evidence: Vitest output and XJ T-004 event record.

## TC-011 serialized local end-to-end closure

- Maps to: AC-009
- Type / priority: local E2E, P0
- Preconditions: Docker Desktop, PostgreSQL, Anvil, migrated database, deployed
  local contracts and runtime-only development key
- Data / mocks: one approved course proposal
- Execution: `local-course-publication-e2e`
- Expected: evidence shows APPROVED before the transaction, a successful local
  receipt, confirmed Worker checkpoint, PUBLISHED chain binding and a public API
  result; no private key appears in output.
- Evidence: sanitized command output hash plus `docs/status.md` evidence entry.

## TC-012 secret and external-target guard

- Maps to: AC-009
- Type / priority: repository diff and run-output audit, P0
- Preconditions: T-005 completed
- Data / mocks: current feature diff and sanitized logs
- Execution: repository secret-pattern scan plus XJ scope audit
- Expected: no private key, Sepolia RPC credential, paid service endpoint or
  cloud deployment artifact was introduced.
- Evidence: T-006 review record.
