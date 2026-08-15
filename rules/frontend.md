# Frontend rules

- Keep live API/chain data separate from labelled demonstration data.
- Financial actions fail closed unless chain ID, contract addresses, wallet,
  current offer, receipt, and post-transaction read all agree.
- Desktop is the MVP baseline. Mobile-wallet and deep-link flows are excluded.
- UI tasks require focused component tests; browser, keyboard, and visual checks
  are reported as unverified when no browser is available.
