# FoodKeeper — Tasks

Status: `[x]` done, `[ ]` planned.

## Wave 1.5 — Rules engine over the USDA data

- [x] 1. Vendor the real USDA FoodKeeper file (CC0) with checksum and provenance; build the compact snapshot
  - _Requirements: FK-01, FK-09_
  - _Files: `data/foodkeeper/foodkeeper.raw.json`, `data/foodkeeper/snapshot.json`, `data/foodkeeper/SOURCES.md`, `tools/data/build-foodkeeper-snapshot.mjs`_
- [x] 2. Curate the outage rules from USDA "Power Outages & Food Safety" (thresholds, classes, allowlist, fallback)
  - _Requirements: FK-02, FK-03, FK-04, FK-05_
  - _File: `data/foodkeeper/outage-rules.json`_
- [x] 3. Correct thermal appliance constants to the USDA 40 °F threshold (`thermal-appliance-v2`)
  - _Requirements: FK-03 (TH-07 anchor preserved)_
  - _Files: `data/thermal/appliance-tau.json`, `packages/core/src/thermal/archetypes.ts`_
- [x] 4. Types, classifier and index: `classifyProduct`, `buildFoodIndex`
  - _Requirements: FK-01, FK-02_
  - _Files: `packages/core/src/foodkeeper/{types,classify,index-build}.ts`_
- [x] 5. Search: `searchFood`
  - _Requirements: FK-07_
  - _File: `packages/core/src/foodkeeper/search.ts`_
- [x] 6. Assessment: `assessFood` (refrigerated clock, warm-held rule, frozen ice-crystals flow, unknown)
  - _Requirements: FK-03, FK-04, FK-05, FK-06, FK-08, FK-09, FK-10_
  - _File: `packages/core/src/foodkeeper/assess.ts`_
- [x] 7. Property tests FK-01..FK-10 (fast-check) on synthetic fixtures
  - _File: `packages/core/src/foodkeeper/foodkeeper.property.test.ts`_
- [x] 8. Real-data conformance test FK-11 in the app
  - _File: `apps/mobile/src/data/foodkeeper.test.ts`_

## Wave 5 — Surface (planned)
- [ ] 9. Cold screen: compartments as tombstones, inventory, "Can I eat the …?" (done in the app wave; see `.kiro/specs/cold-chain` when created)
- [ ] 10. Household inventory persisted through the `events` log
- [ ] 11. Thermometer measurements replace the model (sensing wave)
- [ ] 12. Regional equivalents (FSA, FSANZ, national agencies) as additional rule sets
