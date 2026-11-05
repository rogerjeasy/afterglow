# FoodKeeper data: provenance

| File | What it is | Source | Licence |
|---|---|---|---|
| `foodkeeper.raw.json` | USDA FSIS FoodKeeper dataset, English JSON, **vendored unchanged** (631,800 bytes, 661 products, 25 categories, data version 128, modified 2018-09-06) | https://www.fsis.usda.gov/shared/data/EN/foodkeeper.json · catalog https://catalog.data.gov/dataset/fsis-foodkeeper-data | CC0 1.0 (public domain) |
| `snapshot.json` | Compact product list (id, names, category, keywords) produced from the raw file | `tools/data/build-foodkeeper-snapshot.mjs` | derived from CC0 data |
| `outage-rules.json` | Outage classes and thresholds, curated by hand from USDA's outage guidance | https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/emergencies/keep-your-food-safe-during-emergencies · https://www.govinfo.gov/content/pkg/GOVPUB-A110-PURL-gpo45056/pdf/GOVPUB-A110-PURL-gpo45056.pdf (retrieved 2026-11-05) | US Government work (public domain) |

## How the raw file was obtained

`fsis.usda.gov` returns HTTP 403 to scripted downloads (checked 2026-11-05, including with a browser user agent). The raw file is therefore a copy of the same CC0 USDA file as mirrored in a public GitHub repository (`TheAIMogul/blackout-box`, `data/foodkeeper.json`, blob `c49107aa7e62`), not a direct download from USDA.

- SHA-256 of the vendored file: `037df0d301126acd8a48824506f04d49d8be1a1144b81fa69e4170228dc2e91a`.
- **To verify or refresh:** open the USDA URL in a browser, save the file, run `shasum -a 256` and compare. If it differs, replace `foodkeeper.raw.json` and run `node tools/data/build-foodkeeper-snapshot.mjs`; the property and conformance tests will show whether any classification changed.

## What the data does and does not say

FoodKeeper lists storage times for 661 products. It has no power-outage fields. The 4-hour, 48-hour and 24-hour figures, the 40 °F limit, the ice-crystals rule and the 50 °F / 8 hour condiment rule come from the USDA outage guidance, and are encoded in `outage-rules.json` with the list item each rule cites.
