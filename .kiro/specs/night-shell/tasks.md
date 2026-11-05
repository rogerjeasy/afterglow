# Night Shell — Tasks

Tasks map to requirement ids. Property tests are the definition of done (`tech.md`). Status: `[x]` done, `[ ]` planned.

## Wave 1 — Token system and luminance guards (done)

- [x] 1. Author `theme.night.json` — base ramp, amber ramp, text ceilings, semantic-by-mode map (values from design §4)
  - _Requirements: NS-01, NS-02, NS-03, NS-04, NS-05_
  - _File: `packages/design-system/theme.night.json`_

- [x] 2. Luminance helpers: `parseHex`, `relativeLuminance`, `contrastOnBlack`, `isRedDominant`
  - _Requirements: NS-02, NS-06, NS-07, NS-08_
  - _File: `packages/design-system/src/luminance.ts`_

- [x] 3. Typed token loader: `ramp`, `MODES`, `textCeiling`, `TEXT_TOKENS`, `resolveToken`, `semanticTokenNames`
  - _Requirements: NS-03, NS-05_
  - _File: `packages/design-system/src/tokens.ts`_

- [x] 4. Property tests NS-01..NS-08 + token-shape guard
  - _Requirements: NS-01 .. NS-08_
  - _File: `packages/design-system/src/luminance.property.test.ts`_

## Wave 2 — Components and pixel scan (planned)

- [ ] 5. Primitive components consuming semantic tokens only (`Button`, `Tile`, `StatusLine`, `SourceChip`, `ModeSwitch`, `UnknownState`)
  - _Requirements: NS-05, NS-09_

- [ ] 6. Costume components (`Tombstone`, `Candle`, `GhostRow`) — each encodes a measurement
  - _Requirements: NS-09_

- [ ] 7. Type scale + motion tokens (transform/opacity only; ambient flame ≤6%; tabs never slide)
  - _Requirements: NS-09_

- [ ] 8. Biome/lint rule forbidding raw hex outside `theme.night.json`
  - _Requirements: NS-05_

- [ ] 9. Playwright pixel scan of every route in every mode; fail on any pixel above the mode ceiling
  - _Requirements: NS-03, NS-04_

- [ ] 10. Mode selection (ambient-light driven, manual pin, Lights-Out always Night)
  - _Requirements: NS-03_

## Notes

- Wave 2 requires the Expo app shell.
- The `luminance-on-token-save` hook (architecture §15.6) guards `theme.night.json` once created; the pixel-scan runs in the `post-task-verify` hook.
- Once `theme.night.json` is the live source, add a `#[[file:...]]` reference to it in `night-vision.md` so steering reads the real table (the steering file already flags this).
