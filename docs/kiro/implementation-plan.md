# Afterglow — Master Implementation Plan

**Purpose.** Sequence the entire build of the real product described in `docs/afterglow-project-description.md`, `docs/afterglow-architecture.md`, and `docs/afterglow-design.md` — all 20 feature modules, the shared deterministic core, the design system, platform adapters, native sensing modules, the nine backend services, the Python jobs, the Flink job, infrastructure, and the five product surfaces (app, Voice, Business, Beacon, Platform) — plus the Kiro-native engineering surface (specs, hooks, agents, MCP, Powers, Crew).

**How to read this.** Each module is built spec-first: `.kiro/specs/<name>/{requirements,design,tasks}.md`, then a real implementation with EARS-mapped property tests, then its surface in a shell. "Done" means the properties are green (`tech.md`: properties are the definition of done). This document is the roadmap; per-module `tasks.md` files carry the task detail.

**What "real" means here.** Everything that is deterministic, offline-first TypeScript is built for real and fully tested — that is the bulk of the product and the actual engine. Everything that touches an external system (native OS sensing, AWS, telco aggregators, vendor clouds, the pharmacist-approved formulary) is built against its real contract behind an adapter; provisioning the cloud, signing partner contracts, and publishing to stores are human-only gates (see §Human-only gates). No module is a facade.

**Status legend.** `[x]` done · `[~]` in progress · `[ ]` planned.

---

## Current state (done)

- [x] Monorepo: pnpm workspaces + Turborepo + Biome + strict TS 5.7; Apache-2.0 license.
- [x] `packages/core/fusion` — Grid Sense sense-fusion (GS-01..GS-08 property tests green).
- [x] `packages/design-system` — Night Shell tokens + luminance guards (NS-01..NS-08 green).
- [x] `.kiro/specs/grid-sense`, `.kiro/specs/night-shell` — EARS requirements, design, tasks.
- [x] Phase-1 hooks: `luminance-on-token-save`, `sensing-fixtures-on-save`, `agent-stop-gate`.
- [x] `apps/mobile` — web PWA shell rendering the Night Shell + Hearth + Lights-Out, driven by the real fusion core.

The fusion module and tokens are not demo artifacts; they are the first two real modules and remain the foundation everything else builds on.

---

