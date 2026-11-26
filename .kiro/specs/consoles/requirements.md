# Business and Beacon consoles, cell history and Ask phrasing — Requirements

Product description 7.14 (Business), 7.16 (Beacon), 7.3 and 7.19 (history and community comparisons), 7.18 and 7.20 (Ask, AI only phrasing library lookups). EARS notation.

## Identity
- **CO-01** THE SYSTEM SHALL serve the consoles from their own API behind the same Cognito JWT authorizer as the vault, and SHALL take identity only from the verified token: `sub` owns business data; membership of the `beacon` group, granted only by an administrator, allows advisories.

## Business (BC)
- **BC-01** A signed-in account SHALL manage up to 20 sites: name, kind (pharmacy, clinic, shop, shelter, community, other), public position, and up to 20 fridges with a safe range (default 2–8 °C for vaccines, WHO).
- **BC-02** THE SYSTEM SHALL log fridge readings and generator events (start, stop, refuel with litres) per site, kept 400 days, and SHALL refuse readings for a fridge the site does not have.
- **BC-03** WHEN a site publishes its status (open or closed; mains, backup or no power; a short note) THE SYSTEM SHALL show it publicly in the site's cell for 24 hours unless renewed, and SHALL remove it when the site moves or is deleted.
- **BC-04** The console SHALL show each fridge's excursions outside its range and produce a cold-chain report (readings, excursions with their duration, generator log) to print or save.
- **BC-05** Public texts SHALL be printable, single-spaced and bounded.

## Beacon (BE)
- **BE-01** The Beacon console SHALL show a region of up to 7 × 7 cells: the live crowd state, each cell's outage history over 1, 7 or 30 days, and the hospitals, clinics and pharmacies in the centre with their cell's power.
- **BE-02** WHEN a Beacon member publishes an advisory (title up to 80, body up to 240 characters) to up to 49 cells THE SYSTEM SHALL store it publicly per cell for 3 days, push it to each cell's followers, and record who sent it in an audit log.
- **BE-03** The console SHALL export the region's state and history as CSV.

## History and comparisons (HC)
- **HC-01** WHEN a report changes or confirms a cell's published state THE SYSTEM SHALL record that state for its 5-minute window, 30 days; unknown is never recorded.
- **HC-02** A window's state SHALL hold until the next window for at most 15 minutes, so a gap in reports is never counted as an outage; the current minute counts.
- **HC-03** Phones that are sure SHALL confirm every 10 minutes (CR-16), so a long outage stays on the map.
- **HC-04** The app SHALL compare the person's cell with its neighbours: outage hours, number of outages and the longest, over 7 or 30 days.

## Ask phrasing (GL-07)
- **GL-07** WHEN the library answers a question THE SYSTEM MAY have Claude (Haiku 4.5, EU inference profile, temperature 0, at most 220 tokens) restate the retrieved passages, under instructions to add nothing; THE SYSTEM SHALL drop any phrasing containing a number that is not in the passages, SHALL rate-limit it (6 a minute per requester bucket, 120 in all), and SHALL always return the passages and sources. Questions outside the library SHALL never reach the model.

## Schedules and localisation
- **SC-01** THE SYSTEM SHALL accept a manual schedule (the windows a utility announced, typed or pasted by the person), merge it with the core's deterministic schedule merge, and show the next window and, after an outage, how the utility's promise compared with what happened.
- **LO-01** THE SYSTEM SHALL keep the app's words in per-language message catalogues with English as the fallback, follow the phone's language, and let the person choose it.
- **BC-06** THE SYSTEM SHALL key each public status record by a hash of its owner's `sub` and the site id, and SHALL make every write and delete of it conditional on that owner, so no account can overwrite or remove another account's public status even with the same site id in the same cell. (Security review 2026-11-26; tested live with two accounts.) Known limit: a business's identity is not verified; verified badges need an offline check.
