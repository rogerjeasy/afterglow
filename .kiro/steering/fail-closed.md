---
inclusion: always
---

# Invariant: fail closed

"Unknown" is a legal output of every function that can be unsure. When evidence is missing, stale or contradictory, return unknown, a wider band, or a refusal. Never return a confident answer to fill the gap. A wrong "safe" or "power is on" can hurt someone in the dark; an honest "unknown" cannot.

Sources: `docs/afterglow-project-description.md` sections 3, 7.2, 7.4 to 7.7, 11 (loaded via `product.md`) and `docs/afterglow-architecture.md` sections 1.1, 5, 7, 9 (loaded via `tech.md`).

## Rules
1. **Sense fusion** (`packages/core/fusion`): mains is present when any positive sense exists and no negative sense contradicts it. Mains is absent only when at least two negative senses agree, or one negative sense is corroborated by at least k neighbouring reports or by home telemetry. Everything else is unknown. The function is pure and order-independent, and every verdict records which senses voted.
2. **Positive-only senses** (light flicker, magnetometer): they can raise "present"; their absence proves nothing and must never count as a negative vote.
3. **Absence of evidence never upgrades a verdict.** A denied permission makes that sense unavailable and the verdict degrades honestly.
4. **Map cells**: below k, publish unknown, never a guess or an interpolation.
5. **Clocks never exceed their source.** Food, medicine and excursion clocks stop at the source limit and say so; they are never extended or rounded up.
6. **Missing inputs**: use conservative defaults and label them as defaults in the UI. With no archetype, show a wide band, never a point estimate.
7. **Decoders never guess.** A Heliograph frame that fails error correction and CRC on every repeat shows "repeat requested". Never display a best-effort decode.
8. **AI is never on the verdict path.** AI may not decide mains state, discard times, medicine budgets, hours of safety, restoration estimates, map cells, thresholds, or send alerts on its own authority. It may propose, translate, phrase deterministic results with citations, and refuse outside the cited corpus.
9. **Every number shows its source**, with model version where a model produced it.
10. **Unknown is designed, not a fallback**: every screen that can show a verdict has an unknown state with a plain-language reason and what would resolve it.

## When writing or reviewing code
- Every function that returns a verdict has an explicit unknown branch and a test that reaches it.
- Prefer a discriminated union (`present | absent | unknown`) over a boolean or an optional.
- Property tests cover: order-independence of sense votes, no upgrade on missing data, clocks bounded by budgets, and shrunken counterexamples recorded in `docs/kiro/pbt-catches.md`.
- Reject a change that adds a default of "safe", "lit" or "present" to cover a missing value.
