# Field checks — Design

## Shape
- `packages/core/src/fieldcheck/thermometer.ts`: `compareReadings`, `insideBand`, `fitTau`, `measuredCrossing`, `safeTau`, `modelledCrossing`. Pure; reuses `thermal.temperatureAt` and `thermal.crossingTime`.
- `packages/core/src/fieldcheck/seance.ts`: `tallyTrials`.
- `packages/core/src/household`: `AppliancePayload.measuredTauMinutes?` (validated, FC-07) and `compartmentModel` choosing `min(default, measured)`.
- `apps/mobile/src/fieldcheck/store.ts`: runs in local storage (memory in the demo); `present.ts`: reports, words and CSV from the core; `FieldChart.tsx`: the chart and table.
- `apps/mobile/src/screens/FieldChecks.tsx` at `/app/field`, reached from the side menu, You, Cold ("Check it against a thermometer"), Plan (under the Graveyard Shift) and Séance ("Field test at a distance").

## Why a least-squares fit through the origin
The RC curve linearises exactly: `−ln((T_amb − T)/(T_amb − T_0)) = t/τ`. A line through the origin has one parameter, so three readings over an hour are enough to estimate it, and clean readings recover τ exactly (FC-02). Readings at or beyond the room temperature, or on the wrong side of the start, carry no τ and are left out of the fit; they still count in the comparison.

## Why only shorter
A household thermometer reads to about 0.1 °C, people open the door to read it, and one calm afternoon is not every outage. So a measurement is evidence that can only tighten a clock: the safe τ is the minimum of the default, the fit, and the τ implied by an observed crossing. The fridge window was already capped at USDA's 4 hours (HH-05); a measured τ can bring it earlier, never later.

## Why the start reading is not a reading
The run's start temperature anchors the model curve (`T_0`). Counting it as a reading would add a zero residual and flatter the error, so it is kept apart.

## Not in this slice
- Readings during a real outage changing the live clock directly (the household would need a reading event; for now the measured τ carries the evidence).
- Fitting the building τ from a night's readings into the hours-of-safety band (the comparison and the in-range count are shown; the band is not narrowed yet).
- Automatic Séance outcomes from the receiver; the tester taps what the phone showed.
