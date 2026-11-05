# Grid Sense — Design

**Companion to:** `requirements.md` (this spec), `fail-closed.md` (invariant), `docs/afterglow-architecture.md` §5 (sensing architecture).
**Implements:** `packages/core/fusion`.

## 1. Overview

Grid Sense is split into two layers with a hard boundary between them:

1. **Deterministic fusion** (`packages/core/fusion`) — a pure function over sense votes. This is the whole of the current implementation and the subject of every GS-xx property.
2. **Sensing adapters** (`modules/sensing/**`, future) — capture audio/camera/magnetometer/telemetry, run the per-sense detectors, and produce `SenseVote`s. These sit behind adapter interfaces so fusion stays pure and testable against recorded fixtures.

AI is absent from both layers (`fail-closed.md` §8).

## 2. Data flow

```mermaid
flowchart LR
  subgraph Senses["Sensing adapters (future, impure)"]
    CE[Charging edge]
    HUM[Hum detector · Goertzel]
    FL[Flicker detector · positive only]
    MAG[Magnetometer · positive only]
    TEL[Home telemetry]
  end
  CE & HUM & FL & MAG & TEL -->|SenseVote[]| FUSE[fuse· pure]
  CTX[FusionContext · neighbourAbsentReports, k] --> FUSE
  FUSE --> R[FusionResult · verdict, votedPositive, votedNegative, reason]
```

## 3. Types (implemented)

- `SenseId = 'chargingEdge' | 'hum' | 'flicker' | 'magnetometer' | 'telemetry'`
- `SenseVote = { sense, direction: 'present'|'absent'|'unknown', confidence: 0..1 }`
- `POSITIVE_ONLY_SENSES = { flicker, magnetometer }`
- `MainsVerdict = 'present' | 'absent' | 'unknown'`
- `FusionContext = { neighbourAbsentReports: number, k: number }` (default `k = DEFAULT_K = 5`)
- `FusionResult = { verdict, votedPositive[], votedNegative[], reason }`

`confidence` is informational only; it never breaks a tie (that would be a soft guess). This is deliberate and matches fail-closed.

## 4. The fusion state machine

Evaluated in strict order; the first matching rule wins. Duplicate senses collapse into sets, which is what makes the function order-independent and idempotent.

```mermaid
stateDiagram-v2
  [*] --> Validate
  Validate --> Reject: positive-only sense voted absent  (GS-06)
  Validate --> Collect
  Collect --> TelemetryAbsent: telemetry voted absent
  TelemetryAbsent --> ABSENT: authoritative  (GS-05)
  Collect --> TwoNegatives: >= 2 distinct negatives
  TwoNegatives --> ABSENT  (GS-05)
  Collect --> OneNegative: exactly 1 negative
  OneNegative --> UNKNOWN: contradicted by telemetry-present  (GS-07)
  OneNegative --> ABSENT: corroborated by >= k neighbours  (GS-05)
  OneNegative --> UNKNOWN: positives present but negative uncorroborated  (GS-07)
  OneNegative --> UNKNOWN: no corroboration  (GS-07)
  Collect --> PRESENT: >= 1 positive, no negative  (GS-04)
  Collect --> UNKNOWN: nothing to go on  (GS-03)
```

### Rule order and rationale
1. **Reject illegal negatives** (GS-06) before anything else: a positive-only sense carrying `absent` is a programming error, so we throw rather than silently drop it.
2. **Unknown votes are discarded** during collection (GS-03): they never enter the positive or negative sets.
3. **Telemetry-absent is authoritative** (GS-05): the household's own equipment knows its own grid.
4. **Two or more negatives → absent** (GS-05).
5. **One negative** branches:
   - contradicted by telemetry-present → `unknown` (GS-07),
   - else corroborated by `>= k` neighbours → `absent` (GS-05),
   - else positives also present (genuine disagreement) → `unknown` (GS-07),
   - else uncorroborated → `unknown` (GS-07).
6. **Positives, no negatives → present** (GS-04).
7. **Otherwise → unknown** (GS-03).

## 5. Failure modes

| Condition | Behaviour |
|---|---|
| No votes at all | `unknown`, reason "No sense produced a positive or negative vote." |
| All votes `unknown` | `unknown` (GS-03) |
| Positive-only sense votes `absent` | throws `IllegalNegativeVoteError` (GS-06) |
| One negative, `neighbourAbsentReports < k`, no telemetry | `unknown` (GS-07) |
| Positives + one uncorroborated negative | `unknown` — never guess to break the tie (GS-07) |

## 6. Determinism and sorting

`votedPositive` and `votedNegative` are sorted with `localeCompare` so the result is byte-stable across runtimes (Hermes, browser, Node). This matters because the same property suite runs on all three (`tech.md`).

## 7. Correctness properties (extracted from requirements)

| Property test name | Requirement | What it proves |
|---|---|---|
| `GS-01 always returns present \| absent \| unknown` | GS-01 | verdict domain |
| `GS-02 is order-independent under permutation` | GS-02 | order independence |
| `GS-02b is idempotent to duplicate identical votes` | GS-02 | idempotence |
| `GS-03 unknown votes never move the verdict` | GS-03 | no upgrade on missing data |
| `GS-04 present implies at least one positive sense voted` | GS-04 | present ⇒ positive |
| `GS-05 absent requires >=2 negatives, telemetry, or >=k neighbours` | GS-05 | absent corroboration |
| `GS-06 rejects an absent vote from a positive-only sense` | GS-06 | positive-only guard |
| `GS-07 one uncorroborated negative never declares absent` | GS-07 | fail-closed on lone negative |
| `GS-08 always provides a plain-language reason` | GS-08 | unknown is designed |

All nine pass today (`pnpm --filter @afterglow/core test`). When any shrinks in future, the counterexample is recorded in `docs/kiro/pbt-catches.md` the same day (`tech.md`).

## 8. Boundaries and future work

- **Adapters** (`modules/sensing/**`): Goertzel hum detector, rolling-shutter flicker detector, magnetometer aliasing guard, charging-edge debounce (≥10 min stationary-and-plugged), telemetry clients. Each produces `SenseVote`s and is tested against recorded fixtures; none persists a capture buffer (GS-09).
- **Reporting**: on a verdict *change*, emit the ≤200-byte report with 0–120 s jitter (GS-09; Ember Map spec owns aggregation).
- **Calibration**: per-device hum thresholds from onboarding; stored locally, never in a report.
