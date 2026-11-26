# Device features — Tasks

Built 2026-11-26 without new tests at the founder's request; existing suites, typecheck, lint and the 135 browser tests stay green. The acoustic path was checked offline by decoding synthesised noisy transmissions (all four tone and speed settings decoded, three repeats agreeing).

- [x] `light/LightMode.tsx`: red levels, beacon, white escape with readaptation clock, SOS, wake lock — DF-01..DF-05
- [x] `eyesfree/eyesfree.ts`, `voice.ts`, `EyesFreeUI.tsx`: prefs, speech, haptic grammar, push-to-talk commands; announcements wired in `App.tsx`; settings on You — DF-06..DF-10
- [x] `packages/core/src/heliograph/acoustic.ts` (tone level), `seance/acoustic.ts` (speaker and microphone), Séance send-by-sound and listen — DF-11..DF-13
- [x] `seance/pairing.ts`, `seance/PairSection.tsx`: show, scan, invite, confirm; checked in the browser (the red QR decodes to the exact link) — DF-14..DF-17
- [ ] Native: torch control for the light and the Heliograph; background haptics
