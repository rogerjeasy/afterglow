# Kiro guardrails — Tasks

Status: `[x]` done, `[ ]` planned.

- [x] 1. Write the harness that runs a hook as Kiro does (`tools/kiro-guardrails/src/hooks.ts`) — _KG-01..KG-09_
- [x] 2. Write the schema and selector checks and confirm they fail on the old hooks (24 failures) — _KG-01, KG-02, KG-03_
- [x] 3. Move `timeout` to the hook level in every command hook — _KG-01_
- [x] 4. Remove `$KIRO_WORKSPACE_ROOT`; fix `formulary-docs-regen` — _KG-02_
- [x] 5. Use the `shell` and `write` tags as matchers — _KG-03_
- [x] 6. Behaviour tests for every guard, with two fast-check properties — _KG-04..KG-09_
- [x] 7. Run the suite in `pnpm test` and CI (68 tests green)
- [ ] 8. Record one real block inside a Kiro agent session (needs Kiro credits)
- [ ] 9. Confirm whether the IDE honours a Stop block decision (docs disagree; see bugfix.md)
