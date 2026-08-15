# Git rules

- XJ execution requires a resolvable commit baseline; do not use an ambiguous
  working-tree snapshot as runner evidence.
- Preserve unrelated user changes. Never reset, stash, delete, or rewrite them
  automatically.
- Task review is limited to declared `owned_paths` from its captured baseline.
- Do not commit secrets, generated build output, Foundry dependencies, or local
  infrastructure data.
