# Thermal — Tasks

Status: `[x]` done, `[ ]` planned.

## Wave 1.4 — RC model + archetypes (done)

- [x] 1. Types: `CompartmentState`, `DoorEvent`, `CrossingTime`, `PerishableItem`, `DiscardResult`, `BuildingCrossing`
  - _Requirements: TH-01, TH-02, TH-03, TH-04, TH-05, TH-06_
  - _File: `packages/core/src/thermal/types.ts`_

- [x] 2. RC model: `temperatureAt`, `crossingTime` (closed-form, fail-closed `never`), `applyDoorEvents` (order-independent gap-closing), `discardTime`
  - _Requirements: TH-01, TH-02, TH-03, TH-04_
  - _File: `packages/core/src/thermal/model.ts`_

- [x] 3. Real data: appliance tau anchored to USDA (4 h fridge / 48 h full / 24 h half freezer); building archetype tau bands from passive-survivability literature
  - _Requirements: TH-05, TH-07_
  - _Files: `data/thermal/appliance-tau.json`, `data/thermal/building-archetypes.json` (canonical); mirrored in `packages/core/src/thermal/archetypes.ts` to keep the core self-contained_

- [x] 4. Archetype layer: `compartmentFor`, `findArchetype`, `buildingCrossing` with uncertainty band + default fallback; model-version constants
  - _Requirements: TH-05, TH-06, TH-07_
  - _File: `packages/core/src/thermal/archetypes.ts`_

- [x] 5. Property tests TH-01..TH-07 (fast-check), incl. USDA-anchor reproduction and the default-band fallback
  - _Requirements: TH-01..TH-07_
  - _File: `packages/core/src/thermal/thermal.property.test.ts`_

## Wave 4/5 — Integration (planned)

- [ ] 6. Consume the ambient forecast series (Open-Meteo/NOAA adapter) for the building model instead of a constant ambient
  - _Requirements: TH-05_
- [ ] 7. Feed FoodKeeper per-food budgets into `discardTime` (the `foodkeeper` module supplies `PerishableItem`s)
  - _Requirements: TH-04_
- [ ] 8. Learn household tau from measured events and prefer it over defaults
  - _Requirements: TH-07_
