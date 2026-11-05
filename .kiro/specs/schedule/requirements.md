# Schedule — Requirements

**Module:** `packages/core/schedule`.
**Workflow:** Design-First (merge algebra and adherence are fixed designs).
**Spec name equals package name** per `structure.md`.

The Schedule module merges official load-shedding / outage schedules from many providers into one coherent timeline per area, and scores each utility's adherence (what it promised versus what the crowd and reality observed). The merge is deterministic, idempotent, and commutative so client and server agree, and so re-fetching a feed never changes the result. This module is pure; provider adapters (`fetch`/`normalise`/`health`) live in Wave 4 and feed normalised windows into here.

## Glossary (this spec)

- **Window** — a promised outage interval `{ areaId, startMinute, endMinute, source, stage?, fetchedAt }` in absolute minutes since an epoch.
- **Area** — a utility-defined zone (e.g. an Eskom block, a YASNO queue).
- **Source** — the provider id a window came from (e.g. `eskomsepush`, `yasno`, `manual`).
- **Merge** — combining windows from all sources for an area into a canonical, overlap-resolved timeline.
- **Observed interval** — what actually happened, derived from crowd cell states (dark periods) for the area.
- **Adherence** — a score comparing promised windows against observed intervals.

## Requirements

### SC-01 — Merge is deterministic, idempotent, and commutative
**User story:** As an engineer, I want merging the same windows in any order, or twice, to always yield the same timeline, so every replica and every re-fetch agree.

**Acceptance criteria (EARS):**
- WHEN the same set of windows is merged in any order THE SYSTEM SHALL produce the same merged timeline.
- WHEN a window is supplied more than once THE SYSTEM SHALL produce the same timeline as if supplied once (idempotent).
- THE SYSTEM SHALL produce a timeline sorted by `startMinute` ascending with a deterministic tie-break.

### SC-02 — Overlapping windows from the same source coalesce
**User story:** As a reader, I want contiguous or overlapping promised windows shown as one interval, not a jagged pile.

**Acceptance criteria (EARS):**
- WHERE two windows for the same area and source overlap or are contiguous (touching minute boundaries) THE SYSTEM SHALL coalesce them into one window spanning the union.
- THE SYSTEM SHALL preserve the earliest `fetchedAt` provenance when coalescing, and SHALL retain the stage if all coalesced windows share it, otherwise drop the stage.

### SC-03 — Windows from different sources are kept distinct but aligned
**User story:** As a reader, I want to see "ESP says 22:30, crowd says 22:50" — different sources side by side, not silently merged into one.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL keep windows from different sources as separate entries in the merged result, each tagged with its source.
- THE SYSTEM SHALL NOT average, interpolate, or invent a window that no source reported.

### SC-04 — Invalid windows are rejected
**User story:** As an engineer, I want malformed schedule data rejected rather than silently distorting the timeline.

**Acceptance criteria (EARS):**
- IF a window has `endMinute <= startMinute`, a non-integer minute, or an empty `areaId`/`source` THEN THE SYSTEM SHALL reject it.
- THE SYSTEM SHALL fail closed: a rejected window never appears in the merged timeline.

### SC-05 — Adherence compares promised to observed without exceeding reality
**User story:** As a Beacon user, I want an honest adherence score, never flattering the utility by assuming outages that did not happen.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL compute adherence as the overlap between promised windows and observed outage intervals, over the total promised duration.
- THE SYSTEM SHALL return adherence in `[0, 1]`.
- WHERE nothing was promised THE SYSTEM SHALL return an `unknown` adherence rather than a number.

### SC-06 — Adherence is monotone in observed overlap
**User story:** As an engineer, I want more observed overlap to never lower the adherence score, so the metric is sensible.

**Acceptance criteria (EARS):**
- WHEN observed intervals are extended so that promised-overlap does not decrease THE SYSTEM SHALL return an adherence greater than or equal to the previous score.

### SC-07 — Next-window query is correct and fail-closed
**User story:** As a user on the Hearth, I want "next window 22:00–00:30" to be the true next promised interval, or an honest "none known".

**Acceptance criteria (EARS):**
- WHEN asked for the next window after a given minute THE SYSTEM SHALL return the earliest merged window whose `startMinute` is greater than or equal to that minute.
- IF no such window exists THEN THE SYSTEM SHALL return `none`, never a guess.

## Analysis

- **Coalesce vs keep-distinct:** SC-02 coalesces within a source; SC-03 keeps sources distinct. The canonical rule: merge groups by `(areaId, source)`, coalesces within each group, then concatenates groups into one sorted timeline tagged by source.
- **Contiguity:** windows touching at a boundary (`a.end === b.start`) are treated as contiguous and coalesced (SC-02), since outage intervals are half-open `[start, end)`.
- **Adherence denominator:** total promised duration after coalescing within the utility's own windows, so overlapping promises are not double-counted (SC-05).
- **Observed intervals** are supplied by the caller (derived from `cells` dark periods); this module does not fetch them.
- **Out of scope:** provider adapters and feed parsing (Wave 4); restoration forecasting (separate service).
