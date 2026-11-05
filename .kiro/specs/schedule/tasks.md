# Schedule — Tasks

Status: `[x]` done, `[ ]` planned.

## Wave 1.3 — Merge + adherence kernel (done)

- [x] 1. Types: `ScheduleWindow`, `ObservedInterval`, `MergedTimeline`, `Adherence`, `NextWindow`
  - _Requirements: SC-01, SC-05, SC-07_
  - _File: `packages/core/src/schedule/types.ts`_

- [x] 2. `mergeSchedule`: validate, group by area+source, coalesce within group, sort; `nextWindow`
  - _Requirements: SC-01, SC-02, SC-03, SC-04, SC-07_
  - _File: `packages/core/src/schedule/merge.ts`_

- [x] 3. `scoreAdherence`: de-overlapped promised denominator, promised∩observed overlap, bounded [0,1], unknown when nothing promised
  - _Requirements: SC-05, SC-06_
  - _File: `packages/core/src/schedule/adherence.ts`_

- [x] 4. Property tests SC-01..SC-07 (fast-check)
  - _Requirements: SC-01..SC-07_
  - _File: `packages/core/src/schedule/schedule.property.test.ts`_

## Wave 4 — Provider adapters (planned)

- [ ] 5. Provider adapter contract (`fetch`/`normalise`/`health`) emitting `ScheduleWindow[]`; conformance suite on recorded feeds incl. malformed
  - _Requirements: SC-01, SC-04_
- [ ] 6. Wave-1 providers (EskomSePush, YASNO/DTEK, LUMA, manual) normalised into `mergeSchedule`
  - _Requirements: SC-02, SC-03_
