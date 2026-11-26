# Crowd reports and the public API — Tasks

Status: `[x]` done, `[ ]` planned. Built 2026-11-26 without new tests at the founder's request; the existing suites, typecheck and lint stay green, and the deployed API was checked end to end.

- [x] Grid Sense detectors in the core: charging edge (state machine), mains hum (Goertzel at the 2nd and 3rd harmonics against the 80-200 Hz floor), report validation and cell grids (`packages/core/src/sensing`) — CR-01, CR-03
- [x] Public API service: day device keys, signed reports, k-anonymous cells, demo scope through the same aggregation, OpenStreetMap places and Open-Meteo weather behind cell-centre proxies (`services/crowd`) — CR-02..CR-06
- [x] Infrastructure: `infra/modules/public-api`, tables `reports` (2 h TTL, no backup) and `public_cache`; deployed and smoke-tested live
- [x] Places fetched in the background (asynchronous self-invocation, Lambda retries), a mirror chain ordered by measured reachability from AWS, and real shelters only (bus shelters dropped)
- [x] App: Grid Sense engine (battery, microphone on request, calibration, mains frequency, automatic outage start and end), daily signed reports with 0-120 s jitter, the live Lantern map, places with lit state, Signal Finder with compass, tonight's forecast feeding the home model, destinations
- [x] Page policies: location for our own origin only; the public API in the CSP
- [x] Push for a followed cell: `services/crowd/src/push.ts`, subscribe and unsubscribe routes, table `push_subs`, VAPID in SSM; smoke-tested live (a host outside the push services refused; five dark reports flipped a test cell and the notify run signed and sent, and a dead endpoint was deleted) — CR-12..CR-14
- [x] Fixed `cellsAround` at the poles (the clamp moved a polar cell off itself), found by the live smoke test
- [ ] Light flicker and magnetometer senses (native app)
- [ ] Attestation of device keys (Play Integrity, App Attest) in the native app
