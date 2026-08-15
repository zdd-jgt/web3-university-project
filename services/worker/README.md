# Certificate and event worker

The worker executes durable jobs created by the NestJS API. It does not decide
whether a course is complete and it does not own database migrations.

Responsibilities:

- index confirmed `CourseCatalog` events and publish only the matching,
  admin-approved database submission;
- index confirmed `CoursePurchased` events into a rebuildable entitlement
  projection;
- claim one certificate mint job at a time using a database lease;
- check the onchain idempotency mapping before sending a transaction;
- record transaction hashes before waiting for confirmations;
- retry transient failures with bounded exponential backoff;
- move exhausted jobs to an explicit failed state;
- resume from database state after a process restart.

The private key is required only at runtime and must be supplied through a secret
store or local untracked environment file. The worker exits when required config
is missing.

The purchase projection records raw block provenance and compensates overlap
replays. The current catalog projection does not yet have its own immutable raw
event table, so a deep reorg that removes an already-projected
`CourseConfigured` event requires manual reconciliation. The current schema also
assumes one `CourseMarket` address per chain.
