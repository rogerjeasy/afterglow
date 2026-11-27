# Cells — Requirements

**Module:** `packages/core/cells`.
**Workflow:** Design-First (geohash and k-anonymity are fixed designs).
**Spec name equals package name** per `structure.md`.

The Cells module is the privacy-critical heart of the Ember Map. It encodes location as a geohash-6 cell (never coordinates), aggregates per-device reports into a published cell state, enforces k-anonymity (≥5 distinct devices), and detects restoration. It runs identically client-side (local crowds) and server-side (Flink). This is where `privacy-aggregation.md` is enforced in code.

## Glossary (this spec)

- **Cell** — a geohash-6 area (≈1.2 km × 0.6 km).
- **Report** — `{ deviceEpoch, geohash6, minute, verdict, confidence, senses, restoreEdge }`.
- **k** — the k-anonymity threshold; fixed at 5, never per-request configurable, never lowered.
- **Window** — a 5-minute tumbling window for state; a 30-minute sliding window for the distinct-device count.
- **CellState** — the published result: `{ geohash6, windowStart, state, deviceCount, provenance }`.
- **State** — `dark | lit | mixed | comingBack | unknown`.
- **Provenance** — which sources backed the state: `crowd | provider | satellite | telemetry`.

## Requirements

### CE-01 — k-anonymity is never breached
**User story:** As a household, I want my outage invisible on the map until enough neighbours stand behind the same cell, so I can't be singled out.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL publish a `CellState` with a definite state (`dark|lit|mixed|comingBack`) only when at least k = 5 distinct devices reported in the last 30 minutes.
- IF fewer than k distinct devices reported THEN THE SYSTEM SHALL publish `state = unknown` with the true `deviceCount`, never a guess or interpolation.
- THE SYSTEM SHALL NOT make k configurable per request, and SHALL NOT lower k to fill a sparse map.
- THE SYSTEM SHALL count **distinct** devices by `deviceEpoch`, so one device reporting many times never reaches k alone.

### CE-02 — Location is geohash-6 only
**User story:** As a privacy reviewer, I want no coordinate or sub-cell precision anywhere.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL accept and emit location only as a 6-character geohash.
- THE SYSTEM SHALL reject a report whose geohash is not exactly 6 valid base-32 characters.
- THE SYSTEM SHALL NOT expose latitude/longitude or any precision finer than the cell.

### CE-03 — Aggregation is commutative and idempotent
**User story:** As an engineer, I want the same reports to produce the same cell state regardless of order or duplication, so client and server agree.

**Acceptance criteria (EARS):**
- WHEN the same set of reports is aggregated in any order THE SYSTEM SHALL produce the same `CellState`.
- WHEN a report is delivered more than once THE SYSTEM SHALL produce the same `CellState` as if delivered once (distinct by `deviceEpoch + minute + verdict`).

### CE-04 — Cell state reflects the mix of verdicts
**User story:** As a map reader, I want a cell to read dark, lit, or mixed honestly.

**Acceptance criteria (EARS):**
- WHERE k is met and all contributing verdicts are `absent` THE SYSTEM SHALL set `state = dark`.
- WHERE k is met and all contributing verdicts are `present` THE SYSTEM SHALL set `state = lit`.
- WHERE k is met and verdicts are mixed THE SYSTEM SHALL set `state = mixed`.
- THE SYSTEM SHALL ignore `unknown` verdicts when deciding dark/lit/mixed, but SHALL still count their devices toward k only if the device also contributed a definite verdict in the window.

### CE-05 — Restoration detection
**User story:** As a neighbour, I want the map to show "coming back" when phones start charging again, often before the utility says so.

**Acceptance criteria (EARS):**
- WHEN a cell is currently dark, or partly dark (`mixed`), and at least k distinct devices report a restore edge within a 10-minute span THE SYSTEM SHALL set `state = comingBack`. (Amended 2026-11-27: restores trickle in, so a dark cell is often `mixed` for a minute before the k-th edge; see `docs/kiro/pbt-catches.md`.)
- THE SYSTEM SHALL NOT declare `comingBack` for a cell that was lit, unknown or had no prior state.
- THE SYSTEM SHALL NOT declare `comingBack` below k distinct restore-edge devices.

### CE-06 — Geohash round-trips and neighbours are correct
**User story:** As an engineer, I want geohash encoding/decoding and neighbour lookup to be correct so cells line up on the map.

