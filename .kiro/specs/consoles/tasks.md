# Consoles, history, Ask phrasing, schedules and localisation — Tasks

Built 2026-11-26/27 without new tests at the founder's request. All existing suites stay green (core 304, app 147, browser 135, and the rest). Infrastructure applied with the founder's approval (29 added, 2 changed) and smoke-tested live:
- Ask: Claude Haiku 4.5 (EU profile) phrased the chicken and cold-baby answers from the passages; an off-topic question never reached the model.
- History: five test devices made a test cell dark; its history showed one outage; a bug that counted an outage starting this minute as zero was found and fixed.
- Console: a throwaway Beacon user created a site, was refused bad input, published a status (seen publicly), logged a reading and a refuel, published an advisory (seen publicly) and deleted the site (status gone). Two throwaway accounts with the same site id could not touch each other's public status (BC-06). Users deleted afterwards.

- [x] `services/console` (handler, store, lambda), `infra/modules/console-api`, tables `business`, `sites`, `advisories`, Cognito group `beacon` — CO-01, BC-01..BC-03, BC-05, BC-06, BE-02
- [x] Public routes `GET /v1/history`, `/v1/advisories`, `/v1/sites`, `POST /v1/ask`; history writes on every report — HC-01, HC-02, GL-07
- [x] Grid Sense heartbeat every 10 minutes while sure — HC-03
- [x] Guidance library moved to `packages/core/src/guidance` so phone and server answer from the same text
- [x] App: `console/BusinessConsole.tsx` (sites, status, readings, generator, cold-chain report), `console/BeaconConsole.tsx` (7 × 7 region, history chart and ranking, health facilities, advisories, CSV) — BC-04, BE-01, BE-03
- [x] App: advisories, neighbour comparisons and open businesses on the live Lantern; Claude's phrasing above the passages in Ask — HC-04, GL-07
- [x] `schedule/manual.ts` and `ScheduleSection.tsx`: parse announced windows, merge with the core, next window, adherence; the Lantern uses it — SC-01
- [x] `i18n/`: catalogues (English, and French, Spanish, Portuguese drafts), phone language by default, picker on You, page `lang` follows — LO-01
- [ ] Native review of the translations; more languages (isiZulu, Afrikaans, Ukrainian, Arabic with right-to-left)
- [ ] Verified business badges (needs an offline check)
- [ ] Beacon overlays (satellite night lights, vulnerable-population data) and Lamplighter coordination
