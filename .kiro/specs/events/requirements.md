# Events — Requirements

**Module:** `packages/core/events`.
**Workflow:** Design-First (event-sourcing is a fixed, well-understood design; requirements match it).
**Spec name equals package name** per `structure.md`.

Everything in Afterglow that persists does so as an **append-only event log**: every user action and every sensing verdict is an immutable event. Materialised views (appliances, clocks, roster, reports) are pure reducers over the log, so replay, undo, and audit are free, and the same reducers run on the device and on the server (architecture §4.5). This module defines the event types, the log, and the reducer framework. It has no I/O — persistence adapters (SQLite) sit above it in Wave 2.

## Glossary (this spec)

- **Event** — an immutable record `{ deviceEpoch, lamport, type, payload, modelVersion? }`.
- **deviceEpoch** — the rotating per-device identifier in force when the event was created (privacy: not a stable id).
- **lamport** — a monotonic logical clock per device, giving a total order within a device and a deterministic tie-break across devices.
- **Reducer** — a pure function `(state, event) => state` folding events into a view.
- **View** — the materialised result of reducing the log (or a slice of it).
- **LWW** — last-writer-wins conflict resolution, ordered by `(lamport, deviceEpoch)`.

## Requirements

### EV-01 — Events are immutable and well-formed
**User story:** As an auditor, I want every change recorded as an immutable event so the household's history can be replayed and trusted.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL represent every change as an event `{ deviceEpoch, lamport, type, payload }` with an optional `modelVersion`.
- THE SYSTEM SHALL treat events as immutable once created; there SHALL be no update or delete of an event, only new events.
- IF an event is malformed (missing required field, negative lamport) THEN THE SYSTEM SHALL reject it rather than store it.

### EV-02 — Deterministic total order
**User story:** As an engineer, I want a deterministic order over events from many devices so every replica computes the same view.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL order events by `lamport` ascending, breaking ties by `deviceEpoch` ascending.
- WHEN the same multiset of events is ordered on any replica THE SYSTEM SHALL produce the same sequence.

### EV-03 — Reducers are pure and replay-equivalent
**User story:** As an engineer, I want views derived purely from the log so replaying the log always reproduces the same state.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL compute every view as a pure reduction over the ordered log, with no I/O, timers, or randomness.
- WHEN the log is replayed from the start THE SYSTEM SHALL reproduce the identical view.
- WHEN events are appended in any arrival order THE SYSTEM SHALL produce the same view after ordering (order-independence of arrival).

### EV-04 — Idempotent append (dedup)
**User story:** As a sync client, I want re-delivering the same event to be harmless so retries can't corrupt the view.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL identify an event uniquely by `(deviceEpoch, lamport, type)`.
- WHEN an event with an identity already present is appended THE SYSTEM SHALL ignore it (idempotent append).
- WHEN duplicate events are present in a log THE SYSTEM SHALL reduce to the same view as the de-duplicated log.

### EV-05 — Last-writer-wins by logical clock
**User story:** As a user editing the same appliance on two phones, I want a deterministic, non-arbitrary resolution.

**Acceptance criteria (EARS):**
- WHERE two events set the same field of the same entity THE SYSTEM SHALL keep the one with the greater `(lamport, deviceEpoch)`.
- THE SYSTEM SHALL apply LWW per entity field, not per whole entity, so independent fields do not clobber each other.

### EV-06 — Append-only entities never lose data
**User story:** As a user, I want roster messages and sensing reports to accumulate, never overwrite.

**Acceptance criteria (EARS):**
- WHERE an entity is append-only (roster messages, reports) THE SYSTEM SHALL accumulate all events and SHALL NOT apply LWW to them.
- THE SYSTEM SHALL preserve every append-only event through replay and de-duplication.

### EV-07 — Lamport clock advances correctly
**User story:** As an engineer, I want the logical clock to respect causality so later-knowledge events sort after earlier ones.

**Acceptance criteria (EARS):**
- WHEN a device creates an event THE SYSTEM SHALL assign it a lamport strictly greater than any lamport the device has observed.
- WHEN a device observes an external event THE SYSTEM SHALL advance its clock to at least that event's lamport.

### EV-08 — No secrets or raw media in events
**User story:** As a privacy reviewer, I want events to never carry secrets or raw sensor media.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL NOT place raw audio, camera, or magnetometer data in any event payload.
- THE SYSTEM SHALL NOT place secrets or tokens in any event payload.
- A sensing-verdict event payload SHALL contain senses, confidence, and time only (per `privacy-aggregation.md`).

## Analysis

- **Total order vs causality:** lamport gives a total order sufficient for LWW; full vector clocks are unnecessary because conflicts are resolved per field with a deterministic tie-break (EV-05). This is a deliberate simplification recorded here.
- **Dedup identity:** `(deviceEpoch, lamport, type)` is unique because a device never issues two events at the same lamport (EV-07). Payload is intentionally excluded from identity so a corrected re-send with the same identity is treated as the same event.
- **Out of scope:** persistence (SQLite), sync transport, and encryption are Wave 2; this module is pure in-memory log + reducers.
