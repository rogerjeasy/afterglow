# Heliograph — Tasks

Status: `[x]` done, `[ ]` planned.

## Wave 1.8 — Core (pure)
- [x] 1. Message set and ranges (`codes.ts`) — _HL-01_
- [x] 2. Hamming(12,8), CRC-4 and bit helpers (`fec.ts`) — _HL-03, HL-04_
- [x] 3. Frame encode and decode: preamble, two coded bytes, CRC, reserved-code refusal (`frame.ts`) — _HL-01..HL-04_
- [x] 4. Manchester coding (`manchester.ts`) — _HL-05_
- [x] 5. Transmit plan (`transmit.ts`) — _HL-06_
- [x] 6. Receiver: binarise, per-window clock recovery, symbol sampling, preamble search, two-repeat acceptance and three-repeat vote (`receive.ts`) — _HL-07..HL-11_
- [x] 7. Property tests HL-01..HL-11 over a recording simulator (31 tests; also run at 10x and, for HL-09, at 50x) — `heliograph.property.test.ts`
- [x] 8. Mutation check: nine deliberate regressions each failed a test; one survivor (repeat spacing) led to a new test
- [x] 9. Four defects found and fixed, recorded in `docs/kiro/pbt-catches.md`

## Planned (not in this slice)
- [ ] 10. Torch and screen sender adapter that follows `planTransmission` on a monotonic clock (native module, Wave 3)
- [ ] 11. Camera adapter and blob tracker producing `BrightnessSample`s (VisionCamera on native, `getUserMedia` on web)
- [ ] 12. Recorded fixtures at 5 to 40 m (needs a device and a dark room) to confirm the simulator's noise model
- [ ] 13. Revisit the symbol rate (10 per second halves the 12.8 s frame) once rolling-shutter behaviour is measured on real phones
- [ ] 14. Séance screen: send and receive, ghost solidify, "repeat requested" state (design 11.5)
- [ ] 15. Correct the 6.4 s frame figure in `afterglow-architecture.md` section 6 and the "20 s" hint in `afterglow-design.md` section 11.5
