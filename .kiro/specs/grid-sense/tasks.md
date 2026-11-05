# Grid Sense — Tasks

Tasks map to requirement ids. Property-test tasks are enabled for every core module (`tech.md`: properties are the definition of done). Status: `[x]` done, `[ ]` planned.

## Wave 1 — Fusion core (done)

- [x] 1. Define fusion types (`SenseId`, `SenseVote`, `MainsVerdict`, `FusionContext`, `FusionResult`, `POSITIVE_ONLY_SENSES`, `DEFAULT_K`)
  - _Requirements: GS-01, GS-02, GS-05, GS-06_
  - _File: `packages/core/src/fusion/types.ts`_

- [x] 2. Implement the pure `fuse()` state machine with the strict rule order
  - [x] 2.1 Reject illegal negatives from positive-only senses (`IllegalNegativeVoteError`)
    - _Requirements: GS-06_
  - [x] 2.2 Collect distinct positive/negative sets, discarding `unknown` votes
    - _Requirements: GS-03_
  - [x] 2.3 Telemetry-absent authoritative; two-negatives; single-negative corroboration branches
    - _Requirements: GS-05, GS-07_
  - [x] 2.4 Present on positives-without-contradiction; unknown otherwise, each with a reason
    - _Requirements: GS-04, GS-08_
  - _File: `packages/core/src/fusion/fuse.ts`_

- [x] 3. Export the module surface (`index.ts`, package `exports`)
  - _File: `packages/core/src/fusion/index.ts`, `packages/core/src/index.ts`_

- [x] 4. Property tests GS-01..GS-08 (fast-check)
  - _Requirements: GS-01, GS-02, GS-03, GS-04, GS-05, GS-06, GS-07, GS-08_
  - _File: `packages/core/src/fusion/fuse.property.test.ts`_

- [x] 5. Example tests for the spec's concrete scenarios (hum-present, lone-edge-unknown, two-negatives-absent, telemetry authoritative, silence)
  - _Requirements: GS-01, GS-04, GS-05, GS-07_
  - _File: `packages/core/src/fusion/fuse.test.ts`_

## Wave 2 — Sensing adapters (planned)

- [ ] 6. Adapter interfaces for the five senses (pure contract in `packages/adapters`, impl in `modules/sensing`)
  - _Requirements: GS-03, GS-09_

- [ ] 7. Hum detector: Goertzel bank at 2nd/3rd harmonics, noise-floor comparison, per-device calibration; tested on recorded 50/60 Hz fixtures (quiet, noisy, generator-adjacent)
  - _Requirements: GS-04, GS-09_

- [ ] 8. Flicker detector: rolling-shutter banding, positive-only; tested on LED/fluorescent/incandescent/DC fixtures
  - _Requirements: GS-04, GS-06_

- [ ] 9. Charging-edge detector: debounced transition (≥10 min stationary-and-plugged), restore edge
  - _Requirements: GS-05_

- [ ] 10. Magnetometer sense: 50/60 Hz field, aliasing-aware, positive-only
  - _Requirements: GS-06_

- [ ] 11. Home-telemetry client contract: grid-loss event → authoritative `telemetry` vote
  - _Requirements: GS-05_

- [ ] 12. Verdict record + privacy-safe report emission (≤200 bytes, verdict-change only, 0–120 s jitter); property: no raw media, report field whitelist
  - _Requirements: GS-09_

## Notes

- Wave 2 requires the Expo app and native modules; it is not blocked on anything in Wave 1 except the stable `SenseVote` contract, which is frozen.
- The `agent-stop-gate` and `sensing-fixtures-on-save` hooks (architecture §15.6) guard Wave 2 once created.
