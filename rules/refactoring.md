# TypeScript refactoring rules

## Current requirements first

- Implement the smallest complete solution for confirmed requirements. Do not
  pre-build speculative frameworks, extension points, or shared layers.
- Repetition counts, file size, and complexity are review signals, not automatic
  reasons to split or abstract.
- Abstract only code that shares the same knowledge, invariant, or reason to
  change.

## Organize by responsibility

- Each file should have a clear primary responsibility and reason to change.
- Separate UI, domain rules, data access, side effects, and configuration when
  they form independently understandable or testable boundaries.
- Avoid one-use forwarding wrappers and directories that add navigation without
  hiding meaningful complexity.
- Keep database migration ownership in `apps/api`; Go code must not create a
  second schema source of truth.

## Small behavior-preserving refactors

- Keep structural refactoring separate from visible behavior changes.
- Establish a relevant green test or other behavior baseline before refactoring.
- Make one describable change at a time and run the cheapest credible check.
- Automatic fixes are limited to mechanical changes; naming, responsibilities,
  abstractions, and business semantics require review.

## Evidence gates

- The minimum TypeScript evidence chain is a read-only Biome check, TypeScript
  typecheck, and relevant behavior tests.
- CI must not write code or run unsafe fixes.
- A passing test only lowers risk within the behavior it actually exercises.
