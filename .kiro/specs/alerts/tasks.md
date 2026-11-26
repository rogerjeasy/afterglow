# Alerts — Tasks

Tasks map to requirement ids. Property tests are the definition of done (`tech.md`). Status: `[x]` done, `[ ]` planned.

- [x] 1. Types, thresholds and the merge (`packages/core/src/alerts/types.ts`, `merge.ts`)
  - _Requirements: AL-02, AL-07_
- [x] 2. Rule evaluation over the household view and the user's cell (`evaluate.ts`)
  - _Requirements: AL-01, AL-03, AL-04, AL-05, AL-06, AL-08_
- [x] 3. Property tests AL-01 .. AL-08 (`alerts.property.test.ts`)
- [x] 4. Alerts centre in the app: a header button with the count, the list in plain words with "How I know", and every state (none, power on, outage)
- [x] 5. Browser test: the demo night raises the expected alerts, HELP by light appears at the top, and the centre passes the pixel scan

## Results

- 10 properties in `packages/core/src/alerts/alerts.property.test.ts` (AL-01..AL-08, plus a guard that the generators reach every alert kind, so no property passes vacuously).
- 3 presenter tests (`apps/mobile/src/alerts/present.test.ts`) and 3 browser tests (`e2e/alerts.e2e.ts`): the fridge alert reads the same minutes as the Hearth's tombstone; the most urgent alert leads; the power-on state is quiet. The centre is in the pixel scan in all three modes and in the NS-14 identifier scan.
