# Guide (Wisp and the One Night tour) — Tasks

Tasks map to requirement ids. Property tests are the definition of done (`tech.md`). Status: `[x]` done, `[ ]` planned.

- [x] 1. Pure tour state machine, power reconcile and progress opacity
  - _Requirements: GD-03, GD-04, GD-05, GD-07_
  - _File: `apps/mobile/src/guide/tour.ts`_

- [x] 2. The script and the line renderer (slots, fallbacks, the 200-character limit)
  - _Requirements: GD-01, GD-06, GD-08_
  - _Files: `apps/mobile/src/guide/script.ts`, `render.ts`_

- [x] 3. Facts read from the existing presenters and core values, absent when not computable
  - _Requirements: GD-01_
  - _File: `apps/mobile/src/guide/facts.ts`_

- [x] 4. Property tests GD-01 .. GD-08, including the static import scan for GD-02
  - _File: `apps/mobile/src/guide/guide.property.test.ts`_

- [x] 5. `Wisp` component: ghost, bubble, highlight, reduced motion, Escape to skip
  - _Requirements: GD-07, GD-09, GD-10_
  - _File: `apps/mobile/src/guide/Wisp.tsx`, `night-shell/night-shell.css`_

- [x] 6. Shell wiring: tour state in `App.tsx`, `data-tour` targets on the screens, the three entry points and `?tour=1`
  - _Requirements: GD-03, GD-06, GD-11_

- [x] 7. Browser tests: the full walk at 390 and 320 px, keyboard and Escape, deep link and replay
  - _Requirements: GD-06, GD-08, GD-10, GD-11_
  - _File: `apps/mobile/e2e/tour.e2e.ts`_

- [x] 8. Pixel scan of the tour in Night, Dusk and Ember
  - _Requirements: GD-09_
  - _File: `apps/mobile/e2e/tour.e2e.ts` (the same `scanRgba` judge as `pixel-scan.e2e.ts`)_

- [x] 9. Design doc §14.1 addendum (Wisp's voice and its fence) and the implementation plan

## Results

- 10 pure tests in `src/guide/guide.property.test.ts` (GD-01 to GD-08, including an end-to-end check that the real demo night fills every slot from the core, and that outside the demo there are no crowd facts).
- 8 browser tests in `e2e/tour.e2e.ts`: the full walk, 320 px, keyboard and Escape, the three entry points and replay, the real household untouched, and the pixel scan in all three modes.
- Two catches recorded in `docs/kiro/pbt-catches.md`: the GD-01 oracle read a fact as a replacement pattern (test bug), and Wisp's fade blended one step above the night-vision ceiling (implementation bug, found by the GD-09 scan).
