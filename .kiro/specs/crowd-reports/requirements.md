# Crowd reports and the public API — Requirements

**Modules:** `packages/core/src/sensing` (Grid Sense detectors, report validation, cell grids), `services/crowd` (the public API), `infra/modules/public-api` and the `reports` and `public_cache` tables, `apps/mobile/src/gridsense` and the Lantern's live mode.
**Workflow:** Requirements-First. Implements product description 7.2 (Grid Sense on the web), 7.3 (Ember Map from real reports), and the public data behind 7.3, 7.7, 7.11 and 7.12.

Until now the crowd map was a seeded simulation. This makes it real: a phone that detects an outage, from its charger and the room's mains hum, sends one tiny signed report, and the map shows what at least five phones agree on. The demo night runs through the same endpoint and the same aggregation.

## Requirements

### CR-01 — Grid Sense runs in the browser
- THE SYSTEM SHALL read the Battery Status API, where the browser offers it, and turn charging edges into votes: a stop after at least 10 minutes on the charger is a candidate outage, and charging again is a candidate restoration.
- WHEN the person allows the microphone THE SYSTEM SHALL take a short sample, measure energy at the 2nd and 3rd mains harmonics against the 80-200 Hz floor, and vote present, absent or unknown.
- THE SYSTEM SHALL fuse the votes with the core's deterministic fusion, so "power out" needs two negative senses or a sense corroborated by at least k neighbours.
- THE SYSTEM SHALL NOT store or send any audio. A silent or too-short sample is unknown.

### CR-02 — One small, signed report per change
- WHEN the fused verdict changes, and the person has shared their cell, THE SYSTEM SHALL send one report after a random 0-120 s delay: geohash-6 cell, minute, verdict, confidence, senses, restore flag. Nothing else.
- THE SYSTEM SHALL sign each report with a device key generated on the device and replaced every day, so reports on different days cannot be linked.

### CR-03 — The server checks before it stores
- THE SYSTEM SHALL store a report only when its device key is registered and unexpired, the signature verifies, every field passes the whitelist, and its minute is within 10 minutes of the server clock.
- THE SYSTEM SHALL keep at most one report per device, cell and minute.
- THE SYSTEM SHALL delete reports after 2 hours (TTL), keep no backup of them, and ignore expired items when reading.

### CR-04 — Cells are k-anonymous, checked again at the API
- THE SYSTEM SHALL aggregate cells with the core's `cellStateAt`, and SHALL publish a state and a count only when at least 5 distinct devices back it; anything less is unknown with no count.

### CR-05 — The demo goes through the same endpoint
- WHEN asked for `scope=demo` THE SYSTEM SHALL compute the simulated night with the same core aggregation and return it in the same shape.

### CR-06 — Public data leaves only a cell centre behind
- THE SYSTEM SHALL fetch public places from OpenStreetMap and forecasts from Open-Meteo through the API, sending only the centre of the person's cell (places) or of its ~5 km area (weather), never their position.
- THE SYSTEM SHALL cache that public data, name its source and licence, and answer "unreachable" rather than guess when the source fails.

### CR-07 — Location is a cell, on the device's terms
- THE SYSTEM SHALL ask for location only when the person chooses to see their area, turn it into a geohash-6 cell on the device, and keep only the cell.

## Privacy review (required for the two new tables)

- **`reports`**: a cell (~1.2 × 0.6 km), a minute, a verdict, a confidence, sense names, a restore flag and a device id valid for one day. No coordinates, no account, no IP address (API Gateway logs no source IP). Deleted after 2 hours; no point-in-time recovery, so no backup outlives that. The day key makes a device unlinkable across days. Re-identification risk: a single device's cell over one day; mitigated by k ≥ 5 on everything published and by the short retention.
- **`public_cache`**: OpenStreetMap places and Open-Meteo forecasts keyed by cell or area. Public data only; nothing about a person or a device.
- **Known limit:** without app attestation (not available on the web), one person can register many day keys and report many times. Throttling and the one-per-minute rule slow this; the native app adds Play Integrity and App Attest (architecture ADR-006). Until then the map says the crowd can be wrong, and provider data and satellite corroboration are separate sources.

