# Energy (Candles) — Tasks

Status: `[x]` done, `[ ]` planned.

## Wave 1.7 — Core
- [x] 1. Types, planning defaults, unit helpers (`types.ts`, `units.ts`) — _EN-08, EN-09_
- [x] 2. Planner: validation, priority order, best-fit single store, split with swaps, outlet rules, labelled defaults (`plan.ts`) — _EN-01..EN-08_
- [x] 3. Property tests EN-01..EN-09 (21 tests; also at 10x), including the strong "more charge never covers less" (EN-07), which holds
- [x] 4. Mutation check: eight regressions, six caught directly; two equivalent mutants (a single store is chosen only when it already suffices, and a load never receives more than it needs)
- [x] 5. Household events, view and `assessEnergy` (HH-14, HH-15)

## Surface
- [x] 6. Plan tab: candles with before and after levels, ordered loads with status and source store, defaults named, add forms that refuse a missing capacity or wattage — `apps/mobile/src/screens/Plan.tsx`
- [x] 7. Browser tests: empty state, refusal, covered and partly covered, AC medical with a USB bank, horizon persistence, pixel scan in three modes

## Planned
- [ ] 8. Schedule-aware advice: "bank before the window" from the provider schedule (needs Wave 4 adapters)
- [ ] 9. Measured draw from smart plugs and inverter telemetry (Wave 3)
- [ ] 10. A public device table for capacities and typical draws, with its source, so a user does not have to look them up
- [ ] 11. Solar yield from the weather forecast (Wave 4)
- [ ] 12. Generator fuel as a store (the helper `whFromFuel` exists; the screen offers capacity in Wh only, because a litres-per-kWh figure has no honest default)
