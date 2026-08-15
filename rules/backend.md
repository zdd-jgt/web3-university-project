# Backend rules

- Normalize and validate every external value before persistence.
- Derive identity, wallet, role, price, ownership, and state transitions from
  trusted session, database, or contract facts rather than request claims.
- Use atomic conditional updates for review/state transitions and PostgreSQL
  Outbox for chain side effects.
- API changes require negative authorization and state-conflict tests.
