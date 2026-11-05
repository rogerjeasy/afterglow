# Afterglow — Complete Product Specification

**Tagline:** The only app you can read when the grid dies.
**One sentence:** Afterglow is the blackout companion for the billions of people who live with unreliable electricity: a night-vision interface that turns every phone into a grid sensor, every flashlight into a messenger, and every fridge, medicine box, living room and battery into a physics model, so that people in the dark know what is still safe, who is still okay, where the lights still are, and when they will return.

**Document status:** full product specification, release 1.0. This describes the complete product as it will be used by millions of people, not a demo. Choices marked **[my call]** were made by the author of this document and can be overridden by the founder; section 23 lists the decisions only the founder can make.
**Hackathon:** Kiroween 2026 · Category: **Costume Contest** (darkness is the function) · Bonus targets: Best Startup, Best Kiro Crew App, Best Demo, Blog, Social. Section 22 covers how the product is presented to the judges.

---

## Table of contents

1. Problem statement
2. Motivation and why now
3. Vision, thesis and principles
4. Who Afterglow is for
5. The Afterglow product family
6. End-to-end user journeys
7. Complete feature specification (20 modules)
8. Non-goals and anti-goals
9. Public data and unusual resources
10. Architecture at product scale
11. Deterministic core and AI boundaries
12. Privacy, security, trust and safety, compliance
13. Design system: the costume
14. Platforms and device matrix
15. Integrations and partnerships
16. Business model and pricing
17. Launch, growth and geographic expansion
18. Kiro development strategy
19. Quality, reliability and testing
20. Success metrics and KPIs
21. Risks and mitigations
22. Hackathon presentation
23. Decisions for the founder
24. Glossary
Appendices A–F

---

## 1. Problem statement

Between 1.46 billion people (Rockefeller Foundation reliability map built on World Bank Enterprise Survey outage frequency and duration) and 3.5 billion people (Baker Institute, "reasonably reliable" threshold of at most 12 outages and 12 outage-hours per year) live with electricity they cannot count on.

- **South Africa**: scheduled load shedding made EskomSePush, a schedule app, a product with more than 10 million users.
- **Ukraine**: rolling outage windows published through Svitlo, YASNO and DTEK bots; elevators, water pumps and heating depend on the grid through winter.
- **Nigeria**: businesses report around 239 outage-hours per month; most run generators.
- **Lebanon**: roughly 50 outages per month; private generator networks sell power by the ampere.
- **Pakistan, Cuba, Ecuador, Iraq, Egypt, Zimbabwe, Zambia, Ghana, Kenya, Bangladesh, Venezuela, Haiti, Puerto Rico** and the storm belts of the United States (Texas, February 2021: 246 deaths officially recorded, independent estimates several times higher, and one of the largest carbon-monoxide poisoning events in recent US history) add hundreds of millions more.

Every product in this space answers one question: *when will the power go and come back?* None answers the questions people have while the lights are out:

1. **Is it just me, my street or the district, and is it already back two streets over?** Utilities often publish nothing, or publish late and wrong.
2. **Can I still eat the chicken? Is my insulin still good? How long will my oxygen concentrator's battery last?** The guidance exists (USDA, FDA labels, device manuals) but is scattered, written for daylight, and expressed as crude rules rather than for *this* fridge, *this* room, *this* medicine, *this* device.
3. **How cold or hot will my home get tonight, and when do I have to leave?** Researchers compute "hours of safety" for buildings; no consumer product does.
4. **Is my mother okay across the courtyard? Is the frail neighbour on the fourth floor okay?** The most vulnerable are the least reachable when networks fail.
5. **Where is there water pressure, a working lift, a charged phone, a cell signal, an open pharmacy?** Dependent services fail in cascades that nobody maps.
6. **Can I even read my phone?** Apps are designed for lit rooms. At 2 a.m. a white screen destroys night vision, blinds the room, and drains the only battery left.

The gap is not information. It is an interface and a sensing layer designed for darkness, and a community layer designed for the people the smartphone era skipped.

## 2. Motivation and why now

- **Demand is proven.** EskomSePush, Ukraine's outage bots, PowerOutage.us and Watch Duty show that utilitarian public-safety apps reach tens of millions when they are trusted and useful.
- **The sensing is proven but unshipped.** UC Berkeley's GridWatch (Klugman & Dutta, 2014) showed that an unmodified smartphone can detect outages by observing its own power state and corroborating with nearby phones; the Millennium Challenge Corporation funded a $6.2M Phase II deployment across Accra (2017–2021) that was more accurate than utility records. It remained a research instrument.
- **Phones can now sense and talk without infrastructure.** Battery state, microphone, camera with torch control, ambient light, Web Audio, BLE and Wi-Fi Aware, service workers and local databases make an offline-first, sensing, communicating app possible on the mid-range Android phones people in outage-prone regions own.
- **Public data has matured.** NASA Black Marble nightly radiance, USDA FoodKeeper, openFDA drug labels, HHS emPOWER, NREL ResStock, live grid-frequency feeds, FCC DIRS, OpenCelliD, OpenStreetMap and national schedule feeds are public and have never been combined for this purpose.
- **Home energy is changing fast.** Millions of households in South Africa, Pakistan, Lebanon, Nigeria and Ukraine now own inverters and batteries; those systems expose telemetry that nobody connects to the household's safety decisions.
- **Kiroween's Costume Contest asks for exactly this.** In Afterglow the darkness, the candle, the tombstones, the ghosts, the lantern and the ward are not decoration; each is a measurement.

## 3. Vision, thesis and principles

**Vision.** Nobody should be alone, blind or guessing in the dark. When the grid fails, the community becomes the grid's nervous system.

**Thesis.** *The people in the dark become the sensor network, and light itself becomes the network.*

**Principles.**
1. **Deterministic core; AI as proposer, translator or auditor.** Every verdict (mains present, discard time, hours of safety, medicine budget, map cell, restoration estimate) comes from deterministic code with citable inputs. AI drafts, translates and explains; it never decides.
2. **Fail closed.** Unknown is a first-class answer. The app never says "safe" when it cannot know, never shows a map cell it cannot anonymise, never extends a clock beyond its source.
3. **Offline first, every channel opportunistic.** The core works with no connectivity. Data, SMS, voice, light, sound, BLE, Wi-Fi Aware and LoRa are used as they appear.
4. **Dark first.** There is no light mode. Luminance is a budget. Red is the only hue.
5. **Humans provide physical reach.** The app asks people to do what sensors cannot and treats their answers as evidence with provenance.
6. **Safety is free.** Everything a person needs to stay safe in an outage is free forever; revenue comes from convenience, households, businesses and institutions.
7. **Costume is function.** Every spooky element encodes a measurement. A metaphor that carries no information is cut.
8. **Open where it matters.** The client and the sensing core are open source; aggregated grid data is published as open data; the medicine table and its provenance are public.

## 4. Who Afterglow is for

