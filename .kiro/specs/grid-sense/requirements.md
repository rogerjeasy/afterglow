# Grid Sense — Requirements

**Module:** `packages/core/fusion` (and, later, the sensing adapters in `modules/sensing/**`).
**Workflow:** Design-First. The detection method ports an established research design (UC Berkeley GridWatch) and ENF forensics; the fusion rules are a fixed physical/logical contract, so requirements are written to match a known design rather than discovered from scratch.
**Spec name equals package name** per `structure.md`.

Grid Sense answers one question for the phone in the dark: **is mains power present, absent, or is it impossible to tell?** It fuses independent senses (charging edge, mains hum, light flicker, magnetometer, home telemetry) into a single auditable verdict. The verdict is deterministic; AI is never on this path (`fail-closed.md` §8).

## Glossary (this spec)

- **Sense** — one independent source of evidence about mains: `chargingEdge`, `hum`, `flicker`, `magnetometer`, `telemetry`.
- **Positive vote** — a sense claims mains is present. **Negative vote** — a sense claims mains is absent. **Unknown vote** — the sense ran but cannot tell.
- **Positive-only sense** — `flicker` and `magnetometer`; their absence proves nothing, so they may never cast a negative vote.
- **Verdict** — the discriminated union `present | absent | unknown`.
- **k** — the k-anonymity / corroboration threshold, default 5 (`privacy-aggregation.md` §1).
- **Corroboration** — a single local negative is only enough to declare absent if confirmed by home telemetry or by at least k neighbouring reports.

## Requirements

### GS-01 — The verdict is a three-value union
**User story:** As a person in the dark, I want the app to be able to say "I can't tell" so that it never lies to me about my power.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL return exactly one of `present`, `absent`, or `unknown` for every fusion.
- THE SYSTEM SHALL represent the verdict as a discriminated union, never a boolean or an optional.
- THE SYSTEM SHALL attach to every verdict the list of senses that voted positive and the list that voted negative.

*Property:* `GS-01 always returns present | absent | unknown`. *Code:* `fuse()` return type `MainsVerdict`.

### GS-02 — Fusion is pure and order-independent
**User story:** As an engineer, I want fusion to depend only on the set of votes so that the same evidence always yields the same verdict regardless of sensor timing.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL compute the verdict as a pure function of the vote set and the fusion context, with no I/O, no timers, and no randomness.
- WHEN the same votes are supplied in any order THE SYSTEM SHALL return the same verdict and the same voted-sense lists.
- WHEN duplicate identical votes are supplied THE SYSTEM SHALL return the same verdict as without the duplicates.

*Properties:* `GS-02 is order-independent under permutation`, `GS-02b is idempotent to duplicate identical votes`.

### GS-03 — Absence of evidence never upgrades a verdict
**User story:** As a person whose microphone permission is denied, I want that missing sense to simply not count, not to be read as "power is fine".

**Acceptance criteria (EARS):**
- WHEN a sense casts an `unknown` vote THE SYSTEM SHALL treat it as if the sense had not voted.
- WHERE a sense is unavailable (denied permission, no hardware) THE SYSTEM SHALL degrade the verdict honestly and SHALL NOT upgrade it.
- THE SYSTEM SHALL NOT infer `present` or `absent` from the mere absence of a contradicting sense.

*Property:* `GS-03 unknown votes never move the verdict`. *Source:* `fail-closed.md` §3.

### GS-04 — Present requires a positive sense
**User story:** As a person in the dark, I want "power is present" to mean something actually detected power, not an assumption.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL declare `present` only when at least one positive sense voted and no negative sense contradicts it.
- IF no sense cast a positive vote THEN THE SYSTEM SHALL NOT return `present`.

*Property:* `GS-04 present implies at least one positive sense voted`. *Source:* `fail-closed.md` §1.

### GS-05 — Absent requires corroboration
**User story:** As a person in the dark, I want "power is out" declared only on solid evidence so a single flaky sensor can't scare me.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL declare `absent` only when at least two distinct negative senses agree, OR one negative sense is corroborated by home telemetry reporting grid loss, OR one negative sense is corroborated by at least k neighbouring reports.
- WHERE home telemetry reports grid loss THE SYSTEM SHALL treat it as authoritative for the home and MAY declare `absent` on that alone.

*Property:* `GS-05 absent requires >=2 negatives, telemetry, or >=k neighbours`. *Source:* `fail-closed.md` §1; architecture §5.

### GS-06 — Positive-only senses can never vote absent
**User story:** As an engineer, I want flicker and magnetometer to only ever add confidence that power is on, because their silence is meaningless.

**Acceptance criteria (EARS):**
- IF a positive-only sense (`flicker`, `magnetometer`) supplies a negative vote THEN THE SYSTEM SHALL reject it with an error and SHALL NOT produce a verdict.

*Property:* `GS-06 rejects an absent vote from a positive-only sense`. *Code:* `IllegalNegativeVoteError`. *Source:* `fail-closed.md` §2.

### GS-07 — A single uncorroborated negative is never absent
**User story:** As a person whose phone briefly unplugged, I want the app to say "unknown", not "power is out", until something confirms it.

**Acceptance criteria (EARS):**
- WHILE exactly one negative sense has voted and it is not corroborated by telemetry or by at least k neighbours THE SYSTEM SHALL return `unknown`.
- WHEN a single negative sense is contradicted by home telemetry reporting mains present THE SYSTEM SHALL return `unknown`.

*Property:* `GS-07 one uncorroborated negative never declares absent`.

### GS-08 — Every verdict is explained
**User story:** As a person reading the Hearth, I want the "unknown" state to tell me why and what would resolve it.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL attach a non-empty plain-language reason to every verdict.
- THE SYSTEM SHALL design the `unknown` state as a first-class answer with a reason, not as a silent fallback.

*Property:* `GS-08 always provides a plain-language reason`. *Source:* `fail-closed.md` §10.

### GS-09 — No raw media and privacy-safe reports (future, adapter layer)
**User story:** As a person whose phone is listening for hum, I want the raw audio never to be stored or to leave the device.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL capture, process, and zero any audio, camera, or magnetometer buffer within the same call, with no persistence dependency.
- THE SYSTEM SHALL ensure a verdict record contains senses, confidence, and time only, never raw media.
- WHEN a report is emitted on a verdict change THE SYSTEM SHALL include only `{ v, deviceEpoch, geohash6, minute, verdict, confidence, senses, restoreEdge }`.

*Status:* deferred to the sensing-adapter and reporting tasks; stated here so the contract is fixed. *Source:* `privacy-aggregation.md` §3, §4; `fail-closed.md` §2.

## Analysis

- **Ambiguity resolved:** "contradiction" between a single negative and a `telemetry: present` vote resolves to `unknown`, not a tie-break — fail-closed forbids guessing to break ties (GS-07).
- **Boundary:** neighbour corroboration uses `>= k` (inclusive). k is fixed per region and is never lowered to fill a sparse map, nor made per-request configurable (`privacy-aggregation.md` §1).
- **Out of scope here:** the per-sense detectors themselves (Goertzel hum, rolling-shutter flicker) live in later tasks; this spec fixes the fusion contract they feed.
