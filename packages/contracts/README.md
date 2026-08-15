# Web3 University contracts

Five non-upgradeable contracts implement the onchain boundary:

- `YDToken`: fixed 1,000,000 YD supply, minted once to Treasury.
- `CourseCatalog`: admin-controlled purchase configuration and metadata commitment.
- `CourseMarket`: approve + buy flow, exact-price/deadline checks and atomic 75/25 payout.
- `CertificateSBT`: worker-only, purchase-gated, one non-transferable certificate per wallet/course.
- `ChainlinkPriceOracle`: isolated ETH/USD price and freshness demo; never decides progress, swaps or minting.

## Local verification

Dependencies are intentionally ignored by Git. Install the pinned versions once from the repository root:

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace/packages/contracts \
  ghcr.io/foundry-rs/foundry:v1.7.1 \
  'forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git --shallow'

docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace/packages/contracts \
  ghcr.io/foundry-rs/foundry:v1.7.1 \
  'forge install foundry-rs/forge-std@v1.9.7 --no-git --shallow'
```

Then run the full local suite with the same pinned container:

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace/packages/contracts \
  ghcr.io/foundry-rs/foundry:v1.7.1 \
  forge test -vvv
```

`script/DeployLocal.s.sol` is guarded to Anvil chain ID `31337`. It supports local simulation/broadcast only and deliberately contains no Sepolia key, address or deployment configuration.

## Important interfaces

```solidity
CourseCatalog.configureCourse(courseId, priceYD, payoutWallet, metadataHash)
CourseMarket.buyCourse(courseId, expectedPrice, deadline)
CourseMarket.hasPurchased(buyer, courseId)
CertificateSBT.mintCertificate(student, courseId, metadataURI)
CertificateSBT.certificateOf(student, courseId)
ChainlinkPriceOracle.latestPrice()
```
