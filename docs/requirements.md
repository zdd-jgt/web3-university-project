# Confirmed MVP requirements

## Included

- Desktop-first React application with a public explanatory landing page.
- Privy email/social and wallet authentication; MetaMask/Rabby linking.
- Teacher application, course draft, admin review, publish, and unpublish. The
  teacher proposes the initial YD price and payout wallet at submission; only
  the admin-approved values are published onchain.
- Fixed-supply YD token and exact-amount approve-then-buy course flow.
- Separate Uniswap v4 Test USDT/YD and native Sepolia ETH/YD pools.
- Atomic 75% teacher and 25% treasury purchase settlement.
- Private MP4 upload and playback with no public preview.
- Required lesson coverage of at least 95%; all required lessons produce 100%
  course completion.
- Durable automatic SBT mint to the purchasing wallet.
- Purchaser-only comments, teacher replies on owned courses, admin moderation.
- The Graph for history, direct RPC for current state, and a resumable Go worker
  for operational event processing.
- Isolated Chainlink ETH/USD freshness demonstration.

## Excluded

- Mainnet, real-value assets, refunds, quizzes, mobile-wallet flows, video
  transcoding, public LP management, upgradeable proxies, and deployed CRE
  workflows.
- Production high availability. A single-EC2 topology is coursework-only and
  requires separate deployment authorization.
