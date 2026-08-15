# Architecture baseline

## User outcome

A signed-in user can exchange Sepolia test assets for YD, buy a published
course, complete every required video lesson, and automatically receive a
non-transferable certificate at the wallet that purchased the course.

## Invariants

- Course purchase truth comes from `CourseMarket`, never from a browser request.
- Course price and sale status are read from `CourseCatalog` before purchase.
- YD has a fixed supply of 1,000,000 tokens and cannot be minted after deploy.
- Purchase settlement is atomic: 75% teacher, 25% treasury.
- A buyer can purchase a course once and receive one certificate for it.
- A certificate cannot be transferred.
- Progress completion is decided by the API; the worker only executes a durable
  mint job.
- Secrets and privileged keys never enter browser bundles, Git, or database
  records.

## Trust boundaries

- Browser to API: validate Privy token, object ownership, payload, replay, and
  resource limits.
- Browser to chain: wallet intent is explicit; authoritative price and status are
  contract reads.
- API to worker: PostgreSQL outbox with unique jobs and recoverable checkpoints.
- RPC and subgraph: treat as fallible and potentially delayed external data.
- Object storage: issue short-lived access only after authentication and onchain
  entitlement checks.

## Evidence levels

Design, source code, local tests, Sepolia receipts, and deployed health are
separate evidence levels. This repository must never report a higher level than
was actually observed.
