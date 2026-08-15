# Web3 University subgraph

This package is the Sepolia history/query layer for four authoritative contract
events:

- `CourseCatalog.CourseConfigured` and `CourseStatusChanged` update the latest
  event-derived `Course` view.
- `CourseMarket.CoursePurchased` creates an immutable `CoursePurchase` record.
- `CertificateSBT.CertificateMinted` creates an immutable `Certificate` record.

It deliberately does **not** index learner video progress or decide whether a
student owns a course or certificate. Those checks remain direct contract reads
and the server-side completion/outbox workflow.

## Local generation and build

Use the repository-pinned Node 24 and pnpm:

```sh
/Users/jgt/.volta/bin/pnpm --dir packages/subgraph codegen
/Users/jgt/.volta/bin/pnpm --dir packages/subgraph build
```

`generated/` and `build/` are generated artifacts and are not source-of-truth.

## Before any deployment

`subgraph.yaml` deliberately contains the all-zero address and `startBlock: 0`
for every data source. Replace **each** address with its deployed Sepolia
contract address and set its exact deployment block. The placeholder must never
be deployed. No deployment command or Graph access token is stored in this
repository.

The subgraph is a convenience index for historical queries. Confirm current
purchase and certificate facts against `CourseMarket` and `CertificateSBT` on
the configured chain.
