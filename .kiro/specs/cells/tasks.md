# Implementation Plan: Cells

## Overview

The Cells module is the privacy-critical kernel of the Ember Map: geohash-6 encoding and a k-anonymity aggregation that publishes a cell only when at least 5 distinct devices stand behind it. It is pure TypeScript in `packages/core/src/cells`. Status: `[x]` done, `[ ]` planned. Requirement ids (CE-01..CE-08) are defined in `requirements.md`.

## Tasks

### Wave 1.2 — Geohash + k-anonymity aggregation kernel (done)

- [x] 1. Geohash-6 encode/decode/bounds/centre + `isGeohash6` validation
  - _Requirements: CE-02, CE-06_
  - _File: `packages/core/src/cells/geohash.ts`_

- [x] 2. Report and CellState types; k, restore window, device-count window constants
  - _Requirements: CE-01, CE-05, CE-08_
  - _File: `packages/core/src/cells/types.ts`_

- [x] 3. `aggregateCell`: validate + dedup, distinct-device count toward k, k-anonymity gate, dark/lit/mixed, restoration, provenance
  - _Requirements: CE-01, CE-03, CE-04, CE-05, CE-08_
  - _File: `packages/core/src/cells/aggregate.ts`_

- [x] 4. Property tests CE-01..CE-08 (fast-check), including the single-device-never-reaches-k and geohash round-trip properties
  - _Requirements: CE-01..CE-08_
  - _File: `packages/core/src/cells/cells.property.test.ts`_

### Windowing (done)
- [x] 4a. `cellStateAt` and `cellTimeline`: 30-minute window, latest word per device, no future, fresh restore edges only, each window threaded into the next, sorted and sliced for speed
  - _Requirements: CE-09..CE-13_
  - _File: `packages/core/src/cells/window.ts`_
- [x] 4b. Property tests CE-09..CE-13 (15 tests), including the timeline equal to the naive step-by-step answer, and the Q1 pin
  - _File: `packages/core/src/cells/window.property.test.ts`_
- [ ] 4c. Privacy review of open question Q1 (re-confirmation reports versus a server-side carry-forward)
### Wave 6 — Streaming reuse (planned)

- [ ] 5. Flink cell-aggregation job calls this pure kernel per window (5-minute tumbling state, 30-minute sliding distinct count); k re-checked at the API
  - _Requirements: CE-01, CE-03_

- [ ] 6. Privacy Red Team pass: attempt to de-anonymise a cell from a sequence of published states; record findings in `docs/kiro/privacy-findings.md`
  - _Requirements: CE-07_

## Notes

- k is fixed at 5 and is never configurable per request (`privacy-aggregation.md` rule 1).
- Below k a cell is `unknown`, never a guess or an interpolation (`fail-closed.md` rule 4).
- Tasks 5 and 6 are blocked on the backend wave (Flink job) and the Privacy Red Team agent respectively.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3"] },
    { "id": 2, "tasks": ["4"] },
    { "id": 3, "tasks": ["5", "6"] }
  ]
}
```
