---
inclusion: always
---

# Invariant: privacy by construction and k-anonymous aggregation

Design so that the data regulators worry about is never created. Raw media never leaves RAM, location leaves the device only as a cell, and a cell is published only when enough distinct devices stand behind it.

Sources: `docs/afterglow-project-description.md` sections 7.3 and 12 (loaded via `product.md`) and `docs/afterglow-architecture.md` sections 5, 8.3, 10.3, 10.4, 11 and ADR-008 (loaded via `tech.md`).

## Rules
1. **k ≥ 5.** A cell is published only when at least 5 distinct devices reported in the last 30 minutes. `CellState` is never written with `deviceCount < 5` unless `state = unknown`. Enforce it in the Flink job and re-check it at the API. Never lower k to fill a sparse map, and never make k configurable per request.
2. **Location is geohash-6 only.** No coordinates, no sub-cell precision, no street, in reports, logs, analytics, error messages or tiles.
3. **No raw media leaves the device and none is stored.** Audio, camera frames and magnetometer streams are captured, processed and zeroed in the same call. Sensing adapters have no persistence dependency. A verdict record contains senses, confidence and time, never media.
4. **Reports** carry only `{ v, deviceEpoch, geohash6, minute, verdict, confidence, senses, restoreEdge }`, at most 200 bytes. Do not add fields without a privacy review. Send on verdict change only, with 0 to 120 s jitter (longer under storm policy).
5. **Identity**: devices use a rotating epoch, not a stable identifier. Accounts are optional. No children's accounts.
6. **Roster messages** are end-to-end encrypted; the server stores ciphertext and routing metadata only, for at most 7 days. Roster ids are pair-local and rotate daily. Optical and acoustic codes are intentionally public and carry no personal data.
7. **Retention** is enforced by TTL: per-device reports 30 days, roster relay 7 days, raw cell windows 30 days, aggregated cells 5 years.
8. **Residency**: each device is homed to one region; no cross-region replication of per-device data.
9. **Vulnerability data** (for example emPOWER overlays) is used only in aggregate and never to target individuals. Open data is aggregated and k-anonymous.
10. **Client telemetry** is performance and crash data with no location.
11. **No secrets, tokens or personal data in logs or AI prompts.**

## When writing or reviewing code
- Any new field in a report, event, log line or analytics event needs a stated purpose and must be answerable with "could this identify a household?".
- Property tests must show that no published cell has fewer than 5 distinct devices, and that a sequence of cell queries cannot narrow a household below a cell.
- The Privacy Red Team agent attempts de-anonymisation; record findings in `docs/kiro/privacy-findings.md`.
- Reject a change that persists a capture buffer, logs a coordinate, or reads a raw audio fixture marked ignored by `.kiroignore`.
