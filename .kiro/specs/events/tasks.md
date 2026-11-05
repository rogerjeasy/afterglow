# Events — Tasks

Status: `[x]` done, `[ ]` planned.

## Wave 1.1 — Event log and reducers (done)

- [x] 1. Event types: `AfterglowEvent`, `DeviceEpoch`, `eventId`, `Reducer`
  - _Requirements: EV-01, EV-04, EV-08_
  - _File: `packages/core/src/events/types.ts`_

- [x] 2. Lamport clock: `createClock`, `tick`, `observe`
  - _Requirements: EV-07_
  - _File: `packages/core/src/events/clock.ts`_

- [x] 3. `EventLog`: validate, total order (`compareEvents`), idempotent append with deterministic survivor on identity collision
  - _Requirements: EV-01, EV-02, EV-04_
  - _File: `packages/core/src/events/log.ts`_

- [x] 4. Reducer framework: `reduce`, `lwwField`, `appendOnly`
  - _Requirements: EV-03, EV-05, EV-06_
  - _File: `packages/core/src/events/reduce.ts`_

- [x] 5. Property tests EV-01..EV-08 (fast-check)
  - _Requirements: EV-01..EV-08_
  - _File: `packages/core/src/events/events.property.test.ts`_
  - _Note: EV-06 caught a real order-dependence bug in dedup; recorded in docs/kiro/pbt-catches.md._

## Wave 2 — Persistence (planned; lives in packages/adapters)

- [ ] 6. SQLite-backed event store implementing the same log semantics; reducer views materialised and incrementally updated
  - _Requirements: EV-01, EV-03_

- [ ] 7. Concrete domain reducers (appliances, clocks, roster, reports) built on `lwwField` / `appendOnly`
  - _Requirements: EV-05, EV-06_
