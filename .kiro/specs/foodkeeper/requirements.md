# FoodKeeper — Requirements

**Module:** `packages/core/src/foodkeeper` (pure rules engine) · data in `data/foodkeeper/`.
**Workflow:** Requirements-First (product-driven; the rules come from published USDA guidance).
**Spec name equals package name** per `structure.md`.

FoodKeeper answers "Can I eat the …?" during an outage. It combines two public USDA sources and the thermal model: the FSIS FoodKeeper product list (what the food is) and the FSIS outage guidance "Power Outages & Food Safety" (what to do with it). It returns a deterministic verdict with a citation. It never estimates beyond the source, and anything it cannot classify is treated as a perishable and flagged. Pure: no I/O; the snapshot and rules are injected.

## Glossary (this spec)
- **Snapshot** — the compact FoodKeeper product list (`data/foodkeeper/snapshot.json`), built from the vendored CC0 USDA file.
- **Outage rules** — `data/foodkeeper/outage-rules.json`: ordered rules mapping products to USDA outage classes, with the numeric thresholds.
- **Outage class** — `discardAfterFourHours`, `discardIfWarmEightHours`, `safeNoRefrigeration`, `safeHighAcid`.
- **Listed** — a product matched by an explicit rule. Unlisted products fall back to `discardAfterFourHours`.
- **Compartment kind** — `refrigerated` or `frozen`.
- **Verdict** — `ok | lookRequired | discard | unknown` (discriminated union).

## Requirements

### FK-01 — Classification is total and deterministic
**User story:** As a person, I want every food to get a rule-based answer that does not change between runs.
- THE SYSTEM SHALL classify every snapshot product into exactly one outage class by the first matching rule, or by the fallback.
- WHEN the same product and rules are classified twice THE SYSTEM SHALL return identical results.

### FK-02 — Safe classes are an explicit allowlist; the fallback is conservative
**User story:** As a person, I never want a food called safe because a rule was missing.
- IF no rule matches a product THEN THE SYSTEM SHALL classify it `discardAfterFourHours` and mark it `listed: false`.
- THE SYSTEM SHALL assign `safeNoRefrigeration` or `safeHighAcid` only through a rule that names a USDA list item.
- WHERE a product is unlisted THE SYSTEM SHALL say so in the verdict.

### FK-03 — Refrigerated perishable clock never exceeds the USDA source
**User story:** As a person, I want the chicken clock to stop at the USDA limit and earlier if the fridge warms faster.
- THE SYSTEM SHALL set the discard minute for a `discardAfterFourHours` product in a refrigerated compartment to `min(240, modelled crossing of 4.4 °C)` minutes after power loss.
- THE SYSTEM SHALL NOT report an `ok` verdict at or after that minute.
- WHERE the model never crosses 4.4 °C THE SYSTEM SHALL still stop at 240 minutes.

### FK-04 — Warm-held condiments follow the 50 °F / 8 h rule, never "safe forever"
- THE SYSTEM SHALL set the discard minute for `discardIfWarmEightHours` to the modelled crossing of 10 °C plus 480 minutes.
- WHERE the model never crosses 10 °C THE SYSTEM SHALL report `ok` with no discard minute and the note that the model does not expect it to reach 50 °F, not an unbounded "safe".

### FK-05 — Frozen food follows the ice-crystals rule and asks the user to look
**User story:** As a person with a thawing freezer, I want the app to tell me when to look, and to not guess.
- WHILE the modelled temperature is below 0 °C THE SYSTEM SHALL report `ok` for frozen perishables.
- WHEN the modelled temperature has reached 0 °C THE SYSTEM SHALL report `lookRequired`, asking whether ice crystals remain.
- WHEN the user answers `present` THE SYSTEM SHALL report `ok` with the refreeze note.
- WHEN the user answers `absent` and the modelled temperature has reached 4.4 °C THE SYSTEM SHALL report `discard`.
- WHEN the modelled temperature has reached 4.4 °C and no answer exists THE SYSTEM SHALL NOT report `ok`.

### FK-06 — Verdicts do not resurrect
- WHILE no user answer is supplied, FOR a refrigerated or frozen compartment, AS time since power loss increases, once the verdict has left `ok` it SHALL NOT return to `ok`.

### FK-07 — Search is deterministic and bounded
- THE SYSTEM SHALL return products ranked by match quality, ties broken by name then id, limited to the requested count.
- IF the query is empty or only whitespace THEN THE SYSTEM SHALL return no results.
- THE SYSTEM SHALL return only products that exist in the index.

### FK-08 — Unknown is a first-class answer
- IF the product is not found, or the time or state input is invalid (negative, non-finite, non-positive tau), THEN THE SYSTEM SHALL return `unknown` with a plain-language reason, never a verdict.

### FK-09 — Every verdict is cited and versioned
- THE SYSTEM SHALL attach to every verdict the USDA source title and URL, the rule id, the USDA list item, the rules version, the snapshot version and the thermal model version.

### FK-10 — Safe verdicts carry the sensory caveat
- THE SYSTEM SHALL attach "Never taste food to test it. If it has an unusual odour, colour or texture, throw it out." to every `ok` verdict, together with the rule's own caveat when present.

### FK-11 — Real-data conformance (application level)
- WHEN the real snapshot and rules are loaded THE SYSTEM SHALL classify all 661 products, classify chicken as `discardAfterFourHours`, butter and hard cheese as `safeNoRefrigeration`, and mayonnaise as `discardIfWarmEightHours`.

## Analysis
- **Source versus product doc (finding).** The product specification says the 4-hour perishable clock "starts when the temperature crosses 4 °C". The current USDA text says something different: the refrigerator keeps food safe for up to 4 hours **after power loss** (door closed), and perishables are discarded after 4 hours without power. FoodKeeper follows the USDA text: the cap is 240 minutes from power loss, and the modelled 40 °F crossing can only make it **earlier** (fail closed). With the corrected appliance constants both coincide at the 22 °C reference ambient.
- **Threshold correction.** The vendored thermal data used 5 °C as the refrigerated danger point. USDA says 40 °F (4.4 °C). Thermal appliance data is now `thermal-appliance-v2` with taus re-derived for 4.4 °C.
- **FoodKeeper has no outage fields.** The USDA file holds shelf life, not outage rules, so outage classes come from the curated `outage-rules.json`. Rules are first-match-wins, with exclusions listed before the safe allowlist.
- **Safe list is deliberately small.** Only items USDA names are `safe*`: whole fresh produce, fresh herbs and spices, flour, dried fruit, nuts, butter and margarine, hard and processed cheese, bread, muffins and fruit pies, and high-acid condiments. Cakes and opened shelf-stable goods are left unlisted because USDA's rule depends on a frosting or an opened-container condition the app cannot see.
- **Frozen flow.** USDA says frozen food is safe if ice crystals remain or if it has stayed at or below 40 °F. The model supplies the temperature; the user supplies the ice-crystal answer.
- **Data age.** The USDA feed's current data version is 128 (2018). The snapshot records this; it is the version USDA publishes.
- **Out of scope:** shelf-life (days in the fridge) answers; opened-container state; thermometer measurements (a later sensing wave); medicines, which are governed by `label-only-medicine.md` and a separate module.