### 4.1 Segments
- **Households in load-shedding and storm economies** (South Africa, Ukraine, Nigeria, Pakistan, Lebanon, Cuba, Puerto Rico, Texas, California, the Caribbean, South and South-East Asia).
- **Medically dependent people and their caregivers** (insulin, biologics, oxygen concentrators, ventilators, CPAP, home dialysis, powered wheelchairs).
- **Vulnerable neighbours and the people who look after them** (elderly, disabled, isolated).
- **Small businesses with cold chains and generators** (pharmacies, clinics, grocers, butchers, restaurants, dairies, fish traders).
- **Buildings and communities** (caretakers, residents' associations, places of worship, schools).
- **Institutions** (municipal emergency management, utilities, NGOs, insurers, public-health agencies, telcos).
- **Developers** who want "does this room have power?" or "is this block dark?" in their own products.

### 4.2 Personas
| Persona | Situation | What Afterglow does for them |
|---|---|---|
| **Thandi**, 34, nurse, Soweto | Stage-4 load shedding; home at 22:00; up at 05:00 | Reads the real schedule merged with crowd reality without waking anyone; fridge tombstones; lantern; battery candle for her alarm; inverter status |
| **Oksana**, 58, Kyiv, 7th floor | Rolling outages; electric lift and water pump; mother (82) across the courtyard | Hours of safety for her flat in January; water-pressure countdown; Heliograph "SAFE" to her mother's window; YASNO schedule |
| **Chinedu**, 41, pharmacy owner, Lagos | 8–10 h outages daily; a fridge of insulin and vaccines; a generator | Cold-chain physics with BLE thermometers; openFDA/WHO medicine budgets; generator fuel and CO guard; spoilage ledger; a "we are open and lit" status page |
| **Luis**, 67, Bayamón, type 1 diabetic | Hurricane-season outages lasting days | Label-derived insulin clock against modelled room temperature; nearest lit pharmacy; CHARGE-HERE beacons; LUMA status |
| **Dana**, 45, Austin, caring for her father on oxygen | Ice storm; no idea how long the backup lasts | Medical-device runtime; hours of safety; warming centres with power; a Lamplighter who checks in; utility medical-baseline registration |
| **Sipho**, 52, building caretaker, Johannesburg | 60 flats; knows who is frail | Building mode: roster, ghost board, Heliograph receiver on the courtyard, lobby notice, lift and pump status |
| **Amaka**, emergency manager, Lagos State | Needs ground truth faster than the DisCo | Beacon: crowd outage and restoration map with satellite corroboration, hospital and cold-chain status, Lamplighter coordination |
| **Marta**, claims lead at an insurer | Thousands of spoilage claims after every storm | Verified fridge logs and spoilage ledgers attached to claims; fraud reduced; payouts faster |
| **Dev**, engineer at a telehealth company | Wants to pause video visits for patients in blackouts | Afterglow Platform API: "is this patient's cell dark?" with k-anonymous answers |

**Primary platform reality:** mid-range Android phones, often with weak batteries and cracked screens, in completely dark rooms, on congested networks.

## 5. The Afterglow product family

| Product | Who | Form |
|---|---|---|
| **Afterglow** (consumer app) | Households, caregivers, neighbours | Android and iOS native apps (shared core) and an installable web app; all 20 modules |
| **Afterglow Voice** | Feature-phone and low-literacy users | USSD menus, SMS codes, IVR voice line with community-recorded phrase banks |
| **Afterglow Business** | Pharmacies, clinics, grocers, restaurants, dairies | Multi-site cold-chain compliance, generator management, staff roles, spoilage ledger, status page |
| **Afterglow Beacon** | Municipalities, utilities, NGOs, insurers, public health | Web dashboard: live and historical maps, overlays, scorecards, alerts, coordination, exports |
| **Afterglow Platform** | Developers and partners | Public API and SDKs, webhooks, open data, the Grid Sense Kiro Power, the Kiro Crew app, Home Assistant integration |

All products share one core (`packages/core`), one design system, one privacy model and one data platform.

## 6. End-to-end user journeys

### 6.1 Install and onboarding (lit room, under five minutes, every step skippable)
Install from the store, a link or a QR on a lobby poster. Choose region; the app sets mains frequency, providers and languages. Calibrate the hum sense with two 2-second samples (near a powered lamp; ambient). Add appliances (type, fullness, optional BLE thermometer), home archetype (building type, vintage, insulation, floor), medicines (search the validated formulary), devices and energy stores (phone, power bank, laptop, car, inverter and battery, generator, UPS), dependents and their devices, and the roster (pair family and neighbours by QR or phone number). No account is required; an optional account enables households, cross-device sync and Business/Beacon roles.

### 6.2 At the moment of outage
The phone detects its own charging edge, the inverter reports grid loss, or the user opens the app in the dark. Ambient light under 5 lux engages the Night Shell. The home screen shows one line: *Grid down 00:00:12 · 14 neighbours lost power at 20:07 · ESP says 22:30 · crowd says 22:50.* Tombstones, medicine clocks, hours of safety, water-pressure countdown and candles start. A single tap sends SAFE to the roster by every channel that works.

### 6.3 During
Check food ("Can I eat the chicken?" gives a deterministic answer with the USDA citation). Decide on the generator (CO guard checklist and the ward). Check ghost neighbours; receive a Heliograph "SAFE" from across the courtyard. See where the lights, water, signal and open pharmacies still are. Read the grid-stress gauge and the restoration estimate with its confidence. Follow the hours-of-safety plan: "one warm room", when to leave, where to go.

### 6.4 Restoration
Neighbours' phones start charging; the Ember Map lights the street before the utility updates. Hum and flicker confirm mains in the room. Clocks close, discard decisions are recorded with reasons, the ledger finalises, the inverter's recharge is tracked.

### 6.5 After
A summary: duration, what the utility said versus what happened, what was discarded and why, who checked in, how much energy was used. The report is evidence for insurance, complaints and the community's own record. The utility's schedule-adherence score updates.

### 6.6 Household, building and community journeys
Households share appliances, medicines and dependents across phones. Buildings run a caretaker view with a lobby poster and a Heliograph receiver. Communities run Lamplighter programmes with verified coordinators, training, and shift rotas during long outages.

### 6.7 Business journey
Chinedu's pharmacy has three fridges with BLE thermometers, a generator with a fuel log, and two staff. On outage, the app projects each fridge's trajectory, alerts staff before any product crosses its label limit, logs generator starts and fuel, publishes "open and lit" to the status page, and at the end produces a WHO-aligned cold-chain report and, if anything was lost, a spoilage claim package.

### 6.8 Institutional journey
Amaka's team watches Beacon during a grid collapse: crowd cells turning dark in real time, satellite corroboration overnight, hospitals and pharmacies with and without power, the emPOWER-style vulnerable-population overlay, cell-site outage severity, Lamplighter coverage gaps, and a one-click public advisory pushed to Afterglow users in affected cells.

## 7. Complete feature specification

Each module lists purpose, capabilities, rules, data, and behaviour on failure. Requirements are written in EARS form in Appendix C.

### 7.1 Night Shell
*The interface layer everything renders through.*
- **Red-only palette** of luminance tiers defined as tokens; background pure black; text tiers 2–8% relative luminance; alerts by size, pulse and pattern, never hue. Long-wavelength light (≥620 nm) spares rhodopsin so the user still sees the room.
- **Luminance budget**: brightness capped at platform minimum under 5 lux (Ambient Light Sensor where present, camera-based estimate otherwise, manual override always). OLED black pixels cut display power 39–47%.
- **Dark-adaptation timer**: after any bright exposure the interface dims further and shows "night vision restored in 18 min".
- **Lantern mode**: full-screen dim red light at the most lumen-per-watt level; a confirmed "white light for 30 seconds" escape hatch; SOS strobe; a steady beacon for Heliograph receivers.
- **Eyes-free mode**: speech readout of the home line and alerts; haptic grammar (one long = outage, two short = restoration, triple = HELP received); voice commands for the ten most common actions.
- **Glove and panic ergonomics**: 56 px targets, thumb-reach layout, one-tap SAFE, no precision gestures, large numerals.
- **Widgets, complications and lock-screen**: outage timer, next schedule window, hours of safety, candle, ghost count (Android widgets, iOS Live Activities and Lock Screen widgets, Wear OS and watchOS complications).
- **No light mode exists.** Screenshots and shares render on black.

### 7.2 Grid Sense
*Detects whether mains power is present using the phone itself and the home's own equipment.*
- **Charging edge**: a charging→discharging transition while stationary and plugged in for ≥10 minutes is a candidate outage; the reverse after a candidate is a candidate restoration. Native apps receive these events in the background.
- **Mains hum**: a 2-second microphone sample; energy at the 2nd and 3rd mains harmonics (100/150 Hz or 120/180 Hz) against the 80–200 Hz noise floor; per-device calibration; outputs present / absent / unknown. Mains harmonics are documented in battery-powered phone recordings (electric-network-frequency forensics).
- **Light flicker**: a 1-second camera sample of any lit surface; rolling-shutter banding and frame-mean periodicity reveal 100/120 Hz mains-driven lighting. Positive-only evidence.
- **Magnetic field (native, where sensor rate allows)**: 50/60 Hz field near wiring and appliances as a fourth positive-only sense.
- **Home equipment telemetry**: inverters and batteries (Sunsynk/Deye, Victron, Tesla Powerwall, Enphase, Huawei, Growatt, SolarEdge, Fronius via vendor cloud APIs or local Modbus/MQTT), UPS (Network UPS Tools), smart plugs with power monitoring (Matter), Home Assistant. Grid-loss events from these are authoritative for the home and feed the crowd map with higher confidence.
- **Fusion** (deterministic): mains-present when any positive sense exists and no negative sense contradicts; mains-absent only when ≥2 negative senses agree or one negative sense is corroborated by ≥k neighbouring reports or by home telemetry; otherwise unknown. Every verdict records which senses voted.
- **Privacy**: raw audio, video and magnetometer streams never leave the device and are never stored.
- **Failure**: denied permission → that sense is unavailable and the verdict degrades honestly; a verdict is never upgraded by absence of evidence.

### 7.3 Ember Map
*The crowd-built, utility-independent live map of outage and restoration, merged with every official source.*
- **Reports**: `{geohash6, minute, verdict, confidence, senses, deviceEpoch}` only when a verdict changes; randomised 0–120 s jitter and batching to survive the moment a whole city reports at once.
- **Aggregation**: per cell (≈1.2 km × 0.6 km) per 5-minute window; a cell is published only when ≥5 distinct devices reported in the last 30 minutes (k-anonymity); states dark / lit / mixed / coming back / unknown; sub-cell precision never shown.
- **Restoration detection**: ≥k charging-resumed edges in a dark cell within 10 minutes marks "coming back", typically ahead of the utility.
- **Official sources merged** through a provider framework: EskomSePush and municipal schedules (South Africa), YASNO/DTEK/Ukrenergo (Ukraine), K-Electric and LESCO (Pakistan), EDL (Lebanon), UNE (Cuba), LUMA (Puerto Rico), PowerOutage.us and utility outage APIs (US and Canada), ECG (Ghana), KPLC (Kenya), ZESCO (Zambia), ZESA (Zimbabwe), DisCo notices (Nigeria), discom apps (India), and a manual-schedule provider for anywhere else. Merge is deterministic, idempotent and commutative.
- **Restoration estimate**: a forecast with a confidence band, from the provider's promise, the crowd's current trajectory, and the utility's historical adherence for that area and stage; shown as "crowd says 22:50 (likely 22:30–23:40)".
- **Schedule-adherence scorecards** per utility and area: promised versus observed, published openly.
- **Satellite corroboration**: nightly comparison of dark cells with NASA Black Marble VNP46 near-real-time radiance drops; "confirmed by satellite" badges; cloud-aware.
- **Lit places**: hospitals, pharmacies, fuel stations, shelters, warming and cooling centres, charging points, water points, with generator and backup-power tags (OpenStreetMap, HIFLD, FEMA, national registries), combined with cell state and crowd "open and lit" pins and Business status pages.
- **Grid-stress gauge**: live public frequency feeds where they exist (UK NESO, Swissgrid/ENTSO-E and others as published), Eskom system status and stage changes, provider warnings; "stress rising, load shedding likely within 30 min". Shown only where a feed exists.
- **History and playback**: any cell's outage history, duration statistics, worst hours, comparison with neighbours' areas; 5-year retention of aggregated cells as open data.
- **Alerts**: outage detected in your cells, coming back, schedule changed, stress rising, neighbour needs help (see 7.13).
- **Failure**: offline → last map and schedule with timestamps; below k → unknown, never a guess.

### 7.4 Heliograph
*Communication when every radio is down.* Resurrects the 1867 Aldis signal lamp.
- **Optical channel**: torch (or screen) on-off-keyed symbols at 5 symbols per second; frames carry a sync preamble, sequence, an 8-bit payload (message code + roster id) and forward-error-correction parity; frames repeat; the camera receiver tracks the brightest periodic source, decodes and corrects. Tens of metres at night; window to window, courtyard to courtyard; night is the ideal condition.
- **Acoustic channel**: frequency-shift-keyed tones (audible or near-ultrasonic) carry the same codes room to room and through thin walls.
- **BLE channel** (native): background advertising and scanning for roster check-ins and codes; store-and-forward relay through any phone that later regains connectivity (epidemic routing with TTL and deduplication).
- **Wi-Fi Aware / local hotspot channel** (native, Android): higher-bandwidth local exchange of roster status and map snapshots when phones are within range.
- **LoRa gateway**: a Meshtastic node can act as a Heliograph gateway for a building or village; codes and roster status bridge to the mesh.
- **SMS and voice fallback**: codes as text to roster numbers; IVR callback with the roster's status (shares Afterglow Voice).
- **Message set**: SAFE · HELP · NEED-MEDS · NEED-WATER · NEED-HEAT · NEED-COOL · CHARGE-HERE · WATER-HERE · OPEN-HERE · COMING · ACK · custom short phrases in the paid tiers.
- **Roster and pairing**: QR pairing in person (mutual consent), phone-number invitations, household and building groups; roster ids are local to the pair, never global identifiers.
- **Ghost neighbours**: roster members render translucent until heard from, then solidify with time and channel.
- **HELP handling**: a HELP code alerts the roster and, if the sender opted in, nearby Lamplighters; Afterglow never claims to be an emergency service and always shows the official emergency number.
- **Prior art stated honestly**: hobby Morse-by-flashlight apps exist; Afterglow's contribution is the protocol, the receiver, the multi-channel roster and the integration with the map.
- **Failure**: a frame that fails error correction asks for a repeat; the app never displays a guess.

### 7.5 Cold Chain
*Physics instead of a timer, for every fridge, freezer, cooler and cold box.*
- **Appliance library**: fridge, freezer, chest freezer, fridge-freezer combo, cooler box, pharmacy fridge, vaccine cold box; capacity classes; fullness; door type; insulation class; measured time constants learned from the household's own events.
- **Thermal model**: lumped-capacitance curve toward ambient with appliance-specific time constants anchored to USDA guidance (full freezer ≈48 h frozen, half-full ≈24 h; fridge ≈4 h unopened) and refined by the household's own history; door-open events (one tap or BLE door sensor) add steps; ice load, frozen bottles and dry ice are modelled.
- **Sensors**: BLE thermometers and hygrometers (Govee, Inkbird, SensorPush, Xiaomi) replace the model with measurements where present and calibrate it where not.
- **Per-food discard times** from the USDA FoodKeeper dataset plus regional equivalents (FSA, FSANZ, national agencies): the 4-hour clock for perishables starts when the modelled or measured temperature crosses 4 °C, not at the outage; frozen items follow the ice-crystals rule; the app asks the user to look and records the answer.
- **Inventory**: the user's actual contents (voice or tap entry, barcode, receipt photo) so discard decisions are itemised with value.
- **Tombstones**: each compartment is a tombstone whose epitaph is the time-to-discard; it darkens as the clock runs.
- **"Can I eat the …?"**: deterministic lookup against FoodKeeper and the model, phrased with the citation attached.
- **Advice before the outage**: freeze water bottles, group items, set the freezer colder when a schedule window approaches.
- **Failure**: unknown appliance or no inputs → conservative defaults, labelled as such.

### 7.6 Medicine Budgets
*The label is the law.*
- **Validated formulary**: structured storage budgets (`unopened | in-use`, max temperature, max days, notes) extracted by an AI agent from openFDA `storage_and_handling` text and regional equivalents (EMA SmPC, SAHPRA, WHO vaccine stability data), checked by a validator agent against the label text, and approved by a licensed pharmacist into a version-controlled public table recording label version, approver and date. The app trusts only validated entries; anything else shows "ask your pharmacist" and lets the user photograph their label for the review queue.
- **Excursion clock**: consumes the label budget per hour only while the modelled or measured temperature is outside the refrigerated range and within the label's room-temperature allowance; beyond the allowance the clock stops and the app says "excursion beyond label: consult your pharmacist". It never says "safe" beyond the label.
- **Coverage**: insulins, GLP-1s, biologics, epinephrine, reconstituted antibiotics, eye drops, hormone therapies, vaccines and other cold-chain products for Business.
- **Medicine fridge and cold box**: medicines are placed in a Cold Chain compartment so one model drives both.
- **Reminders and refills**: dose reminders continue in the dark; pharmacy locator with "open and lit" status; share the excursion log with a pharmacist.
- **Disclaimers**: label-derived, pharmacist-reviewed table, not medical advice; the user's pharmacist always has the last word.
- **Failure**: not in the table → no clock, explicit message, review-queue submission.

### 7.7 Hours of Safety
*An indoor temperature forecast for a home with no power.*
- **Building model**: lumped thermal model with a time constant from NREL ResStock archetypes (building type, vintage, climate zone, insulation, floor) and regional archetype libraries (South African, Ukrainian and Pakistani housing stock), refined by the household's own measured events; hourly ambient forecast (Open-Meteo/NOAA/national services); internal gains (people, candles, gas heaters with CO guard).
- **Thresholds**: cold 15 °C default (stricter for infants, elderly, medically fragile; WHO-aligned), heat 32 °C or heat-index equivalent; personal risk profiles adjust them.
- **Outputs**: "hours of safety" and the clock time at which the threshold is crossed; an uncertainty band; a plan ("one warm room", layers, hydration, when to leave, where to go).
- **Destinations**: warming and cooling centres, shelters, lit public buildings, friends in lit cells, with transport considerations.
- **Validation**: against public outage indoor-temperature datasets and building-science literature; model error reported in the app's trust centre.
- **Failure**: no archetype → wide band, never a point estimate.

### 7.8 Candles — Energy Inventory
*Every store of energy is a candle; the plan says what to light.*
- **Stores**: phones, power banks, laptops (USB-C PD), tablets, car 12 V (usable fraction), EVs with vehicle-to-load, e-bike and scooter batteries, UPS, home batteries and inverters (live state of charge from telemetry), generators (fuel volume, consumption curves), solar (forecast yield from the weather).
- **Loads**: lights, routers, phones, medical devices (profiles for CPAP, oxygen concentrators, ventilators, feeding pumps, dialysis), fridges, pumps, heaters, fans; measured by smart plugs where present.
- **Plan**: a deterministic priority plan (medical, communication, light, food, comfort) with run-times per store, infeasible loads stated plainly, and "charge the phone from the laptop at 60%" style instructions; schedule-aware (how much to bank before a known window).
- **Generator management**: fuel log, runtime, maintenance intervals, cost per kWh, CO guard integration.
- **Failure**: unknown capacities → defaults from a public device table, flagged.

### 7.9 CO Guard and Home Safety
- **Generator and heater checklist** with the ward: the app refuses to mark a generator "set up" unless outdoors, ≥6 m from openings, exhaust away from windows; gas and paraffin heater ventilation rules; candle safety.
- **Smart CO alarm integration** (Matter and vendor APIs); CO symptoms explained in plain language; "leave now" escalation.
- **CHARGE-HERE sharing** so neighbours use one safely placed generator instead of several indoors.
- **Fire and water safety**: fridge thaw leaks, sump pumps, frozen pipes guidance by region.

### 7.10 Lamplighters and Guardians
*The community layer.*
- **Roster and guardians**: family and neighbours, check-in cadences, escalation when a dependent misses two check-ins.
- **Medical-device runtime calculator** with alerts at 50% and 25% and the nearest lit facility; registration helpers for utility medical-baseline and priority-restoration programmes.
- **Vulnerability-aware recruitment**: public aggregate data (HHS emPOWER in the US; partner-provided aggregates elsewhere) shows where electricity-dependent people are concentrated; Afterglow invites users there to become Lamplighters.
- **Lamplighter programme**: verified coordinators (municipal, NGO, residents' association), training modules, shift rotas during long outages, a Heliograph receiver station kit for buildings, printable lobby posters and door cards, badges and recognition, insurance guidance for volunteers.
- **Building mode**: caretaker view of a building's residents who opted in, lift and pump status, lobby display.
- **Privacy**: pairing is mutual; no one appears on anyone's board without consent; Lamplighters see only what residents chose to share.

### 7.11 Signal Finder
- **Towers**: cached OpenCelliD tower positions with compass bearing and distance; the native app reads signal strength and crowd-sources "signal here" cells (k-anonymised).
- **Outage severity**: FCC DIRS county-level cell-site outage percentages during US activations; regulator feeds elsewhere where published.
- **Advice**: higher ground, near windows, SMS over calls, Wi-Fi calling where a lit neighbour has backup power.
- **Satellite messaging awareness**: on phones with satellite SOS, the app surfaces the OS feature at the right moment.

### 7.12 Dependent Services
*What fails when the power fails, and when.*
- **Water**: building pump and tank model gives a water-pressure countdown; municipal water-supply status where published; water points on the map.
- **Lifts**: status by building (caretaker-reported or sensor), "do not use" notices, stair-assist requests through the roster.
- **Traffic and transit**: dark traffic signals and transit disruptions from municipal feeds where available; crowd-reported otherwise.
- **Payments and ATMs**: "cash only" and working-ATM pins from the crowd; banks' outage notices.
- **Fuel**: stations with power (pumps need electricity) from crowd and Business status pages.
- **Connectivity**: see 7.11.

### 7.13 Alerts and Notifications
- **Channels**: push (FCM/APNs), SMS, voice call, email, Heliograph codes, LoRa; delivered through whichever works, in the user's language, with the quiet-hours and night-vision rules (haptic first at night).
- **Types**: outage detected · coming back · schedule changed · stress rising · fridge threshold in 30 min · medicine budget 24 h left · hours of safety 2 h left · dependent missed check-in · HELP from roster · generator CO checklist · utility advisory · satellite confirmation · weekly summary.
- **Rules**: every alert cites its source; alerts are deduplicated across channels; critical alerts bypass do-not-disturb where the OS permits and the user consented.

### 7.14 Household and Profiles
- Multiple people per household, dependents and their devices, shared appliances and medicines, per-person risk profile (age, conditions, medical devices) stored on device and encrypted in the account when sync is enabled; cross-device sync; family invitations; data export and deletion.

### 7.15 Afterglow Business
- **Sites and roles**: multi-site, owner/manager/staff roles, audit trail.
- **Cold-chain compliance**: BLE sensors per fridge, continuous logs, WHO vaccine storage rules, pharmacy and food-safety (HACCP) report templates, excursion decisions with citations, pharmacist sign-off workflow.
- **Generator management**: fuel, runtime, maintenance, cost, CO guard, "generator running" status for customers.
- **Spoilage ledger**: itemised stock at risk with modelled or measured traces, discard decisions, values, photos; a claim package for insurers in their required formats.
- **Status page**: "open and lit" with hours and services; feeds the public map's lit places.
- **Staff alerts and shift planning** around schedule windows.
- **APIs**: export to accounting, insurance and regulators.

### 7.16 Afterglow Beacon
- **Live map** with crowd cells, provider overlays, satellite corroboration, lit places, dependent-services status, cell-site severity, vulnerable-population overlays (aggregates only).
- **History and analytics**: durations, frequency, worst-affected areas, schedule adherence per utility, equity analysis (who bears the outages), exportable.
- **Coordination**: Lamplighter programme management, coverage gaps, verified coordinators, shift rotas, resource requests.
- **Advisories**: publish an advisory to Afterglow users in selected cells, in their languages, with Voice delivery for feature phones.
- **Hospital and cold-chain network status** (with Business sites' consent).
- **Data access**: API, scheduled exports, open-data publication controls, role-based access, audit log.

### 7.17 Afterglow Voice
- **USSD**: dial a code for schedule, cell status, nearest lit place, roster SAFE/HELP, within channel limits (182 GSM-7 characters per screen, session timeouts), property-tested against every channel's constraints.
- **SMS**: codes and queries; store-and-forward resilient.
- **IVR**: a voice line that speaks the block's status and advisories from community-recorded phrase banks in languages without text-to-speech, assembled deterministically from validated phrases.
- **Shared engine** with the Ouija thin-channel skeleton; aggregator integrations (Africa's Talking, Twilio, Hubtel, Infobip); MNO short codes and revenue share.

### 7.18 Guidance Library and "Ask Afterglow"
- A curated, cited library: food safety, medicine storage, CO and fire safety, cold and heat health, generator and inverter safety, water safety, caring for dependents, children, pets, livestock, elderly; regionalised and translated; readable in the Night Shell and by voice.
- **Ask Afterglow**: questions answered only from the library, the user's own models and the validated tables, phrased by AI with citations; questions outside the corpus get "I don't know; here is who to ask".

### 7.19 History, Reports and Evidence
- Personal outage history; per-event report (timeline, utility promise versus reality, discards and reasons, energy used, check-ins); insurance-ready exports; community comparisons; the household's measured appliance and building constants; a trust centre explaining every model and its error.

### 7.20 Onboarding, Settings, Accessibility and Localisation
- **Onboarding** as in 6.1; "do it later" everywhere; progressive permissions with plain explanations.
- **Accessibility**: three luminance modes (Night, Dusk, Ember) because a red-only interface under the 8% night ceiling cannot reach a 4.5:1 ratio on black: Dusk meets WCAG 2.2 AA for large text everywhere, Ember meets AA for normal text everywhere, Night is a disclosed night-vision instrument mode (see `afterglow-design.md` §3); screen readers; dynamic type to 200% with reflow; no hue-dependent meaning; an amber variant for protanopia; voice control; low-literacy icon set; haptics; switch access; cognitive-load-aware emergency screens.
- **Localisation**: launch languages English, Afrikaans, isiZulu, isiXhosa, Sesotho, Ukrainian, Spanish, Portuguese, French, Arabic, Urdu, Hindi, Bengali, Hausa, Yoruba, Igbo, Swahili, Amharic, Tagalog, Haitian Creole **[my call]**, right-to-left support, regional units and date formats, community-recorded voice phrase banks for languages without TTS; translation drafts by AI, approval by native reviewers.
- **Settings**: region and mains frequency, providers, roster, appliances, home archetype, medicines, devices, integrations, alerts, privacy (what is shared, with whom), data export and deletion, account.

## 8. Non-goals and anti-goals

- **Not** a utility complaint channel, a social network, a news feed or an emergency service; it points to the official emergency number and never claims to replace it.
- **Not** a medical device; it cites labels and public guidance and never diagnoses.
- **Not** a replacement for the utility's schedule; it merges and corroborates.
- **Anti-goal:** any screen a user cannot read at 1 lux without ruining night vision.
- **Anti-goal:** any number without a source.
- **Anti-goal:** ads, dark patterns or paywalls on any safety feature, ever.
- **Anti-goal:** collecting or storing raw audio, video or precise location.

## 9. Public data and unusual resources

| Resource | Use |
|---|---|
| NASA Black Marble VNP46 (LANCE NRT) | Nightly corroboration of dark cells; lit districts |
| USDA FoodKeeper and regional food-safety agencies | Per-food storage and discard rules |
| openFDA drug labels, EMA SmPC, SAHPRA, WHO vaccine stability | Medicine excursion budgets (AI-proposed, pharmacist-approved) |
| HHS emPOWER and partner aggregates | Where electricity-dependent people are concentrated |
| NREL ResStock and regional housing archetypes | Building thermal constants |
| Open-Meteo, NOAA, national meteorological services | Ambient forecasts |
| UK NESO, Swissgrid/ENTSO-E, Eskom system status | Grid-stress gauge |
| Provider feeds (EskomSePush, YASNO/DTEK, K-Electric, EDL, UNE, LUMA, PowerOutage.us, ECG, KPLC, ZESCO…) | Schedules and official status |
| FCC DIRS and regulator equivalents | Cell-site outage severity |
| OpenCelliD | Tower positions |
| OpenStreetMap, HIFLD, FEMA, national registries | Hospitals, pharmacies, shelters, water points, generators |
| Inverter, battery, UPS, smart-plug, BLE sensor and CO alarm APIs | Home telemetry |
| GridWatch (Berkeley) and ENF forensics literature | Detection method |
| Afterglow Open Grid (published by us) | Aggregated, anonymised outage history for researchers and journalists |

## 10. Architecture at product scale

### 10.1 Targets **[my call]**
10 million monthly active users within two years; one million devices in a single metro reporting within five minutes when a city goes dark; 50,000 reports per second burst ingest; cell tiles served to every client within 60 seconds of a state change; 99.95% availability for tiles and alerts; app cold start under two seconds on a 2019 mid-range Android; crash-free sessions above 99.8%.

### 10.2 Clients
- **Shared core** (`packages/core`, TypeScript): sensing fusion, thermal models, codecs, schedule merge, k-anonymity aggregation (also runs client-side for local crowds), FoodKeeper and formulary rules, energy planner, provider adapters' parsers.
- **Native apps** (Expo/React Native with native modules **[my call]**): background battery events, torch, camera, microphone, magnetometer, BLE advertising and scanning, Wi-Fi Aware, widgets and complications, satellite-SOS hooks, local database, background sync.
- **Web app** (PWA): same core; sensing where browser APIs permit; the zero-install path from lobby posters and messaging links.
- **Offline-first**: every model runs on device; all state in a local database with conflict-free merge; sync is opportunistic, idempotent, batched and jittered.

### 10.3 Edge and ingestion
- Multi-region on AWS **[my call]**: af-south-1 (Cape Town), eu-central-1 (Frankfurt, serving Ukraine and the EU), us-east-1, ap-south-1 (Mumbai), me-south-1 (Bahrain, serving Lebanon and the Gulf); data residency per region.
- CloudFront with Lambda@Edge accepts tiny report payloads over HTTP/3, authenticates device tokens, rate-limits, and enqueues to Kinesis; the client never waits on aggregation.
- Aggregation streams (Kinesis Data Analytics/Flink) compute cell states per 5-minute window with k-anonymity enforced in code and tested as a property; results land in DynamoDB and are rendered as vector tiles cached at the edge with 60-second TTL so a city-wide event is served from cache.
- **Storm mode**: when ingest exceeds thresholds, clients are told to lengthen jitter and batch; tiles degrade to coarser windows; alerts are prioritised (HELP, medical, restoration) over informational ones.

### 10.4 Services
- Provider service (adapters, caching, adherence scoring); corroboration service (nightly Black Marble job); restoration-forecast service (batch models retrained weekly from adherence history; served as precomputed estimates per cell and stage); alerting service (SNS, FCM, APNs, SMS and voice via Twilio/Africa's Talking/Infobip/Amazon Connect); roster relay (end-to-end encrypted payloads; the server sees ciphertext and routing only); Business and Beacon APIs; Platform API gateway with keys and quotas; open-data publisher.
- Identity: anonymous device tokens with attestation (Play Integrity, App Attest); optional accounts (Cognito) for households, Business and Beacon roles; SSO for institutions.
- Storage: DynamoDB for live state, S3 for history and open data, Athena for analytics, OpenSearch for lit-places search; 30-day retention of per-device reports, 5-year retention of aggregated cells.
- AI services: Amazon Bedrock for label extraction proposals, translation drafts and citation phrasing, behind the boundaries in section 11.

### 10.5 Operations
- Infrastructure as code (Terraform), per-service CI/CD with path filters, canary deploys, feature flags (AppConfig), OpenTelemetry tracing, CloudWatch and alarms tied to the SLOs, cost budgets per region, chaos drills that simulate a metro-wide blackout at 3 a.m., a status page, and an on-call rotation.

### 10.6 Data model (summary; full in Appendix D)
Device · Report · Cell · CellState · Provider · Schedule · AdherenceScore · Household · Person · RiskProfile · Appliance · Compartment · Sensor · Inventory item · Medicine · Budget (validated) · ExcursionClock · BuildingArchetype · HoursOfSafetyPlan · EnergyStore · Load · EnergyPlan · Generator · Roster · Pairing · Message · Lamplighter · Programme · BusinessSite · Ledger · Claim · Advisory · Report (event) · OpenDataset.

## 11. Deterministic core and AI boundaries

**AI may**: propose structured medicine budgets from label text; draft translations and phrase-bank scripts; phrase deterministic lookups with citations; summarise an outage report; help onboarding ("which fridge do you have?") by proposing options from a photo; and, at development time, build the product through Kiro.

**AI may never**: decide a verdict (mains, discard, budget, hours of safety, restoration), publish a map cell, change a threshold, send an alert on its own authority, or answer outside the cited corpus.

Every AI proposal is logged with its inputs and the deterministic check that accepted or rejected it. A separate validator model and a human approver stand between any proposal and any table the product trusts.

## 12. Privacy, security, trust and safety, compliance

- **Privacy by architecture**: anonymous rotatable device identifiers; location leaves the device only as geohash-6; cells below k are never published; raw sensor streams never leave the device; roster messages are end-to-end encrypted; household data encrypted at rest with user-held keys when sync is on; 30-day retention of per-device reports; data export and deletion in two taps.
- **Security**: attestation, signed releases, certificate pinning, least-privilege IAM, secrets management, dependency scanning, annual penetration tests, a public vulnerability disclosure programme, red-team exercises against sensing spoofing and fake reports.
- **Trust and safety**: k-anonymity and corroboration blunt fake reports; rate limits and attestation blunt bots; HELP is routed only to consenting rosters and verified Lamplighters; mutual-consent pairing prevents surveillance; abuse reporting and blocking; no children's accounts.
- **Compliance**: GDPR (EU and Ukraine's alignment), POPIA (South Africa), CCPA and state laws (US), Pakistan and Nigeria data-protection acts; regional data residency; not a medical device (general wellness and information with label citations; no diagnosis); app-store health-content policies; WCAG 2.2 AA; emergency-communication disclaimers; open-source licences respected; medicine table governance published.
- **Ethics**: community-recorded voice banks are owned by their communities; vulnerability data is used only in aggregate and never to target individuals; open data is aggregated and k-anonymous; no advertising ever in emergency contexts.

## 13. Design system: the costume

- **Palette**: black background; red luminance tiers only; alerts by size, pulse and pattern.
- **Typography**: large, high x-height humanist sans with unambiguous numerals (Atkinson Hyperlegible or system equivalent **[my call]**); minimum 18 px body; tabular figures for clocks.
- **Motion**: slow, low-amplitude; candle flicker is the only ambient animation; reduced-motion respected.
- **Metaphors and what they encode**: **Candle** = remaining energy per store (wax drips mark predicted death). **Tombstone** = a cold compartment (epitaph = time to discard). **Ghost neighbours** = roster members not yet heard from (solidify on check-in). **Lantern map** = where mains exists (ember glow = coming back; satellite badge = confirmed). **Ward** = a refused unsafe action. **Séance** = the Heliograph screen. **Graveyard shift** = the night's hours-of-safety timeline. **Hearth** = the one warm room plan. **Bellwether** = the grid-stress gauge.
- **Sound and haptics**: functional only; the haptic grammar is part of the system.
- **Voice**: calm, plain, short sentences; never alarmist; always cites.
- **Print**: lobby posters, door cards and shelter boards share the system in high-contrast black on white for daylight.

## 14. Platforms and device matrix

| Platform | Scope |
|---|---|
| Android (native) | Full product including background sensing, BLE, Wi-Fi Aware, widgets, Wear OS complications |
| iOS (native) | Full product; background sensing within iOS limits; Live Activities; watchOS complications; satellite-SOS hooks |
| Web app (PWA) | Full product minus OS-restricted sensing; zero-install path |
| Feature phones | Afterglow Voice (USSD, SMS, IVR) |
| Smartwatches | Complications and critical alerts |
| Desktop web | Beacon and Business consoles |
| Home | Home Assistant integration, inverter/battery/UPS/smart-plug/BLE sensor/CO alarm integrations, LoRa gateway |
| Print | Posters, door cards, shelter boards |

## 15. Integrations and partnerships

- **Utilities and schedule providers**: adapters and data-sharing agreements; adherence scorecards offered back as a service.
- **Home energy**: inverter and battery vendors (Sunsynk/Deye, Victron, Tesla, Enphase, Huawei, Growatt, SolarEdge, Fronius), UPS vendors, Matter smart plugs, Home Assistant.
- **Sensors**: BLE thermometers and door sensors, smart CO alarms.
- **Telcos and aggregators**: short codes, zero-rating, SMS and voice (Africa's Talking, Twilio, Hubtel, Infobip), DIRS-style outage feeds.
- **Health**: pharmacists' associations for formulary review; pharmacies and clinics for Business; telehealth providers via the Platform API.
- **Insurers**: verified logs and claim packages; parametric spoilage products.
- **Public sector and NGOs**: municipalities, disaster agencies, Red Cross and Red Crescent societies, WHO cold-chain programmes.
- **Mesh**: Meshtastic community for LoRa gateways.
- **Research**: universities (GridWatch lineage) and the open-data programme.

## 16. Business model and pricing

**Principle: safety is free.** Grid Sense, Ember Map, Heliograph, Cold Chain, Medicine Budgets, Hours of Safety, CO Guard, Signal Finder, alerts and the Guidance Library are free forever, without ads.

| Tier | Who | Includes | Price **[my call]** |
|---|---|---|---|
| **Free** | Everyone | All safety modules; roster up to 5; 30-day history | $0 |
| **Plus** | Households that want more | Unlimited roster; full history and reports; smart-home and sensor integrations; inventory; custom Heliograph phrases | ≈$2/month, regionally priced (R30, ₴60, ₨300…) |
| **Family** | Households and guardians | Plus for up to 6 people; dependents; guardian escalation | ≈$4/month |
| **Business** | Shops, pharmacies, clinics | Multi-site, roles, compliance logs, generator management, ledger, claim packages, status page | ≈$15/site/month |
| **Beacon** | Municipalities, utilities, NGOs, insurers | Dashboard, overlays, analytics, coordination, advisories, API, SLAs | Annual licence by population or sites |
| **Platform** | Developers and partners | API and webhooks by volume; open data free | Usage-based |

Additional revenue: utility white-label and adherence analytics; insurer integrations; telco revenue share on Voice short codes; sensor and inverter affiliate partnerships; grants for Voice in low-income regions.

## 17. Launch, growth and geographic expansion

- **Wave 1**: South Africa and Ukraine (richest feeds, proven demand, strong inverter adoption), plus Spanish-language US (Puerto Rico, Texas).
- **Wave 2**: Nigeria, Pakistan, Lebanon, Ghana, Kenya, Zambia, Zimbabwe with Afterglow Voice and MNO partnerships.
- **Wave 3**: India, Bangladesh, Egypt, Iraq, the Philippines, the Caribbean, Latin America; storm-belt US and Canada; EU winter resilience.
- **Growth loops**: a lobby poster per building (Sipho), roster invitations (every SAFE invites a neighbour), Business status pages on the public map, Lamplighter programmes with municipalities, open data cited by journalists, the "restoration before the utility" screenshot.
- **Brand**: "the app you open when everything else is dark."

## 18. Kiro development strategy

Afterglow is built spec-first with Kiro across IDE, CLI, Web and Crew.

- **Specs (EARS) in `.kiro/specs/`**, one per module (20) plus `providers`, `simulator`, `platform-api`, `voice`, `beacon`, `business`: numbered requirements each mapped to a property; design documents carrying the deterministic-core/AI-judge architecture; tasks run in parallel waves with property tests enabled.
- **Property-based testing** (Kiro Correctness → fast-check for TypeScript, Hypothesis for Python services): fail-closed sensing on noise fixtures; order-independence of fusion and of door events; k-anonymity for any report multiset; codec round-trips under bounded bit flips; thermal models bounded and monotone; medicine clocks never exceed label budgets; schedule merge idempotent and commutative; restoration never declared below k; USSD screens never exceed channel budgets; every published cell has a satellite-or-crowd provenance.
- **Hooks**: File Save on theme tokens → luminance property; File Save on sensing code → fixture suite; File Save on the validated formulary → regenerate docs and tests; Pre Tool Use **deny** dialers, map publishing, torch control and provider writes outside test mode; Post Task Execution → codec fuzz and Playwright pixel scan of every route; Agent Stop → block completion while any invariant test is red.
- **Steering**: `night-vision.md`, `fail-closed.md`, `privacy-aggregation.md`, `label-only-medicine.md`, `offline-first.md`, `thermal-models.md`, `thin-channels.md`, `release-checklist.md`, with always/fileMatch/manual inclusion.
- **Custom agents**: Lamplighter (UI; tokens and Playwright only), Quartermaster (physics and clocks; test tools only), Cartographer (map, providers, tiles), Label Reader (proposes budgets; cannot write the validated table), Pharmacist Validator (checks; different model), Sensor Red Team (adversarial fixtures), Privacy Red Team (tries to de-anonymise cells), Night Watch (reviewer rejecting non-red pixels and unsourced numbers), Release Gate.
- **MCP servers**: openFDA, emPOWER (ArcGIS), frequency feeds, Black Marble, DIRS, OSM Overpass, provider sandboxes, Africa's Talking and Twilio sandboxes, Home Assistant, Playwright, the custom lux-meter MCP, the Simulator MCP.
- **Power**: `powers/grid-sense` (manifest, skills, MCP) so any Kiro project can ask "does this room have power?" or "is this cell dark?"; published on GitHub.
- **Crew app** (separate public repo): nightly satellite corroboration, fixture re-runs, formulary re-validation when labels change, provider health, adherence recomputation, Heartbeat only on regressions, a dashboard page.
- **Surfaces**: IDE for specs and PBT; CLI headless in CI for hooks and fuzz; Web for multi-repo changes (Crew app, Power); the write-up contrasts spec-driven work (codecs, thermal models, k-anonymity) with vibe coding (early UI exploration) and reports what PBT caught.

## 19. Quality, reliability and testing

- **Property-based tests** as above, run on every task completion and nightly with large example budgets.
- **Fixtures**: recorded and synthesised hum at 50 and 60 Hz in quiet, noisy and generator-adjacent rooms; flicker videos of LED, fluorescent, incandescent and DC lighting; Heliograph recordings at 5–40 m with ambient light levels; door-event sequences; provider feed snapshots including malformed ones.
- **Device lab**: low-end and mid-range Android models from each launch region; iOS range; dark-room rig with lux metering.
- **Field trials**: households in Johannesburg, Kyiv and San Juan before each wave; Business pilots with pharmacies; Lamplighter pilots with two municipalities.
- **Chaos and load**: simulated metro-wide blackout at 3 a.m. with a million synthetic devices; storm-mode verification; region failover.
- **Accessibility audits** per luminance mode (Dusk: AA large text; Ember: AA normal text; Night: dark-room legibility protocol) plus screen-reader transcripts; usability tests with elderly, low-vision and low-literacy participants in a blackout room.
- **Security**: pentests, red-team on spoofing and de-anonymisation, dependency and supply-chain scanning.
- **SLOs**: tiles and alerts 99.95%; alert delivery under 60 s; detection lead time versus provider feeds tracked per region; false-positive cell rate under 2% against satellite and provider truth; crash-free above 99.8%.

## 20. Success metrics and KPIs

- **Safety outcomes**: detection and restoration lead time versus utility feeds; discard decisions made with a source; medicine excursions avoided; hours-of-safety plans followed; HELP codes answered; CO checklist completions.
- **Reach**: monthly actives, actives during outage windows, Voice sessions, Lamplighters recruited per vulnerable-dense area, buildings onboarded.
- **Trust**: k-anonymity compliance 100%; false-positive rate; formulary review turnaround; trust-centre visits; open-data downloads and citations.
- **Business**: Plus and Family conversion, Business sites, Beacon licences, Platform API volume, revenue per region, cost per active user.
- **Hackathon**: a judge installs from the URL, turns off the lights, and completes the demo beats in under three minutes without instructions; every number on screen has a tap-through source.

## 21. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Perceived as a dark theme with candles | Red is the only mode; the lux meter on camera; Heliograph with airplane mode on; restoration before the utility |
| Hum detection unreliable in noisy rooms or filtered microphones | One vote of several; fails closed to unknown; calibration; home telemetry as the authoritative sense where present |
| Optical range and ambient light | Night is the use case; FEC and repeats; acoustic, BLE, Wi-Fi Aware, SMS and LoRa channels |
| OS limits on background sensing (iOS) | Native modules within limits; home telemetry; roster corroboration; honest capability display |
| Provider feeds change or vanish | Adapter framework, manual provider, crowd-only mode is first-class |
| Medical liability | Label-only budgets; pharmacist-approved table with public provenance; clear disclaimers; "ask your pharmacist" state |
| Crowd-map privacy and spoofing | k ≥ 5, geohash-6, attestation, corroboration, retention limits, open source |
| Thundering herd at outage onset | Jitter, batching, edge acceptance, cached tiles, storm mode, chaos-tested |
| Over-reliance in emergencies | Always shows the official emergency number; never claims to be an emergency service |
| Regional data-protection divergence | Data residency per region; privacy-by-architecture limits what exists to regulate |
| Community-voice ethics | Communities own their phrase banks; validated-only speech |

## 22. Hackathon presentation

The complete product described here is what Kiroween receives. The judged URL is the web app with the Simulator provider and a virtual neighbourhood so every module is demonstrable without a live outage; the native app is linked for installation; the Crew app and the Power are in their own public repos.

**Judge quick-start**: open the URL on a phone; tap "Demo night"; or scan the QR to pair a second phone for Heliograph; no account.

**Video (≤3 minutes)**
1. 0:00 Lights off on camera. The unplugged phone: "Listening… hum gone, flicker none, 14 neighbours lost power at 20:07." The block goes dark on the map before the schedule app updates. A lux meter reads under 1 lux off the screen.
2. 0:35 "1.4 to 3.5 billion people live like this. Every app tells them when. None helps them in the dark."
3. 0:50 Tombstones ("chicken 3 h 10 m", USDA citation), "home reaches 10 °C at 03:40", "insulin: 27 days left at modelled 22 °C, from the label", the candle plan, the water-pressure countdown.
4. 1:30 Heliograph: a second phone blinks across the room; the camera reads **"Mrs Dlamini: SAFE"**; airplane mode visible on both.
5. 1:55 Architecture: deterministic core, AI as proposer and validator, fail-closed, k-anonymity, storm mode.
6. 2:15 Kiro: an EARS requirement → its property → a real shrunken counterexample → the fix; a Pre Tool Use hook denying torch control in CI; the Crew heartbeat with last night's satellite corroboration; the Power installed in another project.
7. 2:45 Restoration: phones start charging on the next street; the embers glow before the utility says a word. URL, repos, Power, Crew app, open data.

**Costume Contest justification**: Appendix B. **Devpost text**: Appendix A. **Bonus prizes**: Best Startup (company and website), Best Kiro Crew App (repo), Best Demo, Blog, Social, and Ghost of Kiroween Past if eligible.

## 23. Decisions for the founder

Defaults are applied throughout; each of these changes the plan if answered differently.
1. **Company, brand and domain** for the Best Startup bonus and the store listings.
2. **Wave-1 order**: South Africa first, Ukraine first, or both in parallel; which opens the video.
3. **Pharmacist partner** for formulary approval (association, chain, or individual licensed pharmacists).
4. **Telco and aggregator partners** for Voice short codes in Wave 1 and 2 regions.
5. **Inverter vendor partnerships** to prioritise (Sunsynk/Deye for South Africa is the obvious first).
6. **App-store accounts and signing identities** (Google Play, Apple Developer) under the company.
7. **Kiro plan and credit level** beyond the hackathon's 4,000 credits, and whether Crew is enabled on the account.
8. **Kiroween 2025 registration** (claim Ghost of Kiroween Past if yes).
9. **Hardware for development and filming** (Android devices with Chrome, lux meter, dark room, local mains frequency).

## 24. Glossary

**Cell**: a geohash-6 area ≈1.2 km × 0.6 km. **Edge**: a charging-state transition. **ENF**: electric network frequency, the 50/60 Hz mains tone and its harmonics. **FEC**: forward error correction. **Hours of safety**: time until indoor temperature crosses a danger threshold. **k-anonymity**: a cell is shown only when at least k devices reported. **Lamplighter**: a volunteer who checks on paired neighbours. **Night Shell**: the red, luminance-budgeted interface layer. **Roster**: paired family and neighbours. **Storm mode**: the degraded-but-safe operating mode under extreme load. **Tombstone**: a cold compartment card. **Ward**: a refused unsafe action.

---

## Appendix A — Devpost "text description" (ready to paste)

**Afterglow is the only app you can read when the grid dies.** Between 1.4 and 3.5 billion people live with electricity they cannot count on. Every app tells them *when* the power will go. None helps them *while it is dark*.

Afterglow is designed for 1 lux. There is no light mode: a red, luminance-budgeted interface preserves your night vision and your battery. It then does three things no consumer product has done.

**It senses the grid from the phone itself.** Resurrecting UC Berkeley's GridWatch research, Afterglow fuses independent senses, the charging-state edge, mains hum heard by the microphone, light flicker seen by the camera, and your own inverter's telemetry, fail-closed, and aggregates them into a live, utility-independent outage *and restoration* map with k-anonymity, corroborated by NASA Black Marble night-lights. It often knows the power is back two streets over before the utility does.

**It turns light into a network.** When every radio is down, Heliograph blinks structured SAFE / HELP / NEED-MEDS codes from flashlight to camera across a courtyard, with error correction, resurrecting the 1867 signal lamp. Indoors, acoustic chirps and BLE carry the same codes. Ghost neighbours solidify as they check in.

**It replaces timers with physics.** Fridges and freezers are thermal masses; per-food discard times come from USDA FoodKeeper. Your home gets an indoor temperature forecast ("10 °C at 03:40") from building archetypes and the weather. Medicine clocks run only on budgets extracted from FDA labels, checked by a second agent and approved by a pharmacist.

Every verdict comes from deterministic code with a citation; AI only proposes, translates and explains. Built with Kiro: EARS specs for every module, property-based tests that caught real bugs, hooks that deny unsafe tools, steering that forbids any non-red pixel, a published Grid Sense Power, and a Kiro Crew app that corroborates the map with satellite data every night.

## Appendix B — Costume Contest justification

In Afterglow the horror aesthetic *is* the information architecture. Darkness is a safety and power feature (scotopic vision, OLED savings). The candle is a measured energy budget. The tombstones are thermal models with USDA epitaphs. The ghosts are neighbours who have not checked in. The lantern map is where mains power still exists. The ward is a refused unsafe action. The séance is a flashlight message decoded by a camera. Remove any spooky element and a measurement disappears with it.

## Appendix C — Requirements catalogue (EARS, representative; full set lives in `.kiro/specs/*/requirements.md`)

**Night Shell**: THE SYSTEM SHALL render every interactive element only with tokens from the night theme. WHERE ambient light is below 5 lux THE SYSTEM SHALL cap brightness at the platform minimum. THE SYSTEM SHALL NOT offer a light mode.

**Grid Sense**: THE SYSTEM SHALL declare mains-present only when at least one positive sense exists and no negative sense contradicts. THE SYSTEM SHALL declare mains-absent only when at least two negative senses agree, or one negative sense is corroborated by ≥5 neighbouring reports or by home telemetry. THE SYSTEM SHALL return unknown on silence or white noise. THE SYSTEM SHALL NOT store or transmit raw audio, video or magnetometer data.

**Ember Map**: THE SYSTEM SHALL NOT publish any cell with fewer than 5 distinct devices in the last 30 minutes. WHEN ≥5 charging-resumed edges occur in a dark cell within 10 minutes THE SYSTEM SHALL mark the cell "coming back". WHEN ingest exceeds the storm threshold THE SYSTEM SHALL instruct clients to lengthen jitter and SHALL prioritise HELP, medical and restoration alerts.

**Heliograph**: WHEN a frame fails forward-error-correction THE SYSTEM SHALL request a repeat and SHALL NOT display a guess. THE SYSTEM SHALL route HELP only to consenting roster members and verified Lamplighters. THE SYSTEM SHALL always display the official emergency number alongside HELP.

**Cold Chain**: IF the modelled or measured compartment temperature has exceeded 4 °C for 4 hours THE SYSTEM SHALL mark perishables discard regardless of event order. WHERE a BLE sensor is present THE SYSTEM SHALL prefer measurement over the model and SHALL show which is in use.

**Medicine Budgets**: THE SYSTEM SHALL NOT extend any medicine clock beyond its validated label budget. THE SYSTEM SHALL display "ask your pharmacist" for any product without a validated entry. THE validated table SHALL record label version, approver and date for every entry.

**Hours of Safety**: WHILE no archetype is selected THE SYSTEM SHALL display an uncertainty band, never a point estimate. WHEN the forecast crosses a threshold within 2 hours THE SYSTEM SHALL alert and present destinations that are lit.

**Candles**: THE SYSTEM SHALL state infeasible loads plainly and SHALL never schedule a medical load on a store that cannot sustain it for the forecast duration.

**CO Guard**: THE SYSTEM SHALL refuse to mark a generator "set up" unless the outdoor, distance and exhaust conditions are confirmed.

**Lamplighters**: THE SYSTEM SHALL NOT show any person on any board without that person's consent. THE SYSTEM SHALL use vulnerability data only in aggregate.

**Voice**: WHEN rendered USSD text exceeds the channel budget THE SYSTEM SHALL paginate. THE IVR SHALL compose audio only from validated phrases.

**Platform**: THE API SHALL answer location queries only at cell granularity and only for published cells.

## Appendix D — Data model (entities and key fields)

- **Device** (id rotatable, platform, attestation, region, mainsHz, capabilities) · **Report** (deviceEpoch, geohash6, minute, verdict, confidence, senses) · **Cell** (geohash6, region) · **CellState** (window, state, deviceCount, provenance: crowd/provider/satellite/telemetry) · **Provider** (id, region, adapter, health) · **Schedule** (area, windows, source, fetchedAt) · **AdherenceScore** (utility, area, stage, promisedVsObserved).
- **Household** (members, sharedAppliances, sharedMedicines) · **Person** (profile, riskProfile, devices, consentFlags) · **Appliance** (class, fullness, timeConstant, sensors) · **Compartment** (setpoint, model state) · **Sensor** (type, lastReading) · **InventoryItem** (food, value, discardRule) · **Medicine** (product, labelVersion) · **Budget** (validated entry) · **ExcursionClock** (consumed, limit, state).
- **BuildingArchetype** (type, vintage, climate, insulation, tau) · **HoursOfSafetyPlan** (threshold, crossingTime, band, destinations) · **EnergyStore** (type, capacityWh, soc) · **Load** (type, watts, priority) · **EnergyPlan** · **Generator** (fuel, runtime, maintenance).
- **Roster** (pairings) · **Pairing** (mutual, localIds, keys) · **Message** (code, channel, ciphertext, ttl) · **Lamplighter** (verification, area, shifts) · **Programme** (coordinator, members, rotas).
- **BusinessSite** (roles, fridges, generators, statusPage) · **Ledger** (items, traces, decisions) · **Claim** (package, insurerFormat).
- **Advisory** (cells, languages, channels) · **EventReport** (timeline, discards, energy, checkins) · **OpenDataset** (aggregates, k, retention).

## Appendix E — Platform API (public surface)

- `GET /v1/cells/{geohash6}` state and provenance for a published cell · `GET /v1/cells?bbox=` published cells in a box · `GET /v1/schedules?area=` merged schedule · `GET /v1/adherence?utility=&area=` scorecards · `GET /v1/places?bbox=&lit=true` lit places · `GET /v1/foodkeeper/{item}` discard rules · `GET /v1/formulary/{product}` validated budget with provenance · `POST /v1/reports` (device-attested) · `POST /v1/business/{site}/status` · `POST /v1/beacon/advisories` (role-gated) · webhooks for cell state changes and advisories · SDKs for JavaScript, Kotlin and Swift · the Grid Sense Kiro Power exposes the same queries to agents.

## Appendix F — Pricing table

See section 16. Regional price points are set by purchasing-power parity; safety features are free in every region without exception.
