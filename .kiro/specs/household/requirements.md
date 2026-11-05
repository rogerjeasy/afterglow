# Household — Requirements

**Module:** `packages/core/src/household` (pure event-sourced view and derivations).
**Workflow:** Requirements-First.
**Spec name equals package name** per `structure.md`.

The Household module is the user's own data for the cold-chain and hours-of-safety features: their appliances, what is in them, door openings, when the power went out, their ice-crystal checks and a home profile. Everything is an event in the append-only log (`events`), and the view is a pure reduction of it, so replay, undo and audit are free. It also derives what the Cold screen and Hearth tiles show by combining the view with `thermal` and `foodkeeper`. Pure: the caller supplies the log, the food index and the current time.

## Glossary (this spec)
- **Appliance** — a fridge, freezer, cooler box etc. with a class, fullness and room temperature.
- **Outage** — `outageStartedAtMs`; null when the power is on.
- **Window** — the minute (since power loss) at which an appliance stops covering its food.
- **Headline** — the one number a tile shows for an appliance.
- **Home profile** — building archetype (or unknown), indoor and outdoor temperature, and the risk threshold.

## Requirements

### HH-01 — The view is a pure function of the log and does not depend on arrival order
- WHEN the same set of events is supplied in any order THE SYSTEM SHALL produce the same view.
- WHEN the log is rebuilt from its own events THE SYSTEM SHALL produce an equal view (replay equivalence).

### HH-02 — Last writer wins per entity; removals are events
- WHEN two events set the same appliance, item, check, outage or home profile THE SYSTEM SHALL keep the one with the greater `(lamport, deviceEpoch)`.
- WHEN a removal is later than the last set THE SYSTEM SHALL omit the entity; WHEN a set is later than the removal THE SYSTEM SHALL include it.
- THE SYSTEM SHALL keep every door-opening event (append-only), never overwriting one with another.

### HH-03 — Malformed events are ignored, never trusted
- IF an event of a household type has a payload that fails validation (wrong types, non-finite or out-of-range numbers, unknown appliance class) THEN THE SYSTEM SHALL ignore it and leave the view unchanged.
- THE SYSTEM SHALL ignore events of other types.
- Unknown food ids are kept as items but assess to `unknown` (FK-08), never to a verdict.

### HH-04 — Door openings count only during the current outage, only warm, and never past ambient
- THE SYSTEM SHALL apply a door opening to the thermal state only when it happened at or after the outage start.
- THE SYSTEM SHALL produce a start temperature between the appliance's initial temperature and the room temperature, and more open minutes SHALL NOT make the compartment colder.

### HH-05 — The appliance window respects the USDA source
- THE SYSTEM SHALL set a refrigerated appliance's window to `min(240, modelled crossing of 4.4 °C)` minutes, never more than 240.
- THE SYSTEM SHALL set a frozen appliance's window to the modelled time to reach 0 °C, or report that the model expects it to stay frozen.
- WHEN no outage is active THE SYSTEM SHALL report the window as a prediction ("holds") and SHALL NOT report any food as discarded.

### HH-06 — Hours of safety is a band, and unknown stays unknown
- WHERE the home has no matching archetype THE SYSTEM SHALL return the wide default band flagged as a default.
- IF the home profile is missing or invalid THEN THE SYSTEM SHALL return `unknown` with a reason.
- WHERE the outdoor temperature never reaches the threshold THE SYSTEM SHALL say so rather than give a time.
- THE SYSTEM SHALL return the earliest, middle and latest remaining times with earliest ≤ middle ≤ latest.

### HH-07 — Defaults are labelled
- WHERE the room temperature was not set by the user THE SYSTEM SHALL mark the appliance `ambientIsDefault` (22 °C reference) so the UI can say so.

## Analysis
- **Door model.** `thermal.applyDoorEvents` folds door openings into the start state, so a door opened at hour 3 is modelled as warming from minute 0. That is earlier and therefore conservative (fail closed). A time-resolved door model is future work.
- **Time.** The core has no clock. Event payloads carry wall-clock milliseconds supplied by the caller, and derivations take `nowMs` as an argument.
- **Medicines are not here.** Medicine clocks are governed by `label-only-medicine.md` and a separate validated-formulary module (Wave 1.6).
- **Out of scope:** sync, SQLite persistence (Wave 2), forecast-driven outdoor temperature (Wave 4), BLE thermometers (sensing wave).
