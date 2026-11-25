# CO Guard (the Ward) — Requirements

**Module:** `packages/core/src/coguard` (pure; no I/O).
**Workflow:** Requirements-First. The rules are public safety guidance, cited below.
**Spec name equals package name** per `structure.md`.

The ward refuses to mark a generator "set up" until every condition is confirmed. It is a refused unsafe action: a bar stays closed across the card, and the "Set up" button is behind it. Carbon monoxide has no smell and no colour, so the ward never says a setup is safe. It says the conditions are met, or what is missing.

## Sources (checked 2026-11-23)
- CDC, "Preventing Carbon Monoxide Poisoning After an Emergency": never use a generator inside a home, basement or garage, or less than 20 feet from any window, door or vent. (cdc.gov)
- CDC, "Carbon Monoxide Poisoning Basics": the most common symptoms are headache, dizziness, weakness, upset stomach, vomiting, chest pain and confusion. (cdc.gov/carbon-monoxide)
- US CPSC, "Carbon Monoxide Information Center": use generators outside only, at least 20 feet from the home, with the exhaust facing away; never inside a home or garage even with doors and windows open. (cpsc.gov)
- US CPSC, "What to Know: Generators": if CO poisoning is suspected, get outside immediately, then call the emergency number. (cpsc.gov)
- 20 feet is 6.096 m. The product spec says "at least 6 m"; this module uses the source figure, 20 feet (6.1 m), which is the stricter one.

## Glossary
- **Check** — one condition: `outdoors`, `distance`, `exhaust`, `alarm`.
- **Answer** — `yes`, `no` or `unknown`. A missing answer is `unknown`.
- **Ward** — `closed` (at least one check is not a current yes) or `open` (all are).

## Requirements

### CO-01 — The ward opens only when every check is a current yes
- THE SYSTEM SHALL report the ward `open` only when `outdoors`, `distance`, `exhaust` and `alarm` are each answered yes within the last 6 hours.
- THE SYSTEM SHALL treat a missing, unknown, no, malformed or older answer as unmet and list it.
- THE SYSTEM SHALL NOT report `open` for an empty set of answers.

### CO-02 — A "no" on a hard rule is a refusal, not a to-do
- IF `outdoors` or `distance` is answered no THEN THE SYSTEM SHALL report the generator must not run there, with the rule and its source, rather than only "not yet".

### CO-03 — Answers go stale
- THE SYSTEM SHALL ignore an answer older than 6 hours (a generator is moved and refuelled), and an answer dated in the future.

### CO-04 — Symptoms mean leave now
- WHEN any CO symptom is reported THE SYSTEM SHALL say to get into fresh air immediately and then call the emergency number, whatever the checklist says.
- WHEN no symptom is reported THE SYSTEM SHALL NOT say the air is fine, and SHALL say that CO cannot be seen or smelled and that only a working alarm warns.

### CO-05 — The ward never says safe, and every rule is cited
- THE SYSTEM SHALL NOT use the word "safe" in any sentence it generates, and SHALL attach the source to every check.

### CO-06 — Deterministic and total
- THE SYSTEM SHALL return the same result for the same answers and time, and SHALL NOT throw for any input.

## Analysis
- **Heaters are out of scope.** The product spec also mentions gas and paraffin heaters. The sources checked here cover generators. Heater rules are not invented; they are added when a source is checked.
- **Six hours** is an Afterglow rule, not a cited figure. It exists so a setup confirmed last night does not authorise today's. It is labelled as such on the screen.
- **This is not an alarm.** The ward cannot detect CO. It only refuses to bless a setup it has not been told is right, and it states plainly that a working CO alarm is the real protection.
