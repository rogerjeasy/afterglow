# Field checks — Tasks

Status: `[x]` done, `[ ]` planned.

- [x] 1. `fieldcheck/thermometer.ts`: comparison, band count, τ fit, measured crossing, safe τ — FC-01..FC-05
- [x] 2. `fieldcheck/seance.ts`: the trial tally — FC-06
- [x] 3. Property tests `packages/core/src/fieldcheck/fieldcheck.property.test.ts` (10): FC-01 ×2, FC-02 ×2, FC-03 ×2, FC-04, FC-05 ×2, FC-06
- [x] 4. `measuredTauMinutes` on the appliance event, its guard and `compartmentModel` choosing the smaller τ; tests `FC-07` ×2 in `household.property.test.ts`
- [x] 5. Store `setMeasuredTau`, the source chip "time constant: measured with your thermometer" — FC-07
- [x] 6. Run store (device, or memory in the demo), reports and words, CSV and JSON — FC-08, FC-10
- [x] 7. `/app/field`: start a fridge or freezer check, a night check and a Séance count; add readings; finish; delete with a second tap; "Use what I measured" and "Go back to the default" — FC-01..FC-10
- [x] 8. Chart with dots, curve, range and line, plus the table — FC-09
- [x] 9. Links from the side menu, You, Cold, Plan and Séance
- [x] 10. Pixel scan of `/app/field` empty and with seeded runs, three modes, red and amber (`e2e/pixel-scan.e2e.ts`) — FC-09
- [ ] 11. Run real checks and publish them in `docs/field/` with the method: a fridge, a freezer, a night, Séance at 1, 3 and 5 m
- [ ] 12. A reading event during a real outage that can end the window at once
- [ ] 13. Narrow the building band from a measured night
