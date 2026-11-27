# Session evidence: what was built in Kiro, and what was not

Judges should not have to take "built with Kiro" on trust, and should not be misled about the rest. This page gives the numbers from Kiro's own local session store for this workspace, and says plainly which part of Afterglow was built after the Kiro credits ran out.

The numbers come from `tools/kiro-guardrails/scripts/kiro-session-evidence.py`, which reads `~/.kiro/sessions/<workspace>/` and prints counts only (no prompts, replies or file contents). Run on 2026-11-27.

## The two periods

| | Kiro (IDE and CLI) | Claude Code |
|---|---|---|
| Dates | 2026-11-03 to 2026-11-25 | 2026-11-26 to the deadline |
| Why | the plan: build spec-first in Kiro | the Kiro credits were used up on 2026-11-25 |
| Commits | 106 | 67 so far |
| Lines added (excluding the lockfile and the FoodKeeper data) | about 40,900 | about 26,300 so far |
| Specs started | 17 of 29 | 12 of 29 |

The product, architecture and design documents in `docs/` were written on 2026-11-03, inside the submission period, outside Kiro and before the first Kiro session. They were the input the specs were written from.

### Built in Kiro (2026-11-03 to 2026-11-25)
The monorepo and tooling; the deterministic core (`events`, `cells`, `schedule`, `thermal`, `foodkeeper`, `formulary`, `energy`, `coguard`, `heliograph`, `restoration`, `fusion`) with its property tests; the Night Shell design system and the pixel scan; the web app's Hearth, Lantern, Séance, Cold and Plan tabs and onboarding; the formulary pipeline; the simulator; the Crew backend; the Terraform foundation; all 9 steering files, 13 hooks, 8 custom agents and 4 skills; `docs/kiro/experiments.md` and most of `pbt-catches.md`.

### Built in Claude Code (from 2026-11-26)
Following the same steering, specs and definition of done: the Wisp guide and tour (`guide`), the alerts module (`alerts`), the AWS account service and its deployment (`cloud-accounts`), the public crowd API, places and weather (`crowd-reports`), Voice for feature phones (`voice`), the guidance library and Ask (`guidance`), history and reports (`history-reports`), device features (`device-features`), the Business and Beacon consoles (`consoles`), the public website and app shell (`web-experience`), the hook fixes and their test harness (`kiro-guardrails`), the MCP server and the Night Vision Power (`mcp-and-powers`), and the amber colour variant (Night Shell NS-18 onward). Several of these specs say in their tasks that they were "built without new tests at the founder's request" to meet the deadline.

## Kiro sessions for this workspace

| Session | Dates (UTC) | Agent | Model | Prompts | Tool calls | Files written | Hook runs |
|---|---|---|---|---|---|---|---|
| 6b7ca90b | 11-03 23:06 to 23:12 | default (vibe) | claude-sonnet-5.5 | 2 | 19 | 7 | 0 |
| 01fb7263 | 11-05 11:25 to 13:49 | default (vibe) | auto | 15 | 202 | 78 | 9 |
| cd8a4174 | 11-05 13:57 to 17:49 | default (vibe) | claude-sonnet-5.5 | 10 | 382 | 110 | 9 |
| 7380ffa4 | 11-23 17:52 to 11-25 18:54 | default (vibe) | claude-sonnet-5.5 | 7 | 239 | 33 | 534 |
| 7f896148 | 11-25 19:06 to 22:14 | default (vibe) | claude-sonnet-5.5 | 3 | 345 | 56 | 602 |
| b7a66023 | 11-25 20:40 to 20:41 | `label-reader` (CLI, headless) | claude-haiku-5.5 | 1 | 2 | 2 | 5 |
| 420d25eb | 11-25 20:41 to 20:42 | `pharmacist-validator` (CLI, headless) | gpt-5.6-luna | 1 | 1 | 0 | 3 |

Totals: 7 sessions, 39 prompts, 1,190 tool calls, 1,162 hook runs, 180 permission prompts answered. All ran on autopilot with approval prompts for sensitive tools.

**Tools Kiro used:** `execute_bash` 620, `fs_write` 273, `read_file` 107, `str_replace` 68, `list_directory` 31, `grep_search` 20, `createHook` 15, `remote_web_search` 13, `get_diagnostics` 8, `control_bash_process` 6, `web_fetch` 6, `fs_append` 5, and one each of `create_artifact`, `load_resource`, `file_search`, `list_processes`, `get_process_output`.

**Hooks that ran:** Deny dialers 333, Deny formulary write (shell) 333, Deny publish and deploy 333, Deny formulary write (file tools) 129, Agent stop gate 29, Prompt context 3, Session brief 2. Every run completed; none had to block, because nothing the agent tried was forbidden. `tools/kiro-guardrails` now runs each guard against the inputs it must block (68 tests).

**Steering Kiro loaded:** the always-on files (`AGENTS.md`, `product.md`, `tech.md`, `structure.md` and the four invariants) on every turn where steering was recorded.

**Custom agents that ran:** `label-reader` (its write boundary was tested and held; see `experiments.md` E3) and `pharmacist-validator` (19 seconds, wrote nothing). The other six agents are configured and validated with `kiro-cli agent validate`, and have not been run. Two built-in `introspect` sub-agents ran.

**Spec files Kiro wrote:** requirements and tasks for `accounts`, `cells`, `events`, `foodkeeper`, `formulary`, `formulary-pipeline`, `household`, `restoration`, `schedule`, `thermal`; requirements, design and tasks for `grid-sense` and `night-shell`; requirements for `crew-app` and `simulator`. `heliograph`, `coguard` and `energy` were written through shell commands in Kiro sessions. All of them were written in vibe mode from the design documents, usually minutes before the code, not through Kiro's Spec mode.

## What this evidence does not show

- Kiro's Spec mode, task runner and Correctness (PBT) integration were not used: specs were written as files in vibe sessions. No spec task was run by Kiro's task runner, so `post-task-verify` never fired.
- The Stop gate's block decision was never triggered in a session, because the tests were green each time the agent stopped (29 runs).
- No MCP server or Power was used inside a Kiro session. Both were added on 2026-11-27 (`.kiro/settings/mcp.json`, `powers/night-vision`).
- The six unrun agents, the two-vendor formulary review (`experiments.md` E2) and the spec-versus-vibe comparison (E1) are untested claims, and are described as configuration only.
