# History, reports and the trust centre — Requirements

Product description 7.19 ("personal outage history; per-event report ...; insurance-ready exports; ... a trust centre explaining every model and its error"). EARS notation.

- **HR-01** THE SYSTEM SHALL derive every outage from the household's own event log, in log order, so every device holding the same events shows the same history; an event belongs to an outage when it was logged between that outage's start and end.
- **HR-02** WHEN the power is marked back THE SYSTEM SHALL record the time it came back (`endedAtMs`); an older log without it SHALL show "time not recorded", never an estimate.
- **HR-03** WHEN food or a medicine is removed THE SYSTEM SHALL record when, and the reason when the person gave one ("I threw it out" on a discard verdict records `discarded`).
- **HR-04** Each outage report SHALL list its start, end and duration; doors opened (appliance, minutes, time); food and medicines thrown out or used, with reasons; check-ins (person, code, channel, time); energy drawn from each store whose charge was updated (from and to percent, watt-hours); and safety checks answered. Sections with nothing recorded SHALL say so.
- **HR-05** THE SYSTEM SHALL let the person share a report as text, save it as text or as JSON (`afterglow.outage-report.v1`), and print it as dark text on white with nothing else on the page.
- **HR-06** THE SYSTEM SHALL say that no schedule provider is connected instead of inventing a promised time to compare.
- **HR-07** The trust centre SHALL list each model that produces an answer (appliance clocks, hours of safety, medicine clocks, energy plan, Grid Sense, crowd map, Heliograph) with what it does, what it is anchored to, what it does not know, and the version taken from the code's own constants.
