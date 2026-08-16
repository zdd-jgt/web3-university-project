# Uniswap v4 Sepolia pool plan

This is a prepare-only plan. It contains no private key, deployment command, or
approved liquidity amount. Do not initialize or fund either pool until the YD
deployment and both asset amounts are confirmed separately.

## Fixed choices

- Network: Ethereum Sepolia (`11155111`).
- Protocol: official Uniswap v4; no custom AMM.
- Pool fee: `3000` (0.30%); tick spacing: `60`; hooks: zero address.
- Test USD₮: Tether WDK Sepolia
  `0xd077a400968890eacc75cdc901f0356c943e4fdb`, 6 decimals.
- YD: the project's deployed ERC-20 address, 18 decimals; currently pending.
- Native SepoliaETH is represented by `address(0)` in the v4 PoolKey.
- Students can quote and swap. The application exposes no add/remove liquidity
  page.

## Initial prices

`sqrtPriceX96` is derived from raw token units after currencies are sorted by
address:

```text
sqrtPriceX96 = sqrt(raw amount of currency1 / raw amount of currency0) * 2^96
```

For Test USDT/YD, the human ratio is fixed at:

```text
1 Test USDT = 10 YD
```

Because Test USDT has 6 decimals and YD has 18, the raw ratio must include the
decimal difference. The exact direction cannot be finalized until the YD
address determines whether YD is `currency0` or `currency1`.

For SepoliaETH/YD, the operator records a fresh ETH/USD reference and manually
calculates the starting ratio. Given the Test USDT/YD anchor above, the formula
is:

```text
YD per ETH = chosen ETH/USD reference * 10
```

This reference is used only at pool initialization. Chainlink does not control
the pool afterward; both pools move independently according to swaps and
liquidity.

## Required human confirmation before any transaction

Record and confirm all of the following in one deployment ticket:

1. Deployed YD address and deployment receipt.
2. Test USDT amount and YD amount for the Test USDT/YD position.
3. SepoliaETH amount and YD amount for the ETH/YD position.
4. ETH/USD reference value, source, timestamp, and calculated ETH/YD ratio.
5. Initial tick and `sqrtPriceX96` for each sorted PoolKey.
6. Funding wallet, recipient of both liquidity-position NFTs, and maximum gas.
7. PoolManager and PositionManager addresses rechecked against Uniswap's
   current Sepolia deployment registry.

## Acceptance evidence

- Each PoolKey and pool ID are independently reproduced from the recorded
  currencies, fee, tick spacing, and hook address.
- Initialization and liquidity receipts succeed on Sepolia and are linked in
  the deployment record.
- Quoter returns nonzero Test USDT-to-YD and native-ETH-to-YD quotes.
- A small approved swap in each pool respects minimum output and deadline.
- Test USDT requires ERC-20/Permit2 authorization; native ETH sends value and
  requires no ERC-20 approval.
- The web page displays quote, price impact, slippage, minimum received, and
  deadline using live chain reads.

Official references:

- [Create a Uniswap v4 pool](https://developers.uniswap.org/docs/protocols/v4/guides/create-pool)
- [Uniswap v4 Sepolia deployments](https://developers.uniswap.org/docs/protocols/v4/deployments)
- [Quote a v4 swap](https://developers.uniswap.org/docs/sdks/v4/guides/swapping/quoting)
- [Single-hop v4 swap](https://developers.uniswap.org/docs/sdks/v4/guides/swapping/single-hop-swapping)
- [Tether WDK EVM configuration](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/configuration/)
