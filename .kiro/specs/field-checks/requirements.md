# Field checks — Requirements

**Modules:** `packages/core/src/fieldcheck` (pure comparison, fit and tally) and `apps/mobile/src/fieldcheck` with the screen `apps/mobile/src/screens/FieldChecks.tsx` (`/app/field`).
**Workflow:** Requirements-First. The physics is the `thermal` spec's; this spec is about checking it against the world.

Afterglow's clocks come from models anchored to published guidance. A judge, a pharmacist or a worried parent will fairly ask: "why not just use a thermometer?" The answer is to use one. Field checks let a person test the numbers on a calm day, before they are needed: unplug the fridge and log a thermometer, turn the heating off for a night, or count how often Séance gets through at a measured distance. The app puts the readings beside the model, says how far off it was, and can learn the appliance's own time constant, but a measurement may only ever make a clock shorter. A check is a test, never an outage: it starts no outage clock and sends no crowd report.

## Glossary (this spec)
- **Run** — one field check: its setup at the start, the readings or attempts, and when it finished.
- **Reading** — a thermometer value with the minute it was taken, counted from the start of the run.
- **Residual** — measured minus modelled at a reading's minute; positive means warmer than the model said.
- **Fitted τ** — the time constant that best explains the readings (least squares on the linearised RC curve).
- **Safe τ** — the smallest of the default τ, the fitted τ, and the τ that puts the modelled crossing where the thermometer saw it.
- **Trial** — one Séance attempt: the message sent and what the watching phone showed.

## Requirements

### FC-01 — Readings are compared with the model at their own minute
**User story:** As a person with a thermometer, I want to see how far the model was from what I measured, in degrees.
- WHEN a run has usable readings THE SYSTEM SHALL compute, for each, the modelled temperature at that minute and the residual, and SHALL report the count, the mean absolute error, the largest absolute error and the mean residual (bias).
- WHERE the readings were taken from the model itself THE SYSTEM SHALL report no error and no bias; WHERE every reading is offset by d THE SYSTEM SHALL report a bias of d.
- THE SYSTEM SHALL say the bias in words ("warmer" or "colder than the model said") only when it is at least 0.1 °C.

### FC-02 — The appliance's own time constant is fitted, or said to be unknown
**User story:** As a person, I want Afterglow to learn how fast my own fridge warms, and to tell me plainly when it cannot.
- WHEN at least 3 usable readings lie strictly between the start and the room temperature, cover at least 60 minutes, and at least one has moved 0.5 °C or more from the start THE SYSTEM SHALL fit τ by least squares through the origin on `y = −ln((T_amb − T)/(T_amb − T_0))` against minutes.
- IF any of those conditions fails, or the start and the room are less than 1 °C apart, or the fit is not a positive finite number, THEN THE SYSTEM SHALL return `unknown` with the reason in words, never a guess.
- WHERE the readings were taken from the model itself THE SYSTEM SHALL recover its τ to within one part in a million.

### FC-03 — A measurement can only make a clock shorter
**User story:** As a person whose food is at stake, I want a thermometer check to make the clock more careful, never more generous.
- THE SYSTEM SHALL offer as the appliance's measured τ the safe τ: the smallest of the default, the fitted τ, and the τ that puts the modelled crossing of the danger line at the minute the thermometer reached it.
- THE SYSTEM SHALL never return a τ larger than the default, nor one that is not a positive finite number, whatever the readings.
- WHEN the thermometer reached the danger line THE SYSTEM SHALL make the model, with the safe τ, cross it no later than the thermometer did.
- WHERE the appliance holds the cold at least as well as the default THE SYSTEM SHALL keep the default and say why.

### FC-04 — The measured crossing is read from the readings
- THE SYSTEM SHALL find the first minute the readings reach a line in the direction of travel, interpolating between the reading before (the start counts as minute 0) and the first reading at or past it, and SHALL return none when no reading has reached it.

### FC-05 — Bad readings are dropped, never trusted
- THE SYSTEM SHALL drop a reading whose minute is not a finite number ≥ 0 or whose temperature is not a finite number from −60 °C to 80 °C, and SHALL never throw on one.
- WHERE a home is checked THE SYSTEM SHALL also count how many readings fall inside the range drawn by the archetype's fastest and slowest τ, allowing 0.1 °C at the edges (a thermometer's resolution).

### FC-06 — Séance attempts are counted, and a wrong message is counted on its own
**User story:** As the person testing Séance with two phones, I want a success rate at each distance, and to know at once if the receiver ever showed the wrong message.
- THE SYSTEM SHALL count each attempt as exactly one of: read correctly, a different message, asked for a repeat, nothing read; and SHALL report the success rate (none with no attempts) and the median time from send to a correct read.
- THE SYSTEM SHALL report a different message separately and say that it breaks HL-09.

### FC-07 — The measured τ reaches the live clock, and is never silent
- THE SYSTEM SHALL let the person apply the safe τ to the appliance it was measured on, as an optional `measuredTauMinutes` on the appliance's own event; an absent value, null, or a number that is not positive, finite and at most 100,000 minutes SHALL leave the default (a malformed event is ignored, HH-03).
- THE SYSTEM SHALL use the measured τ in every clock for that appliance only when it is smaller than the class default (FC-03), and SHALL name it in the appliance's sources ("time constant: measured with your thermometer").
- WHEN the appliance's setup is edited THE SYSTEM SHALL drop the measured τ, which belongs to the setup it was measured with, and SHALL let the person go back to the default at any time.

### FC-08 — A check is a test, kept on this device
- WHEN a run starts THE SYSTEM SHALL NOT start the outage clock or send a crowd report.
- THE SYSTEM SHALL keep runs on this device only (`afterglow.fieldcheck.v1`), and in the demo in memory only, so the demo saves nothing.

### FC-09 — Every run is shown as a chart, in words and as a table
- THE SYSTEM SHALL draw the model's curve (and, for a home, its range), the readings as dots and the danger line dashed, under the same luminance ceilings as every other screen, with HTML labels of at least caption size and no animation.
- THE SYSTEM SHALL say every number on the chart in words and offer the readings beside the model as a table.

### FC-10 — Results can be taken away
- THE SYSTEM SHALL export every reading and attempt as CSV, with the model's prediction beside each reading and times in UTC, and the runs as JSON, so results can be published with their method.