- [x] Wave 1.5 slice: `foodkeeper`, `household`, `thermal-appliance-v2` (corrected the refrigerated danger threshold from 5 °C to USDA's 40 °F / 4.4 °C), Cold screen, computed Hearth tiles, medicine ward (fail-closed refusal; no formulary yet).
- [x] Two further PBT catches recorded (schedule merge ordering; non-finite crossing time) plus one from foodkeeper.

---

## Build principles (apply to every wave)

1. **Dependencies point downward** (`structure.md`): UI → feature modules → `packages/core` → adapters → OS. The core imports nothing but itself.
2. **Every external source is an adapter** (`fetch`, `normalise`, `health`), tested against recorded fixtures including malformed ones.
3. **Fail closed, privacy by construction, night vision, label-only medicine** — the four steering invariants gate every change; property tests enforce them.
4. **One core, many shells.** The web app, native app, Voice, Business, Beacon, and Platform all consume the same `packages/core`.
5. **Real public data** is vendored into `data/` as each consuming module is built (USDA FoodKeeper, NREL/regional archetypes, device table, OpenCelliD extracts, provider fixtures).
6. **Property tests are the definition of done**; shrunken counterexamples recorded in `docs/kiro/pbt-catches.md` the same day.

---

## Wave 0 — Foundation hardening (small, do first)

Close the gaps the current scaffold left before the core grows.

- [ ] **0.1 Core test runtimes.** Run the `packages/core` property suite on Node, in a headless browser, and on a Hermes runner in CI (architecture ADR-002), so the core is verified on every runtime it ships to.
- [x] **0.2 Shared types package / core barrel.** Establish `packages/core` module layout (`events`, `cells`, `schedule`, `thermal`, `foodkeeper`, `formulary`, `energy`, `heliograph`, `acoustic`, `alerts`, `policy`, `fusion`) with a stable public surface and per-module property-test convention.
- [x] **0.3 `AGENTS.md`** at repo root — the universal contract (deterministic core, fail closed, no raw media, k ≥ 5, no light mode).
- [~] **0.4 `.kiroignore`** (content ready; the workspace write-deny rule blocks agent writes to it, so a human adds it) — env files, keys, raw audio fixtures under `data/fixtures/audio/raw/`.
- [~] **0.5 CI pipeline** — `ci.yml` (lint, typecheck, property suite, build) and `deploy-pages.yml` written; not yet run on GitHub. Playwright pixel-scan job still to add.
- [ ] **0.6 Responsive/overflow pass** on the app shell (close the "nothing overflows" design rule).

---

## Wave 1 — Deterministic core (the engine room)

Pure TypeScript, no I/O. Built in dependency order. Each is a real product module with its own spec and property suite.

- [x] **1.1 `events`** — append-only event log types + reducers. Everything persists through this. _Properties:_ reducer determinism, replay equivalence, LWW by (lamport, deviceEpoch), idempotent dedup. (EV-01..EV-08 green; PBT caught a dedup order-dependence bug.)
- [x] **1.2 `cells`** — geohash-6 encode/decode, k-anonymity aggregation (≥5 distinct devices or unknown), restoration detector, provenance tagging. _Properties:_ k never breached; restoration never below k; aggregation commutative/idempotent; cell-granular outputs only. (CE-01..CE-08 green.)
- [x] **1.3 `schedule`** — provider-merge (deterministic, idempotent, commutative), adherence scoring (promised vs observed). _Properties:_ merge order-independence; adherence monotonicity. (SC-01..SC-07 green.)
- [x] **1.4 `thermal`** — RC compartment model `T(t)=T_amb+(T_0−T_amb)e^(−t/τ)` and building model; `temperatureAt`, `crossingTime`, `discardTimes`; door-event steps. Real USDA/archetype constants vendored. _Properties:_ boundedness, monotonicity toward ambient, order-independence of door events, model versioned. (TH-01..TH-07 green.)
- [x] **1.5 `foodkeeper`** — rules engine over the real USDA FoodKeeper snapshot (661 products, CC0) and USDA outage guidance. Refrigerated window = `min(240 min, modelled 40 °F crossing)`; frozen ice-crystals flow; unlisted foods fall back to perishable. (FK-01..FK-11 green.) Also: `household` event-sourced view and derivations (HH-01..HH-07 green); Cold screen and computed Hearth tiles. See `.kiro/specs/foodkeeper`, `.kiro/specs/household`.
- [ ] **1.6 `formulary`** — excursion clocks over *validated* entries only (`{product,labelVersion,condition,maxTempC,maxDays,notes,source,approver,approvedAt,signature}`); signature verification; "ask your pharmacist" when absent; stop at label allowance. _Properties:_ clock never exceeds budget; unvalidated/unsigned entry never yields a clock; monotonic while outside range. (The validated table itself lives in the separate `afterglow-formulary` repo; see §Separate repos.)
- [ ] **1.7 `energy`** — store/load priority planner (medical > communication > light > food > comfort), feasibility checks, schedule awareness, generator fuel/runtime. _Properties:_ never schedules a medical load on a store that can't sustain it for the forecast; infeasible loads stated; deterministic given inputs.
- [ ] **1.8 `heliograph`** — frame encoder/decoder, Manchester clock recovery on sampled brightness series, Hamming(12,8)+CRC-4, three-repeat majority vote. _Properties:_ codec round-trip under bounded bit flips; never displays a best-effort decode (repeat requested on FEC+CRC fail).
- [ ] **1.9 `acoustic`** — ggwave payload adapter (FSK, audible/near-ultrasonic) carrying the same codes. _Properties:_ payload round-trip; same message set as optical.
- [ ] **1.10 `alerts`** — rule evaluation (outage, coming-back, threshold-in-30-min, budget-24h, hours-of-safety-2h, missed check-in, HELP, CO checklist, advisory); dedup across channels; every alert cites its source. _Properties:_ dedup idempotence; source always present.
- [ ] **1.11 `policy`** — storm-mode client policy evaluation (jitter bounds, batch size, report rate, alert priority classes). _Properties:_ safe degradation; HELP/medical/restoration prioritised under storm.

---

## Wave 2 — Platform adapters and local persistence

The seam between the pure core and the impure world.

- [ ] **2.1 Adapter interfaces** (`packages/adapters`) — sensing, storage, network, crypto, maps, notifications, background. Pure interfaces; web implementations where applicable.
- [ ] **2.2 SQLite everywhere** — `expo-sqlite` (native) / `wa-sqlite` on OPFS (web); one schema; the `events` log + reducer views; SQLCipher where the keystore holds the key.
- [ ] **2.3 Sync** — idempotent, jittered (0–120 s), batched, watermark-acked; LWW by device-epoch; roster append-only; reports immutable. No sync required for any safety function.
- [ ] **2.4 Crypto** — libsodium / WebCrypto; Ed25519 device identity; X25519 pairing; HKDF daily-rotating roster ids; sealed-box roster payloads.
- [ ] **2.5 Snapshots on device** — FoodKeeper, archetype tables, device table, provider schedules, PMTiles city packs.

---

## Wave 3 — Sensing (native) and the report pipeline

Real detectors behind the adapter seam; raw media never persists (privacy invariant).

- [ ] **3.1 Expo Modules scaffolding** (`modules/`) — Kotlin/Swift, New Architecture.
- [ ] **3.2 Hum detector** — Goertzel bank at 2nd/3rd mains harmonics, noise-floor comparison, per-device calibration; tested on recorded 50/60 Hz fixtures (quiet, noisy, generator-adjacent).
- [ ] **3.3 Flicker detector** — rolling-shutter banding, positive-only; LED/fluorescent/incandescent/DC fixtures.
- [ ] **3.4 Charging-edge** — debounced transition (≥10 min stationary+plugged), restore edge; Android Sentinel foreground service + WorkManager; iOS within limits.
- [ ] **3.5 Magnetometer** — 50/60 Hz field, aliasing-aware, positive-only.
- [ ] **3.6 Home telemetry clients** — inverter/battery (Sunsynk/Deye, Victron, Tesla, Enphase, Growatt, SolarEdge, Fronius), UPS (NUT), Matter plugs, Home Assistant; grid-loss → authoritative vote.
- [ ] **3.7 Report emission** — ≤200-byte report on verdict change, 0–120 s jitter; GS-09 privacy properties (field whitelist, no raw media).

---

## Wave 4 — Provider framework and external data adapters

- [ ] **4.1 Provider adapter contract** + conformance suite (recorded feeds, incl. malformed).
- [ ] **4.2 Wave-1 providers** — EskomSePush/municipal (ZA), YASNO/DTEK/Ukrenergo (UA), LUMA + PowerOutage.us (US/PR), manual-schedule provider.
- [ ] **4.3 Wave-2 providers** — K-Electric/LESCO, EDL, UNE, ECG, KPLC, ZESCO, ZESA, DisCo.
- [ ] **4.4 Public-data adapters** — Open-Meteo/NOAA (weather), NASA Black Marble VNP46, OpenCelliD, OSM/HIFLD/FEMA (lit places), FCC DIRS, grid-frequency feeds (NESO, Swissgrid/ENTSO-E, Eskom status).

---

## Wave 5 — Feature modules surfaced in the app (consumer app completeness)

Each feature module (spec §7.1–7.20) gets its screens, every state designed (loading/empty/offline/unknown/error/denied/first-run/success), Night Shell components, and a Playwright pixel scan.

- [ ] **5.1 Night Shell components** — full primitive + costume set (`Button, Tile, Tombstone, Candle, GhostRow, StatusLine, SourceChip, ModeSwitch, Compass, Timeline, MapOverlay, CodeButton, WardCard, EmptyState, UnknownState, OfflineBadge, Sheet, Toast, Field, ListGroup`); Lantern Icons; motion tokens; Storybook states matrix; lint rule forbidding raw hex.
- [ ] **5.2 Grid Sense + Ember Map screens** — Hearth status line; Lantern map (MapLibre + PMTiles), cell provenance, lit places, schedule/adherence, grid-stress gauge, history/playback.
- [ ] **5.3 Cold Chain + Medicine** — compartment tombstones, temperature curves, inventory, "can I eat the…", excursion clocks with label provenance.
- [ ] **5.4 Hours of Safety + Candles + CO Guard** — Graveyard Shift timeline, energy candles/plan, the Ward checklist.
- [ ] **5.5 Heliograph / Séance** — send codes (torch), receive (camera decoding ring), roster/ghost board, QR pairing, BLE/Wi-Fi-Aware channels, Lamplighters.
- [ ] **5.6 Signal Finder + Dependent Services** — towers/bearing, DIRS severity; water-pressure countdown, lifts, ATMs, fuel.
- [ ] **5.7 Alerts, History/Reports, Household, Guidance + Ask, Settings, Onboarding** — the remaining §7.13–7.20 surfaces, incl. accessibility (3 luminance modes, screen-reader names, Dynamic Type 200%) and localisation scaffolding.
- [ ] **5.8 Widgets / Live Activities / watch complications** (native).

---

## Wave 6 — Backend (built against real AWS contracts; deploy is a human gate)

TypeScript Lambda (Node 24), Python 3.13 jobs, Java 17 Flink. Real code, real IaC; `terraform apply` and publishing are human-only.

- [ ] **6.1 Intake + edge** — CloudFront Function (token check, rate limit, region route) → API Gateway → `intake` Lambda (schema, attestation, dedup) → Kinesis. 202 immediately.
- [ ] **6.2 Flink cell-aggregation** — keyBy(geohash6), 5-min tumbling + 30-min sliding distinct-device count, k-anonymity gate, restoration detection, provenance; checkpoints to S3; `CellState` upserts.
- [ ] **6.3 Tile serving** — MVT tiles to S3, CloudFront 60 s TTL; PMTiles basemaps.
- [ ] **6.4 Provider service** — EventBridge-scheduled adapters, adherence scoring, per-adapter health.
- [ ] **6.5 Corroboration job** (Python) — nightly Black Marble radiance deltas per cell; "confirmed by satellite".
- [ ] **6.6 Restoration-forecast job** (Python) — weekly GBM over adherence history; precomputed estimates per cell/stage.
- [ ] **6.7 Alerting service** — SNS → FCM/APNs/Web Push, Twilio/Africa's Talking SMS, Amazon Connect IVR; dedup; storm priorities.
- [ ] **6.8 Roster relay** — WebSocket + DynamoDB TTL queue; ciphertext + routing only; ≤7-day retention.
- [ ] **6.9 Identity** — Ed25519 device tokens + Play Integrity/App Attest; optional Cognito accounts; institutional SSO.
- [ ] **6.10 Open-data publisher** — Glue/Athena over S3 Parquet; nightly k-anonymous export with DCAT.
- [ ] **6.11 Infra** — Terraform modules + per-region stacks (af-south-1, eu-central-1, us-east-1, ap-south-1, me-south-1); AppConfig flags; OpenTelemetry; SLO alarms; storm-mode control plane; chaos drill harness.

---

## Wave 7 — The other four product surfaces

- [ ] **7.1 Afterglow Voice** — USSD/SMS/IVR flow engine (thin-channel skeleton); 182-char GSM-7 pagination (property-tested); validated phrase-bank IVR; Africa's Talking/Twilio/Infobip adapters (sandbox).
- [ ] **7.2 Afterglow Business** — multi-site/roles, cold-chain compliance logs, generator management, spoilage ledger, claim packages, "open and lit" status page. (`apps/consoles`)
- [ ] **7.3 Afterglow Beacon** — live map, overlays, satellite corroboration, analytics/adherence, advisory composer, vulnerable-population aggregates, exports. (`apps/consoles`)
- [ ] **7.4 Afterglow Platform** — public API (cell-granular reads of published cells only), webhooks (signed), SDKs (JS/Kotlin/Swift) generated from OpenAPI, usage plans.

---

## Wave 8 — Kiro-native engineering surface (Technological Implementation)

Built alongside the waves above, not after; listed here for completeness.

- [ ] **8.1 Specs** — one per module + `providers, simulator, platform-api, voice, beacon, business, tiles, aggregation, relay, formulary-pipeline`; EARS ids traced to properties and tasks.
- [ ] **8.2 Remaining hooks** — `deny-dialers`, `deny-publish-deploy`, `deny-formulary-write`, `formulary-docs-regen`, `property-skeleton-on-create`, `post-task-verify`, `prompt-context`, `session-brief`, `provider-conformance`.
- [ ] **8.3 Custom agents** — Foreman, Lamplighter, Quartermaster, Cartographer, Label Reader, Pharmacist Validator, Sensor Red Team, Privacy Red Team, Night Watch, Release Gate — each scoped tools/permissions/resources.
- [ ] **8.4 MCP servers** — openFDA, emPOWER, grid-feeds, Black Marble, DIRS, OSM Overpass, provider sandboxes, Africa's Talking/Twilio sandboxes, Home Assistant, Playwright, custom lux-meter, custom simulator.
- [ ] **8.5 Tools** — `tools/simulator` (virtual neighbourhood driving demos/tests/chaos), `tools/mcp/*`.
- [ ] **8.6 Powers** — `powers/grid-sense`, `powers/night-shell`, `powers/thin-channels` (published).
- [ ] **8.7 Evidence** — `docs/kiro/{pbt-catches, experiments, privacy-findings, hooks-log}.md`.

---

## Separate repositories (per `structure.md`)

- [ ] **`afterglow-formulary`** — validated formulary JSON with signatures + review history; written only by its review pipeline.
- [ ] **`afterglow-crew`** — the Kiro Crew app (nightly satellite corroboration, fixture re-runs, formulary re-validation, provider health, adherence recompute, Heartbeat on regressions, dashboard). Bonus target: Best Kiro Crew App.

---

## Human-only gates (I build up to these; you perform them)

These are marked in `tech.md` and the architecture as human steps; I will prepare everything and stop at the boundary:

1. **AWS provisioning / `terraform apply`** — I write the IaC and the plan; you apply.
2. **Store submission / `eas submit` / signing identities** — I prepare the builds/config; you submit.
3. **Sending real SMS/voice/push** — denied in code by the `deny-dialers` hook outside test mode; only you enable production.
4. **Writing the validated formulary table** — only the `afterglow-formulary` review pipeline + a licensed pharmacist; agents only propose.
5. **Partner/telco/vendor credentials** — you supply; I integrate against sandboxes until then.
6. **Publishing Powers / open data** — I prepare; you publish.

---

## Reality check on scope and sequencing

The full product is a multi-month, multi-person system; it will not all be finished in one sitting, and parts cannot be *exercised* without the human gates above. The plan is ordered so that at every point there is a coherent, working, property-tested slice:

- **Fastest credible "whole product" spine** = Waves 0–1 (full core) + Wave 5 (app surfaces over that core) + `tools/simulator`. This is a complete, offline-first consumer app with every safety module backed by real deterministic logic, runnable from a URL with no cloud.
- **Backend (Wave 6)** turns the local crowd map into the real multi-region one; it's real code but gated on your AWS.
- **Other surfaces (Wave 7)** and the **Kiro engineering surface (Wave 8)** broaden the family and the judging evidence.

**Recommended execution order:** 0 → 1 (all core modules) → 2 → 3/4 in parallel → 5 → 6 → 7, with 8 threaded throughout. Native (Wave 3) and AWS (Wave 6) proceed against real contracts and pause at the human gates.

---

## Immediate next steps (pending your go-ahead)

1. Wave 0.2–0.4: core module layout + `AGENTS.md` + `.kiroignore`.
2. Wave 1.1 `events`: spec → implementation → property tests.
3. Wave 1.2 `cells`: spec → implementation → property tests (k-anonymity is the highest-value invariant to lock early).

Then continue down Wave 1 module by module.
