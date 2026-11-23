# Formulary — Tasks

Status: `[x]` done, `[ ]` planned. Requirement ids FM-01..FM-13 appear in the property-test names in `packages/core/src/formulary/formulary.property.test.ts`.

## Wave 1.6 — Core (pure, no drug data)

- [x] 1. Types: entry shape, `Verifier`, `ValidatedEntry` brand, `ClockResult` and `LookupResult` unions
  - _Requirements: FM-01, FM-03, FM-10_
  - _File: `packages/core/src/formulary/types.ts`_
- [x] 2. Entry validation and canonical signed payload (`parseEntry`, `canonicalPayload`, `normaliseProduct`, `parseApprovedAt`)
  - _Requirements: FM-01, FM-02_
  - _File: `packages/core/src/formulary/entry.ts`_
- [x] 3. Admission: `buildFormulary` with injected verifier, module-private registry, order-independent conflict resolution
  - _Requirements: FM-01, FM-03, FM-11_
  - _File: `packages/core/src/formulary/admit.ts`_
- [x] 4. Exact lookup and prefix search: `lookupEntry`, `searchFormulary`
  - _Requirements: FM-02, FM-13_
  - _File: `packages/core/src/formulary/lookup.ts`_
- [x] 5. Excursion clock and modelled series: `excursionClock`, `modelledSeries`, `formatMinutes`
  - _Requirements: FM-04 to FM-10, FM-12_
  - _File: `packages/core/src/formulary/clock.ts`_
- [x] 6. Property tests FM-01..FM-13 (40 tests; also run at 20x the default run count)
  - _File: `packages/core/src/formulary/formulary.property.test.ts`_
- [x] 7. Mutation check: eight deliberate regressions (accept truthy verifier, skip admitted check, remove budget cap, tolerate +5 C over label, judge by cooler end, prefix lookup, ignore same-date conflicts, accept `maxTempC` below the refrigerated range), each failed at least one test, then restored
  - _Requirements: FM-01, FM-02, FM-03, FM-04, FM-07, FM-08, FM-11_

## Guardrails (done in the same slice)
- [x] 8. `deny-formulary-write` (file tools) and `deny-formulary-write-shell` hooks: only the review pipeline writes `afterglow-formulary/validated/**`
  - _Files: `.kiro/hooks/deny-formulary-write.json`, `.kiro/hooks/deny-formulary-write-shell.json`_

## Planned (not in this slice)
- [x] 9. Adapter: async Ed25519 verification of a signed snapshot against pinned anchors, signed manifest, rollback protection, key rotation (FM-15..FM-19; 24 tests, mutation-checked)
  - _File: `packages/adapters/src/formulary/loader.ts`_
- [x] 9a. In-use caveat on every in-use result (FM-14)
- [ ] 10. Snapshot cache on device (Wave 2.5) and loading in the app
- [x] 11. Medicine screens: picker over `searchFormulary`, clock card per medicine with provenance, Hearth tile; states: loading, no table, empty, not in table, power on, running, in range, used up, beyond label, unknown. Not yet: the label-photo submission (needs the review queue).
  - _Files: `apps/mobile/src/screens/Medicines.tsx`, `apps/mobile/src/data/formulary.ts`_
- [ ] 12. `afterglow-formulary` repository and review pipeline (proposer, validator from a different model family, pharmacist approval, signing with the same `canonicalPayload`)
- [ ] 13. `formulary-docs-regen` hook once the table repository exists
- [ ] 14. Pharmacist confirmation (questions written in `docs/kiro/pharmacist-questions.md`) of two open modelling questions (see Analysis): the 8 °C refrigerated edge, and whether in-use budgets count time since opening regardless of temperature