## Hardening from the security review (2026-11-26)

- **CR-08** WHEN a device registers a day key THE SYSTEM SHALL require a proof of work of 20 bits over the key and the UTC day (today or yesterday), so each fake device costs about a second of a phone's work, every day.
- **CR-09** WHEN a day key reports from a cell THE SYSTEM SHALL allow at most 2 distinct cells per key per day and refuse others with 429, so turning one cell takes at least k = 5 keys made for it.
- **CR-10** WHEN the places for a cell are not cached THE SYSTEM SHALL start at most one background fetch per cell at a time (an atomic claim) at most 2 per minute for each requester bucket (16 bits of the source address's hash, never logged, kept 2 minutes) and at most 20 per minute in total, and SHALL NOT retry a failed fetch on its own; the next request for that cell starts it again.
- **CR-11** THE SYSTEM SHALL NOT change an outage state from crowd reports alone: on a phone, the crowd only corroborates a sense of the phone's own (fusion in the core). Device attestation (Play Integrity, App Attest) comes with the native app.

## Push notifications for a followed cell (2026-11-26)

- **CR-12** WHEN a phone follows its cell THE SYSTEM SHALL accept only a push subscription at a browser push service (FCM, Mozilla, Apple, Windows), store its endpoint and two keys under at most 3 cells for 30 days, and SHALL delete it on unsubscribe or when the push service reports it gone (404, 410).
- **CR-13** WHEN a stored report changes a cell's published state into dark, or from dark to coming back or lit, THE SYSTEM SHALL send one notification to the cell's followers, claimed atomically per cell and kind for 15 minutes; unknown and mixed never notify, and the published state already hides cells under k = 5.
- **CR-14** THE SYSTEM SHALL sign pushes with a VAPID key kept in Parameter Store as a SecureString created outside Terraform, so the private key is in neither the repository nor the state; logs of a push run carry counts only.

Privacy review, `push_subs`: the push endpoint is a pseudonymous address at the browser's push service, stored with the ~1 km cell it follows. No account, device id or finer position. 30-day TTL renewed only while the app is used; no backups.
- **CR-15** WHEN a phone subscribes THE SYSTEM SHALL require the same 20-bit proof of work over the endpoint and the day, and SHALL confirm a new subscription with a real notification before storing it, so an address its own push service refuses is never stored (renewals skip the confirmation). THE SYSTEM SHALL NOT cap followers per cell: it SHALL send one page of 500 per run and chain the next run with the cursor, and SHALL delete a subscription on any permanent refusal (4xx other than 429). (Security reviews, 2026-11-26.)

## Long outages stay on the map (2026-11-26)

- **CR-16** WHILE a phone's fused verdict is present or absent and it has shared its area, THE SYSTEM SHALL repeat its report every 10 minutes unless it reported the same verdict in the last 9 minutes, so a cell that counts reports from the last 30 minutes does not fade to unknown during a long outage (resolves the cells spec's open question Q1 for phones that stay sure).

## People who cannot be sensed (2026-11-27, Claude Code)

A browser on an iPhone has no battery events and cannot listen in the background, so its Grid Sense verdict is almost always "unknown" and it never reported. The people most likely to open Afterglow on the web could not light the map at all.

- **CR-17** WHEN a person in a real space (never the demo) presses "Power just went out" or "Power is back", or says it by voice, and has shared their area, THE SYSTEM SHALL send one signed report for that change with `senses: ["reported"]` and confidence 0.5, after a 0 to 30 s jitter. IF the phone's own senses already reported the same verdict, or the change came from a change of space, THEN THE SYSTEM SHALL NOT send it, so one device never counts twice. WHILE the person's "out" stands and no sense is sure, THE SYSTEM SHALL repeat it on the CR-16 heartbeat. A person report is one device in the k ≥ 5 count like any other: a lone person can never colour a cell, and CR-11 still holds (crowd reports never change a phone's own state).
