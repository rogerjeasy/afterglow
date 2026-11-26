# History, reports and the trust centre — Tasks

Built 2026-11-26 without new tests at the founder's request; all existing suites (core 304, app 147, browser 135 and the rest) stay green. Checked in the browser: an outage started and ended on the Hearth appears on You with its report.

- [x] Optional `endedAtMs` on outage events; optional `atMs` and `reason` on removals, validated when present (old logs stay valid) — HR-02, HR-03
- [x] `packages/core/src/household/history.ts`: `outageReports`, `historySummary` — HR-01, HR-04
- [x] Store writes the end time and removal time and reason; "I threw it out" on discard verdicts in Cold — HR-02, HR-03
- [x] `history/HistorySection.tsx`: list, report, share, text, JSON, print (print styles in `night-shell.css`) — HR-04..HR-06
- [x] `history/TrustCentre.tsx` — HR-07
- [ ] Community comparisons (needs cell history from the crowd service)
