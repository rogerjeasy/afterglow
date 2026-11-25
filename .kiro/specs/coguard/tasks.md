# CO Guard — Tasks

Status: `[x]` done, `[ ]` planned.

- [x] 1. Sources checked and recorded in the requirements (CDC, US CPSC), 2026-11-23
- [x] 2. The ward: four checks, current-yes rule, six-hour expiry, hard refusals, symptom advice, never "safe" (`ward.ts`) — _CO-01..CO-06_
- [x] 3. Property tests (13; seven mutations, all caught)
- [x] 4. Household answers (HH-16): latest per check, symptoms never stored
- [x] 5. Plan tab "Generator ward": the closed bar, a question per check with its source link, the refusal wording, the symptom alert, the "not an alarm" notice
- [x] 6. Browser tests: the ward stays closed on three of four, a "no" on distance is "not allowed", all four open it, no sentence says "safe", the symptom alert is not saved across a reload

## Planned
- [ ] 7. Gas and paraffin heater rules: add only when a source is checked
- [ ] 8. Smart CO alarm integration (Matter and vendor APIs; Wave 3): a real alarm reading is better evidence than a typed yes
- [ ] 9. CHARGE-HERE sharing so neighbours use one well-placed generator (needs the Séance code and a map)
- [ ] 10. Local emergency number by region (the screen says "for example 112 or 911" until a region is set)
- [ ] 11. A translated, plain-language leave-now screen for low literacy (design 13)
