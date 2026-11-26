# Alerts — Requirements

**Module:** `packages/core/src/alerts` (pure; no I/O, no timers). The Alerts centre in `apps/mobile` presents it.
**Workflow:** Requirements-First. Implementation plan item 1.10.
**Spec name equals package name** per `structure.md`.

Every module already knows when something needs a person's attention: the fridge's window is closing, the home is about to cross its line, someone sent HELP, the cell is coming back. Alerts gathers those into one list a person can glance at in the dark. It decides nothing new: every alert is a module's own verdict, quoted with its source and its number. Several channels (light, sound, text, a neighbour) can report the same thing, so alerts are deduplicated by what they are about, not by how they arrived.

## Glossary

- **Alert**: a record of one condition that needs attention: a kind, a priority, a subject, the time the condition began, an optional number of minutes from the core, and at least one source.
- **Key**: the alert's identity for deduplication: its kind, its subject and the outage it belongs to. Two reports of the same condition share a key.
- **Priority**: `critical` (act now: HELP, food past its window, a home at its line), `high` (act soon: a window closing within 30 minutes, a home within 2 hours of its line, an outage) or `normal` (good to know: power coming back).

## Requirements

### AL-01 — Every alert names its source
**User story:** As a person woken by an alert, I want to know who says so.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL give every alert at least one non-empty source, with the model version where a model produced its number.

*Property:* `AL-01 every alert cites at least one source`. *Source:* `fail-closed.md` rule 9.

### AL-02 — The same condition is one alert, however many channels report it
**User story:** As a person whose neighbour flashed HELP and also sent a text, I want one alert, not two.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL merge alerts that share a key into one.
- THE SYSTEM SHALL make the merge idempotent and independent of the order the reports arrive in.
- WHEN merged alerts disagree THE SYSTEM SHALL keep the earliest start time and the union of their sources, in a fixed order.

*Property:* `AL-02 merging is idempotent, order-independent and leaves one alert per key`.

### AL-03 — Alerts only during an outage, except a cry for help
**User story:** As a person with the power on, I want silence.

**Acceptance criteria (EARS):**
- WHILE no outage is under way THE SYSTEM SHALL raise no alert except HELP.
- WHEN a roster member's latest word since the outage began (or ever, with no outage) is HELP THE SYSTEM SHALL raise a `critical` HELP alert naming them.

*Property:* `AL-03 with the power on, the only alerts are HELP`.

### AL-04 — Food alerts quote the clock, and an unknown clock raises none
**User story:** As a person deciding about the fridge, I want the alert to say what the Cold screen says.

**Acceptance criteria (EARS):**
- WHEN a compartment's remaining window is more than 0 and at most 30 minutes THE SYSTEM SHALL raise a `high` alert carrying exactly the core's remaining minutes.
- WHEN a compartment is past its window THE SYSTEM SHALL raise a `critical` alert.
- IF a compartment's headline is unknown THEN THE SYSTEM SHALL raise no timed alert for it.

*Property:* `AL-04 food alerts carry the core's own minutes and never come from an unknown clock`. *Source:* `fail-closed.md` rules 5 and 10.

### AL-05 — Home alerts use the early edge of the band
**User story:** As a person caring for someone frail, I want the warning early, not on the average.

**Acceptance criteria (EARS):**
- WHEN the earliest edge of the hours-of-safety band is more than 0 and at most 120 minutes away THE SYSTEM SHALL raise a `high` alert carrying that earliest edge.
- WHEN the earliest edge has been reached THE SYSTEM SHALL raise a `critical` alert that says the home may already be at its line.
- IF hours of safety is unknown or not reached THEN THE SYSTEM SHALL raise no home alert.

*Property:* `AL-05 home alerts carry the band's earliest edge and never come from an unknown or unreached band`.

### AL-06 — Coming back comes from the crowd
**Acceptance criteria (EARS):**
- WHEN the user's cell is `comingBack` THE SYSTEM SHALL raise a `normal` alert whose sources name the crowd and its device count.
- THE SYSTEM SHALL NOT raise it for any other cell state.

*Property:* `AL-06 coming back only from a comingBack cell`.

### AL-07 — Order is fixed
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL order alerts by priority (critical, high, normal), then by start time (earliest first), then by key.

*Property:* `AL-07 alerts are ordered by priority, then time, then key`.

### AL-08 — Evaluation is pure and total
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL return the same alerts for the same inputs, and SHALL NOT throw for any household the reducer can build.

*Property:* `AL-08 evaluation is deterministic and total over generated households`.

## Out of scope here

Delivery (push, SMS, IVR) is the alerting service (plan 6.7) and a human-gated send (`deny-dialers`). Medicine alerts wait for a pharmacist-approved table: with none loaded there are no medicine clocks to alert on. The carbon-monoxide ward is not an alert source because its symptom question is never stored; it stays on the Plan tab where it is asked.
