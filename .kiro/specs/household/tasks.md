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

## Guardians and risk profiles (2026-11-26)

Built without new tests at the founder's request; the existing HH-11 expectation now includes `care: null` (the field comes only from its own event). Checked by evaluating the alerts for a person on a 1-hour rhythm: none at +0.5 h, high at +1.5 h, critical at +2.5 h; 18 °C offered for an older person.

- [x] `household.roster.care.set` event, validator and view field — HH-18
- [x] `household/care.ts`: `checkIns`, `careThresholdC`, `householdNeeds`; alert kind `missedCheckIn` with the escalation at two — HH-18
- [x] Séance edit mode: rhythm and needs per person; each row says when the next check-in is due or how many were missed; HomeSetup offers the care line — HH-18
- [ ] Escalating to a second guardian's phone (needs the end-to-end roster relay)
- [x] Medical device profiles in the Plan's load form (`plan/devices.ts`): CPAP, oxygen concentrators, home ventilator, feeding pump, dialysis cycler, powered wheelchair, nebuliser. A profile sets name, medical class and plug and shows the typical range; the watts always come from the person's label (EN-06 "never defaulted")
