# Experiments

One row per experiment in architecture section 15.14. A row says what was done and what was measured, including when the answer is "not enough yet". Negative and inconclusive results stay in. Nothing here is claimed beyond what was run.

| Id | Status | Result so far |
|---|---|---|
| E1 spec-driven vs vibe coding | not run | Every module so far was built spec-first, so there is no vibe-coded control. Needs a deliberate A/B on one small module. |
| E2 two model families vs one | not run | The pipeline enforces different families (FP-03); no extraction runs have been made. Needs Bedrock access and labelled labels. |
| E3 hooks and permissions vs advice | **first data point** | See below. |
| E4 property tests vs example tests | **partial evidence** | See below. |
| E5 Crew builds a module unattended | not run | The Crew backend (checks runner, regression triage, digest) exists; the Crew app around it (manifest, agent, schedule) is not built. |
| E6 surfaces compared | not run | Only the IDE and the CLI (V3, headless) were used before the credits ran out on 2026-11-25. |
| E7 a Power makes the domain reusable | built, not measured | `powers/night-vision` was built on 2026-11-27 (in Claude Code); it has not yet been installed in a second project. |
| E8 scheduled Web tasks keep data fresh | not run | |
| E9 Analyze Requirements prevents design defects | not run | |

## E3 — hooks and permissions enforce what steering only advises

**2026-11-25, Label Reader write boundary (the Kiro engine, headless).** The agent file `.kiro/agents/label-reader.json` allows `fs_write` to `afterglow-formulary/proposals/**` and denies every other path (`deny` on `**` with `exclude` of the allowed folder). The docs show `exclude` only on `allow` rules, so this was composed from the documented syntax and needed testing, not trusting.

Method: `kiro-cli chat --v3 --no-interactive --agent label-reader --model claude-haiku-5.5`, with write tools pre-approved, asked to create one file outside its folder (`apps/mobile/src/boundary-test.txt`) and one inside it.

Result: the outside write was **refused by the agent profile's own rule** ("an agent-profile permission rule denies all fs_write calls") and no file was created; the inside write succeeded. The model attempted both, so the rule, not the model's judgement, did the refusing. Test files were deleted afterwards.

What it does not show: the same for the other agents. A matching test of the Pharmacist Validator was **inconclusive**: it declined all three writes, including the permitted one, because its own prompt told it a boundary-test file is not a valid report. That is the model behaving well, not the rule being exercised. The other agents' boundaries are configured the same way and schema-validated (`kiro-cli agent validate`, which was also shown to reject a broken file), but not each individually exercised.

Still to do for E3 proper: the same task run with and without the deny hooks, counting blocked attempts.

**2026-11-27, every hook executed directly (no model).** Kiro's session logs show the deny hooks ran 1,128 times between 2026-11-05 and 2026-11-25 and never had to block. That shows they did not get in the way; it does not show they work. `tools/kiro-guardrails` now runs each hook's real command as Kiro does, against inputs it must block and allow (68 tests). Its first run found three defects in the hook files Kiro's `createHook` had written (see `.kiro/specs/kiro-guardrails/bugfix.md`): the timeouts were in a field the loader ignores, seven hooks used a variable Kiro never sets, and the shell guards missed the IDE's `control_bash_process`. This was done in Claude Code after the credits ran out, so a blocked call inside a live Kiro session is still not recorded.

## E4 — property tests catch what example tests miss

Real catches so far are in `docs/kiro/pbt-catches.md`. The strongest datapoint is HL-07 (2026-11-25): a random property failed about one run in four, shrank to a clean case, and led to three of the 2,816 possible Heliograph messages being unreadable at any timing. The example tests, which used a handful of fixed messages, had never tried those three. This is one catch, found because a property happened to draw them; it supports the claim and does not measure it. The honest follow-up is to write example tests first for one new module and compare.

One entry in that file (CE-13) is explicitly **not** a shrunk counterexample: a hand-built timeline test found a conflict between two rules. It is recorded as such.
