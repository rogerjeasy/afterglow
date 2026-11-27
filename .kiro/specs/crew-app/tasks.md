# Afterglow Crew app — Tasks

Status: `[x]` done, `[ ]` planned. The backend was built in Kiro on 2026-11-25; the ids were renamed from `CA-` to `CW-` on 2026-11-27 because `cloud-accounts` already used `CA-`.

## Backend (Python, `afterglow-crew/backend`)
- [x] 1. Data model for checks, runs and outcomes (`model.py`) — _CW-01_
- [x] 2. Classification: unknown never passes, flaky is a finding, lost tests regress, exhaustive regression kinds (`classify.py`) — _CW-01..CW-04_
- [x] 3. Quiet notifications: only regressions are reported (`notify.py`) — _CW-05_
- [x] 4. Allow-listed check runner with argv splitting, timeouts and secret redaction (`runner.py`, `checks.json`) — _CW-06, CW-09_
- [x] 5. Bounded input to the backend — _CW-08_
- [x] 6. Weekly digest from stored runs (`digest.py`) — _CW-12_
- [x] 7. Hypothesis property tests for all of the above (95 tests)

## Crew app shell (not built)
- [ ] 8. `app.json` manifest per kiro.dev/docs/crew/apps/manifest
- [ ] 9. The night-watch agent and its skills (`regression-triage`, `evidence-notes`)
- [ ] 10. Nightly schedule running `checks.json`
- [ ] 11. Gateway signed-proxy verification in the backend — _CW-07_
- [ ] 12. Dashboard page that shows only measured results — _CW-10_
- [ ] 13. Evidence store that never edits the repository — _CW-11_
- [ ] 14. Move to its own public repository for the Best Kiro Crew App bonus
