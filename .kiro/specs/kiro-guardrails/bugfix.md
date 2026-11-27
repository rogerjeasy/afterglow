# Kiro guardrails — Bugfix

**Package:** `.kiro/hooks/*.json`, tested by `tools/kiro-guardrails`.
**Workflow:** Bugfix spec (kiro.dev/docs/specs/bugfix-specs): current behaviour, expected behaviour, unchanged behaviour.
**Provenance:** found and fixed on 2026-11-27 in Claude Code, after the Kiro credits ran out. The defects were found by reading the hook files against the live Kiro docs and against Kiro's own session logs for this workspace. They were written by Kiro's `createHook` tool between 2026-11-05 and 2026-11-25.

## How it was found

Kiro's session store for this workspace records 29 Stop-gate runs and 333 runs of each shell guardrail between 2026-11-05 and 2026-11-25. Reading the hook files against kiro.dev/docs/hooks turned up three defects that the hooks' own unit checks (run with simulated input when they were written) could not see:

1. `timeout` sat inside `action`. Kiro reads only `hooks[].timeout` ("Timeout in seconds for command actions (default: 60)"), so the Stop gate's 600 s and post-task verify's 900 s were ignored and 60 s applied. The uncached property suite takes 64 to 85 s, so the gate would time out exactly when the code had changed.
2. Seven hooks began with `cd "$KIRO_WORKSPACE_ROOT"`. Kiro does not set that variable. Six still worked by accident (`cd ""` is a no-op and Kiro already runs commands in the project root); `formulary-docs-regen` became `cd /afterglow-formulary` and would fail.
3. The shell guardrails matched the tool id `execute_bash` only. In the IDE the agent also starts commands through `control_bash_process` (it did so 6 times in the logged sessions), which the `shell` tag covers and the id does not. The formulary write guard listed write tools by name and missed the CLI's `code` tool, which the `write` tag covers.

## Current behaviour (defect)

- KG-B1: WHEN a command hook declares `action.timeout` THEN Kiro applies the default 60 s and the declared timeout has no effect.
- KG-B2: WHEN `formulary-docs-regen` fires THEN its command changes to `/afterglow-formulary`, which does not exist, and fails.
- KG-B3: WHEN the IDE agent runs a shell command through `control_bash_process` THEN the publish, dialer and formulary shell guardrails do not run.
- KG-B4: WHEN the CLI agent edits a file through the `code` tool THEN the formulary write guard does not run.

## Expected behaviour (correct)

- KG-01: THE SYSTEM SHALL declare every hook's timeout at `hooks[].timeout`, use only documented triggers and fields, and keep `action` to `type` plus `command` or `prompt`.
- KG-02: THE SYSTEM SHALL NOT depend on environment variables Kiro does not set; WHEN a hook runs a test suite that can exceed 60 s THEN it SHALL declare a timeout of at least 300 s.
- KG-03: WHEN any built-in shell tool or write tool is called THEN the matching guardrail SHALL be selected (`shell` and `write` tags).

## Unchanged behaviour (regression prevention)

- KG-04: WHEN a command publishes a package, applies or destroys infrastructure, or submits an app THEN deny-publish-deploy SHALL CONTINUE TO exit 2 with a reason, including when the command is chained after harmless ones; plans, builds and tests SHALL CONTINUE TO pass.
- KG-05: WHEN a command or MCP tool could message or call a real person THEN deny-dialers SHALL CONTINUE TO exit 2; read-only cloud calls SHALL CONTINUE TO pass.
- KG-06: WHEN a write tool or a shell command targets `afterglow-formulary/validated/` THEN it SHALL CONTINUE TO be blocked; proposals and reads SHALL CONTINUE TO be allowed.
- KG-07: WHEN a prompt contains a secret THEN prompt-context SHALL CONTINUE TO refuse it in the IDE; otherwise it SHALL CONTINUE TO add the shared vocabulary and the open-task count.
- KG-08: WHEN tests are red at Stop THEN the gate SHALL CONTINUE TO exit 0 with `{"decision":"block","reason":…}` carrying the failure; WHEN green THEN it SHALL print nothing.
- KG-09: The session brief and post-task verify SHALL CONTINUE TO run from the project root, and post-task verify SHALL CONTINUE TO report red loudly.

## Not covered

- Whether the IDE honours a Stop block: kiro.dev/docs/hooks/types documents the block decision for the CLI; the IDE 1.0 hooks page lists Stop as "Can block? No". The gate is written to the CLI contract; in the IDE it reports.
- A blocked call inside a live Kiro agent session. No Kiro credits remained after 2026-11-25, so these hooks are exercised here exactly as Kiro runs them (same command, project root, documented event JSON on stdin), not through a model.
