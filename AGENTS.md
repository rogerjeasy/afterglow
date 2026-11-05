# AGENTS.md — universal contract for Afterglow

This file is the always-included contract for every agent and contributor working in this repository. It is deliberately short. The full reasoning lives in `.kiro/steering/` and `docs/`; this is the non-negotiable summary.

## The product in one line
Afterglow is the blackout companion for people with unreliable electricity: "the only app you can read when the grid dies." Built for Kiroween 2026 (Costume Contest), where every spooky element is a measurement.

## The five invariants (never violate)

1. **Deterministic core.** Every verdict (mains state, discard time, medicine budget, hours of safety, restoration estimate, map cell) comes from pure deterministic code with citable inputs. AI may propose, translate, phrase, or audit — it is **never on the verdict path**. See `.kiro/steering/fail-closed.md`.
2. **Fail closed.** `unknown` is a legal, first-class output of every function that can be unsure. Never return a confident "safe"/"present"/"lit" to fill a gap. Clocks never exceed their source.
3. **Privacy by construction.** Raw audio/camera/magnetometer bytes never leave RAM and are never stored. Location leaves the device only as geohash-6. A cell is published only when ≥ 5 distinct devices back it (k ≥ 5), enforced in code and re-checked at the API. See `.kiro/steering/privacy-aggregation.md`.
4. **Night vision.** The consumer app is red-only on pure black; there is no light mode. Luminance is a budget; no pixel exceeds the active mode's ceiling. Components consume semantic tokens only; raw hex lives only in `theme.night.json`. See `.kiro/steering/night-vision.md`.
5. **The label is the law.** Medicine numbers come only from validated, signed, pharmacist-approved formulary entries. Not in the table → no clock, "ask your pharmacist." See `.kiro/steering/label-only-medicine.md`.

## Architecture rules

- Dependencies point downward only: UI → feature modules → `packages/core` → adapters → OS. `packages/core` imports nothing but itself (no I/O, no timers, no randomness except injected generators).
- Every external source sits behind an adapter (`fetch`, `normalise`, `health`) and is tested against recorded fixtures, including malformed ones.
- Storage/ingest assume burst load: accept and buffer first, compute later; clients get `202` immediately.
- Platform differences live in `.native.ts` / `.web.ts` / `.android.ts` / `.ios.ts` adapters.

## Definition of done

- **Properties are the definition of done.** Each EARS requirement id (e.g. `GS-07`) appears in its property-test name and its task. A feature is not done until its properties are green.
- When a property shrinks a counterexample, record it in `docs/kiro/pbt-catches.md` the same day.
- Tests: Vitest + fast-check (TS), Hypothesis + pytest (Python), Playwright (web e2e/pixel scan).

## Shell and secrets

- Allowed by default: `pnpm test*`, `pnpm lint*`, `pnpm typecheck*`, read-only git.
- **Never** run `npm publish`, `eas submit`, `terraform apply`, or anything that sends SMS, calls, or push to real users. Publishing and deploying are human steps.
- No secrets in code, logs, or prompts. Files matched by `.kiroignore` (env files, keys, raw audio) are never read.
