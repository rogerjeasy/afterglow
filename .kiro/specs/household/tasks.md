# Household — Tasks

Status: `[x]` done, `[ ]` planned.

## Cold chain slice (Wave 1.5 / 5.3 / 5.4)

- [x] 1. Export `minutesUntilAtLeast` and `applianceWindowMinutes` from `foodkeeper`; add `listArchetypes` to `thermal`
  - _Requirements: HH-05, HH-06_
- [x] 2. Event payload types, guards and constructors
  - _Requirements: HH-03_
  - _File: `packages/core/src/household/events.ts`_
- [x] 3. Pure view reducer over the event log (LWW per entity, append-only door openings)
  - _Requirements: HH-01, HH-02, HH-03_
  - _File: `packages/core/src/household/view.ts`_
- [x] 4. Derivations: compartment model, appliance headline, item assessments, hours of safety
  - _Requirements: HH-04, HH-05, HH-06, HH-07_
  - _File: `packages/core/src/household/derive.ts`_
- [x] 5. Property tests HH-01..HH-07
  - _File: `packages/core/src/household/household.property.test.ts`_
- [x] 6. App store: event log + localStorage adapter, device epoch, actions
  - _File: `apps/mobile/src/household/store.ts`_
- [x] 7. Cold screen, Hearth tiles, home setup
  - _Files: `apps/mobile/src/screens/{Cold,Hearth}.tsx`_

- [x] 7a. Medicines: events, view, `assessMedicines` over the validated formulary (HH-08..HH-10); Cold screen medicines section; Hearth medicine tile
  - _Files: `packages/core/src/household/{events,view,derive}.ts`, `packages/core/src/household/medicines.property.test.ts`, `apps/mobile/src/screens/{Cold,Hearth}.tsx`_
- [x] 7b. Graveyard Shift: `thermal.buildingBand` extracted (no behaviour change), `household.graveyardShift` (HH-17), Plan night axis
  - _Files: `packages/core/src/thermal/archetypes.ts`, `packages/core/src/household/{derive,graveyard.property.test}.ts`, `apps/mobile/src/screens/Plan.tsx`_
## Later
- [ ] 8. SQLite persistence replaces localStorage (Wave 2.2)
- [ ] 9. Time-resolved door model; learned household tau (thermal tasks 6 and 8)
- [ ] 10. Outdoor temperature from the forecast adapter (Wave 4)
