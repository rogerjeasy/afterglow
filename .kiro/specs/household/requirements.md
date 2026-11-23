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

### HH-08 — Medicines are the user's list of names, never storage data
- THE SYSTEM SHALL record a medicine as `{ medicineId, applianceId, product, condition }` and nothing else: no temperature, duration or label text is stored in the log.
- IF a medicine event is malformed THEN THE SYSTEM SHALL ignore it (HH-03). WHEN a removal is later than the last set THE SYSTEM SHALL omit it (HH-02). WHEN its appliance is removed THE SYSTEM SHALL drop it.

### HH-09 — A medicine clock comes only from a validated formulary entry
- THE SYSTEM SHALL report `notInTable` for a medicine that has no validated entry for its product and condition, including when no table is loaded, and SHALL NOT compute a clock for it.
- WHEN the power is on THE SYSTEM SHALL report `noOutage` for a found medicine and SHALL NOT compute a clock.
- WHEN an outage is running THE SYSTEM SHALL compute the clock from the formulary's `excursionClock` over the modelled temperature of the appliance the medicine is in, from minute 0 to now, so door openings (HH-04) shorten it.

### HH-10 — Medicine assessment is deterministic and bounded
- THE SYSTEM SHALL return the same assessments for the same view, table and time, and SHALL sample the temperature at about 2 000 points however long the outage has lasted.

### HH-11 — The roster is people with a slot, and nothing else
- THE SYSTEM SHALL record a roster member as `{ personId, name, slot }`, where `slot` is a whole number from 0 to 63, and nothing else about the person (no phone number, address or location).
- IF a roster event is malformed THEN THE SYSTEM SHALL ignore it (HH-03). WHEN a removal is later than the last set THE SYSTEM SHALL omit the member (HH-02).
- THE SYSTEM SHALL record a word from a member as `{ personId, code, atMs, channel }` with a Heliograph message name and a channel of light, sound, sms, ble or manual, and SHALL keep the latest per member, breaking ties deterministically, whatever the order the events arrive in.

### HH-12 — A ghost is someone not heard from
**User story:** As a caretaker, I want the board to say who I have not heard from, and to never call someone safe on old news.
- THE SYSTEM SHALL mark a member a **ghost** when nothing has been heard from them, or, during an outage, when the latest word is from before the outage began.
- THE SYSTEM SHALL mark a member **help** when their latest word is HELP, and SHALL list help first, then ghosts, then the rest.
- THE SYSTEM SHALL NOT report a member as safe unless their latest word is SAFE and it is not older than the outage.

### HH-13 — A received message is attributed only when its slot is unambiguous
- WHEN a message arrives with a slot that belongs to exactly one roster member THE SYSTEM SHALL attribute it to that member.
- IF the slot belongs to no member THEN THE SYSTEM SHALL report `unknownSlot`. IF it belongs to two or more THEN THE SYSTEM SHALL report `ambiguousSlot`. In both cases it SHALL NOT attribute the message to anyone.
- THE SYSTEM SHALL offer the lowest free slot for a new member, and none when all 64 are taken.

## Analysis
- **Door model.** `thermal.applyDoorEvents` folds door openings into the start state, so a door opened at hour 3 is modelled as warming from minute 0. That is earlier and therefore conservative (fail closed). A time-resolved door model is future work.
- **Time.** The core has no clock. Event payloads carry wall-clock milliseconds supplied by the caller, and derivations take `nowMs` as an argument.
- **Roster (HH-11 to HH-13).** The roster is the receiver's own list, so the slot is meaningful only on this device (pair-local, never a global identifier). Names are the user's own words and stay on the device. A message whose slot is shared by two people is refused rather than attributed, because guessing who said "SAFE" is the failure the product exists to avoid. Until QR pairing exists, a sender and a watcher agree a slot by hand.
- **Medicines (HH-08 to HH-10).** The household stores only the user's choice of product and condition. Numbers come from the `formulary` module and only for validated entries (`label-only-medicine.md`). A medicine in an appliance is driven by that appliance's modelled temperature, so one model serves food and medicine. The outage start is taken as the moment the medicine began to warm, which is the earliest and therefore conservative.
- **Out of scope:** sync, SQLite persistence (Wave 2), forecast-driven outdoor temperature (Wave 4), BLE thermometers (sensing wave).
