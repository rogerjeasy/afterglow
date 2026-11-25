---
name: pbt-authoring
description: Write fast-check property tests for Afterglow's pure core (Vitest) from EARS requirements, and triage a shrunken counterexample. Use when adding a property, when a property fails or flakes, or when a module has no property test yet.
---
# Property-based testing

Properties are the definition of done. Stack: Vitest + fast-check (TypeScript), Hypothesis + pytest (Python). Test files sit beside the code as `*.property.test.ts`.

## Writing a property
1. Pick the requirement id. The test name starts with it: `it('CE-09 reports after now are ignored', …)`.
2. State the property universally and generate the inputs (`fc.array(reportArb)`), including the awkward ones: duplicates, reversed order, empty, non-finite numbers, the boundary value.
3. Cover these every time they apply: **order-independence**, **idempotence**, **no upgrade on missing data**, **a result bounded by its source**, **unknown is reached**, **bad input never throws**.
4. Compare against a naive reference when you optimise ("the sliced timeline equals the step-by-step answer").
5. Keep the run count high enough to find rare cases. A property that fails one run in four was found by luck; add an exhaustive or example test for the case it found.

## Triage a shrunken counterexample
1. Re-run the shrunk case alone and deterministically (`{ seed, path }` from the output).
2. Decide which part is wrong: the **implementation**, the **test** or the **requirement**. Say which, honestly. A test that over-assumed (for example, reading the mode label instead of the direction) is the test's bug.
3. Fix the right thing. If the implementation was wrong, add a named regression test for the counterexample and an exhaustive test if the input space is small enough.
4. **Prove the new test catches it**: revert only the fix, confirm the test fails, restore. This is the mutation check; do it.
5. Record it in `docs/kiro/pbt-catches.md` the same day (see the `kiro-evidence` skill).

## Pitfalls seen here
- `expect()` in a loop of thousands is slow: collect violations in an array and assert once.
- Wall-clock bounds are flaky under parallel CI: assert on work done, not on time.
- A formatter that reflows a line can silently defeat a scripted edit: re-read the file after editing.
