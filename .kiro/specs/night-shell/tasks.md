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

## Pixel scan (NS-10..NS-12)
- [x] Pure scanner `scanRgba` / `judgePixel` in `packages/design-system/src/pixelScan.ts`, property-tested (NS-10..NS-12)
- [x] Playwright harness `apps/mobile/e2e/pixel-scan.e2e.ts`: Hearth, Cold and You, power on and in an outage, plus a seeded medicine with no table, in Night, Dusk and Ember; includes a probe that proves the scan detects a bright pixel and a non-red pixel. `pnpm e2e` in `apps/mobile`.
- [x] CI job `pixel-scan` in `.github/workflows/ci.yml` (written; not yet run on GitHub)
- [x] Plan added (power on, demo outage, and a populated plan with a partly covered load, a refused ward check and a symptom alert, in all three modes)
- [x] Séance added (power on, demo outage, and the lit and dark lamp itself in all three modes)
- [ ] Add screens as they are built (medicines with a loaded table needs a signed fixture served to the browser; Lantern, Plan)
- [ ] Dynamic Type 200% and 320 px width variants

## Design pass (NS-13..NS-17)
- [x] `Sources` control and its pure summary (`night-shell/sources.ts`), property-tested (NS-13)
- [x] `Tile`, Cold verdict rows and the appliance detail use `Sources` (NS-13)
- [x] Plain sense words for the Hearth, replacing the fusion read-out (NS-14)
- [x] Hearth compartments as tombstones; roster ghosts as ghost glyphs, 0.35 until heard (NS-16)
- [x] Fold the Plan add-forms, the Séance add-form and list editing, and Cold item management (NS-15)
- [x] Remove the guide's bob (NS-17)
- [x] Browser tests: NS-14 identifiers, NS-15 height budgets, NS-16 costume, NS-17 animations; update tests that open folds
- Results: 3 pure tests (`src/night-shell/designPass.property.test.ts`) and 6 browser tests (`e2e/design-pass.e2e.ts`). NS-14 found a model id (`foodkeeper-v128`) in Cold's explanatory paragraph, now behind its source control. Four older browser tests asserted visible source labels; they now open the control and check the same labels, and that the closed control still names a default.

## Amber variant (NS-18..NS-22)
- [x] `theme.night.json`: amber ramp keyed by the luminance tier it matches (`amber.000` .. `amber.950`) and an `amberFor` map from every red step; `amber.700` and `amber.800` set one red unit under the old `#784300` / `#864B00`, which sat just over the Night and Dusk ceilings (NS-18, NS-19)
- [x] `tokens.ts`: `Hue`, `HUES`, `amberFor`, `ceilingHex`, and `resolveToken(mode, token, hue)` (NS-18)
- [x] Property tests NS-18..NS-21 in `packages/design-system/src/amber.property.test.ts`
- [x] `pixelScan.ts`: `scanRgba(..., hue)` and `judgePixel(..., hue)`; amber is judged by relative luminance against the same ceilings and by an amber-family hue rule (NS-21)
- [x] App: the hue is remembered in `afterglow.hue.v1`, read when `night-shell/theme.ts` loads so `main.tsx` paints it before the first render, and `applyMode` sets the tokens and `<html data-hue>`; components are unchanged (NS-22)
- [x] "Colour" setting on You (`night-shell/HueSettings.tsx`); the light's labels follow the colour; one line on the Science page says where to switch (NS-22)
- [x] Browser tests: every pixel-scan route in amber in all three modes, an amber probe, and the persistence and first-frame test `e2e/hue.e2e.ts` (NS-21, NS-22)
- [x] Design doc 3.4 and 4.3 updated with the corrected amber values

## The ghost turns solid (NS-23)
- [x] `GhostGlyph` (`apps/mobile/src/night-shell/costume.tsx`) remembers whether it was solid and, on the change from faint to solid, renders the rise, the fill fade and one ripple for 900 ms, then the still glyph (NS-23)
- [x] `.ghost-materialise`, `.ghost-fill-in` and `.ghost-ripple` in `apps/mobile/src/styles/tailwind.css`, with the reduced-motion rule: fade only (NS-23)
- [x] Used wherever a ghost is drawn: the Séance board, the Hearth people tile and Wisp
- [ ] Haptic pairing on the solidify frame (needs the native shell; the web has no reliable haptics)