**Acceptance criteria (EARS):**
- WHEN a latitude/longitude is encoded to geohash-6 and decoded THE SYSTEM SHALL return a point within the cell's bounds.
- THE SYSTEM SHALL compute the geohash of a cell deterministically for the same input.

### CE-07 — A query sequence cannot narrow a household below a cell
**User story:** As a privacy red team, I want to prove that combining multiple cell queries never reveals a sub-cell location.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL ensure every published artifact (state, count, provenance) is at cell granularity only.
- THE SYSTEM SHALL ensure that no sequence of published `CellState`s for a cell reveals which devices or sub-areas contributed.

### CE-08 — Provenance is explicit
**User story:** As a map reader, I want to know whether a cell is backed by crowd, provider, satellite, or telemetry.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL record on every `CellState` the set of provenance sources that contributed.
- WHERE only crowd reports back a cell THE SYSTEM SHALL mark provenance `[crowd]`; additional sources are added as they contribute.

## Analysis

- **k and distinctness:** k counts distinct `deviceEpoch`s (CE-01). Because epochs rotate, a single physical device could in theory appear as two epochs over 30 minutes; this is accepted (it can only ever *delay* reaching k, never falsely reach it with one device within one epoch window), and is the conservative, fail-closed direction.
- **Unknown handling (CE-04):** unknown verdicts never push a cell toward a definite state; they are evidence of a device present but undecided. A device counts toward k when it contributed at least one definite verdict in the window.
- **Restoration vs state (CE-05):** `comingBack` is gated on the cell's *prior* dark state, so a never-dark cell cannot "come back". The prior state is an input to aggregation, supplied by the caller (the client's last known cell state or the server's stored state).
- **Out of scope:** the streaming windowing in Flink (Wave 6) reuses these pure functions; this module is the pure aggregation kernel.

## Addendum: windowing (CE-09..CE-13)

`aggregateCell` is the kernel for one set of reports. The Ember Map needs the state of a cell *at a time*, from a stream. These requirements define that layer (`packages/core/src/cells/window.ts`). The Flink job (Wave 6) calls the same functions.

### CE-09 — A state never uses the future
**User story:** As a map reader scrubbing back through the night, I want the cell to show only what was knowable then.

- THE SYSTEM SHALL ignore every report whose `minute` is later than the time being asked about.
- THE SYSTEM SHALL ignore every report older than the 30-minute device-count window (`minute <= now - 30`).

### CE-10 — Each device counts once, by its latest word
**User story:** As a neighbour, I want a phone that said "dark" and then "lit" to count as lit, not as both.

- WHEN a device has several reports in the window THE SYSTEM SHALL use only its latest by `minute`.
- IF one device has conflicting verdicts at its latest minute THEN THE SYSTEM SHALL treat that device's verdict as `unknown` (fail closed), whatever the input order.

### CE-11 — Windowed state is order-independent, idempotent and k-gated
- THE SYSTEM SHALL return the same `CellState` for any ordering or duplication of the same reports.
- THE SYSTEM SHALL return a definite state only with at least k distinct devices in the window (CE-01 holds through the window layer).
- THE SYSTEM SHALL return the requested cell's geohash even when no report is in the window (state `unknown`, `deviceCount` 0).

### CE-12 — "Coming back" is about now
- THE SYSTEM SHALL count a restore edge only if it is within the last 10 minutes before the time being asked about.
- THE SYSTEM SHALL treat a prior state of `comingBack` as still restoring from dark, so the state lasts while fresh restore edges last and no longer.

### CE-13 — A timeline threads its own history
- WHEN building a timeline THE SYSTEM SHALL feed each window the state of the window before it, starting with no prior state.
- THE SYSTEM SHALL produce one `CellState` per step, in time order, each independently k-gated.

## Open question for privacy review (Q1)

Privacy rule 4 says a device reports **on verdict change only**. A 30-minute distinct-device window (CE-01) then forgets a stable cell after 30 minutes: a long outage would fall back to `unknown` once nothing changes. The simulator (`tools/simulator`, SIM-03) assumes a **re-confirmation report every 20 minutes while a verdict holds**, with the same fields and no new data. That is a change to rule 4 and needs a privacy review. If it is rejected, the alternative is for Flink to carry each device's last verdict forward with a TTL; the client kernel here is unchanged either way. Until decided, the map is simulated only and labelled as such.
