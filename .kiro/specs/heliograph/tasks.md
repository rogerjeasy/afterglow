# Heliograph — Tasks

Status: `[x]` done, `[ ]` planned.

## Wave 1.8 — Core (pure)
- [x] 1. Message set and ranges (`codes.ts`) — _HL-01_
- [x] 2. Hamming(12,8), CRC-4 and bit helpers (`fec.ts`) — _HL-03, HL-04_
- [x] 3. Frame encode and decode: preamble, two coded bytes, CRC, reserved-code refusal (`frame.ts`) — _HL-01..HL-04_
- [x] 4. Manchester coding (`manchester.ts`) — _HL-05_
- [x] 5. Transmit plan (`transmit.ts`) — _HL-06_
- [x] 6. Receiver: binarise, per-window clock recovery, symbol sampling, preamble search, two-repeat acceptance and three-repeat vote (`receive.ts`) — _HL-07..HL-11_
- [x] 7. Property tests HL-01..HL-11 over a recording simulator (40 tests; also run at 10x and, for HL-09, at 50x) — `heliograph.property.test.ts`
- [x] 8. Mutation check: sixteen deliberate regressions each failed a test; two survivors (repeat spacing, profile conflict) each led to a new test
- [x] 8a. Profiles and a 6-bit slot (decided: HL-12, spec Analysis)
- [x] 9. Four defects found and fixed, recorded in `docs/kiro/pbt-catches.md`

## Planned (not in this slice)
- [x] 10. Screen-lamp sender on an absolute schedule (`packages/adapters/src/heliograph/sender.ts`, HL-14) and its lamp UI with one-tap stop and flashing warnings (HL-17). Still to do: the phone torch (native module, Wave 3)
- [x] 11. Web camera adapter (`getUserMedia`, 8 x 6 grid, numbers only; HL-16), tracker (`trackSeries`, HL-13) and rolling reader (HL-15), verified against a real Chromium fake-camera video. Still to do: VisionCamera on native
- [ ] 12. Recorded fixtures at 5 to 40 m (needs a device and a dark room) to confirm the simulator's noise model
- [x] 13. Fast profile (10 symbols per second, 6.4 s per frame) chosen by measured camera speed (HL-12). Still to measure on real phones: rolling-shutter and exposure behaviour at 40 to 60 fps, which decides whether the 40 fps limit should move
- [x] 14. Séance screen: ghost board, add people, send with the screen lamp, watch with the camera, every state designed (`apps/mobile/src/screens/Seance.tsx`); the animated ghost solidify is night-shell NS-23. Still to do: haptics, Hearth "I'm safe" one-tap, BLE and sound channels
- [x] 15. Architecture section 6, design section 11.5 and the product spec corrected for frame timing, profiles and the 6-bit slot

## Séance slice (this commit group)
- [x] 16. Roster and ghost board in `household` (HH-11..HH-13): people with a slot, latest word, ghosts, attribution that refuses unknown and shared numbers
- [x] 17. Photosensitivity: standard by default, fast only after confirmation, warning before every send, one-tap stop (HL-17)
- [x] 18. Browser tests: board, add, send, fast confirmation, HELP note, lamp pixels in three modes, camera denied and absent, and three real fake-camera streams (read a message, ignore a steady lamp, refuse to name an unknown number)
- [x] 9. Overlap rule in `accept`: a frame that overlaps a better supported frame lattice is dropped (a false frame spelled across a repeat boundary). Exhaustive test over all 2,816 messages, a corner test, and an HL-09 damaged-repeat test; mutation-checked against the old receiver. See `docs/kiro/pbt-catches.md`, 2026-11-25
