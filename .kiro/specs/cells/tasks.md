# Cells — Tasks

Status: `[x]` done, `[ ]` planned.

## Wave 1.2 — Geohash + k-anonymity aggregation kernel (done)

- [x] 1. Geohash-6 encode/decode/bounds/centre + `isGeohash6` validation
  - _Requirements: CE-02, CE-06_
  - _File: `packages/core/src/cells/geohash.ts`_

- [x] 2. Report and CellState types; k, restore window, device-count window constants
  - _Requirements: CE-01, CE-05, CE-08_
  - _File: `packages/core/src/cells/types.ts`_

- [x] 3. `aggregateCell`: validate + dedup, distinct-device count toward k, k-anonymity gate, dark/lit/mixed, restoration, provenance
  - _Requirements: CE-01, CE-03, CE-04, CE-05, CE-08_
  - _File: `packages/core/src/cells/aggregate.ts`_

- [x] 4. Property tests CE-01..CE-08 (fast-check), incl. the single-device-never-reaches-k and geohash round-trip properties
  - _Requirements: CE-01..CE-08_
  - _File: `packages/core/src/cells/cells.property.test.ts`_

## Wave 6 — Streaming reuse (planned)

- [ ] 5. Flink cell-aggregation job calls this pure kernel per window (5-min tumbling state, 30-min sliding distinct count); k re-checked at the API
  - _Requirements: CE-01, CE-03_

- [ ] 6. Privacy Red Team pass: attempt to de-anonymise a cell from a sequence of published states; record findings in docs/kiro/privacy-findings.md
  - _Requirements: CE-07_
