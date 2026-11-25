---
name: ears-authoring
description: Write or tighten Afterglow requirements in EARS form (WHEN, IF-THEN, WHILE, WHERE, SHALL) with ids that carry into property test names. Use when adding or changing behaviour, before any design or code.
---
# EARS authoring

Requirements are the human's intent. Every behaviour change starts here, and the id travels: requirement, then property test name, then task.

## The forms
- **Ubiquitous:** THE SYSTEM SHALL …
- **Event:** WHEN <event> THE SYSTEM SHALL …
- **State:** WHILE <state> THE SYSTEM SHALL …
- **Option:** WHERE <feature is present> THE SYSTEM SHALL …
- **Unwanted:** IF <condition> THEN THE SYSTEM SHALL …

## Afterglow rules
1. Give each requirement an id in its module's prefix and number (`CE-09`, `RS-03`, `HH-17`). Read the spec first and continue its numbering; never reuse an id.
2. Write universal statements, not examples: "for any ordering of the reports, the same state". A universal statement becomes a property; an example becomes one test.
3. Every function that can be unsure gets an `IF … THEN … unknown` requirement. Unknown is a first-class output.
4. Say what the system must **refuse**, not only what it does ("SHALL NOT make k configurable per request").
5. One requirement, one idea. If you wrote "and", check it is not two.
6. Add an **Analysis** section for trade-offs, open questions (give them an id like Q1) and what is out of scope. Do not bury a conflict between two rules: name it.
7. Check against the invariants: fail-closed, privacy-aggregation, night-vision, label-only-medicine.

## Output
Append to `.kiro/specs/<module>/requirements.md` and add the task to `tasks.md` with a `_Requirements:_` line. See `references/example.md`.
