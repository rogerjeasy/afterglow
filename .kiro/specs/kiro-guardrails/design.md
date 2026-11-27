# Kiro guardrails — Design

## Root cause

All three defects come from the same place: the hooks were written by Kiro's own `createHook` tool, which writes `action.timeout`, while the hook loader reads `hooks[].timeout`. The `$KIRO_WORKSPACE_ROOT` prefix was carried over from an early draft and never failed loudly, because `cd ""` succeeds. The tool-id matchers predate the V3 tag selectors. Nothing executed the hook files themselves, so nothing could notice.

## Fix

- Move `timeout` to the hook level in all 12 command hooks (`agent-stop-gate` 600 s, `post-task-verify` 900 s, file-save checks 120 s, guards 10 s).
- Delete every `cd "$KIRO_WORKSPACE_ROOT"` prefix; `formulary-docs-regen` uses `cd afterglow-formulary`.
- Matchers: `shell` for the three shell guards, `write` for the formulary write guard. Both are documented tags (kiro.dev/docs/tools, "Tool categories": `shell` includes `control_bash_process` in the IDE; `write` includes `code`).

## Test harness (`tools/kiro-guardrails`)

`runHook(hook, event)` runs the hook's command with `/bin/sh -c` in the repository root and writes the event JSON to standard input, which is how Kiro runs command hooks. Events use the documented fields (`hook_event_name`, `tool_name`, `tool_input`, `prompt`). A fake `pnpm` on `PATH` makes the Stop gate and post-task verify see red or green without running the real suites.

## Properties

| Id | Property | Kind |
|---|---|---|
| KG-01 | every hook file parses and uses only documented triggers, fields and action keys | schema, per file |
| KG-02 | no hook references `KIRO_WORKSPACE_ROOT`; slow hooks declare ≥ 300 s | schema |
| KG-03 | shell guards select `execute_bash`, `execute_pwsh`, `control_bash_process`, not `read_file`; the write guard selects `fs_write`, `fs_append`, `str_replace`, `delete_file`, `code` | selector rule |
| KG-04 | any harmless command chained with a publish or apply is blocked | fast-check |
| KG-06 | any file name under `validated/` is refused, the same name under `proposals/` is allowed | fast-check |
| KG-05, 07, 08, 09 | examples: block and allow cases, Stop decision JSON, brief output | example |

## Proof that the tests see the bug

Run against the hook files as committed before the fix (`git show 03da87a:.kiro/hooks/…`), the suite fails 24 of 68 tests: all twelve KG-01 schema checks, all eight KG-02 checks and all four KG-03 selector checks. The behaviour tests (KG-04 to KG-09) pass on both versions, which is the "unchanged" half of this spec.
