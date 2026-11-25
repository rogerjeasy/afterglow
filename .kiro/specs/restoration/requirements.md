# Restoration — Requirements

**Module:** `packages/core/restoration`.
**Workflow:** Design-First (a small statistical kernel with a fixed shape).
**Spec name equals package name** per `structure.md`.

When will the power come back? The provider says one time; utilities run late. This module combines the provider's promise with the utility's own overrun history for the area and returns a band, or an honest refusal. It is the "provider says 22:23 · estimate 22:43 (likely 22:30 to 23:00)" line of the Ember Map (project description 7.3). Pure TypeScript, no I/O, no AI.

## Glossary

- **Promise** — the provider's promised end of the current outage (`promisedEndMinute`).
- **Past outage** — `{ promisedEndMinute, actualEndMinute }` for an earlier outage in the same area. **Overrun** = actual minus promised (negative when early).
- **Eligible overrun** — one that is still possible now: `promisedEndMinute + overrun > nowMinute`.
- **MIN_HISTORY** — 5 eligible past outages needed before a band is shown.

## Requirements

### RS-01 — A band is ordered and in the future
- WHEN the result is an `estimate` THE SYSTEM SHALL satisfy `nowMinute < lowMinute <= atMinute <= highMinute`.
- THE SYSTEM SHALL NOT return an estimate in the past, however late the promise already is.

### RS-02 — No promise, no estimate
- IF there is no promise THEN THE SYSTEM SHALL return `unknown` with the reason, never a figure from history alone.

### RS-03 — Thin history gives no band
- IF fewer than MIN_HISTORY eligible past outages exist THEN THE SYSTEM SHALL NOT return an `estimate`.
- WHEN the promise is still in the future and history is thin THE SYSTEM SHALL return `promiseOnly`: the promised time, labelled as the provider's, with no band.
- WHEN the promise has already passed and history is thin THE SYSTEM SHALL return `unknown`.

### RS-04 — Order-independent
- THE SYSTEM SHALL return the same result for any ordering of the history.

### RS-05 — More lateness never moves the band earlier
- WHEN a past outage is added whose overrun is at least every existing overrun, and the result was an estimate, THE SYSTEM SHALL NOT move `lowMinute`, `atMinute` or `highMinute` earlier.

### RS-06 — Bad input fails closed
- IF `nowMinute`, the promise, or the cell state is not usable (non-finite, non-integer minutes) THEN THE SYSTEM SHALL return `unknown`, never throw and never guess.
- THE SYSTEM SHALL ignore a past outage with a non-finite or non-integer minute, and SHALL count only valid ones toward MIN_HISTORY.

### RS-07 — A lit cell has nothing to estimate
- IF the crowd state of the cell is `lit` THEN THE SYSTEM SHALL return `unknown` with the reason that the cell is not dark.

### RS-08 — Crowd evidence of restoration wins
- WHEN the crowd state is `comingBack` THE SYSTEM SHALL return `underway`, with or without a promise or history.

### RS-09 — Provenance is part of the answer
- THE SYSTEM SHALL return, with every `estimate`, the promised time and the number of past outages used, so the screen can show where the band comes from.

## Analysis

- **Method:** the estimate is `promisedEnd + p50(overrun)` with the band `p10..p90`, using nearest-rank percentiles on integer minutes so the result is exactly reproducible. It is deliberately simple: a gradient-boosted forecast (Wave 6.6) replaces it only when it beats this baseline on held-out outages, and it will emit the same shape.
- **Conditioning on now:** restoration cannot already have happened, so the percentiles are taken over overruns that are still possible now. This is what keeps a late outage honest: at 40 minutes past the promise, only past outages that ran at least that late count.
- **Crowd trajectory:** the project description also names the crowd's own trajectory as an input. In this slice the crowd contributes the `comingBack` and `lit` states (RS-07, RS-08). Using the spread of per-cell restoration times as a further input is left until real crowd data exists to calibrate it.
- **Out of scope:** where the history comes from. The app passes simulated history in demo mode and nothing otherwise (so the estimate is `unknown` outside the demo). Provider adapters (Wave 4) and the Adherence table (Wave 6) supply real history.
