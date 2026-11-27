import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Loads the workspace's Kiro hooks and runs a hook's command exactly as Kiro does:
 * in the project root, with the event as JSON on standard input (kiro.dev/docs/hooks,
 * "Command actions run a shell command in your project root. The command receives
 * session context as JSON on STDIN."). Exit code 2 blocks PreToolUse and PreTaskExec.
 */

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const HOOKS_DIR = join(REPO_ROOT, '.kiro/hooks');

/** Triggers listed on kiro.dev/docs/hooks/types (2026-11-27). */
export const DOCUMENTED_TRIGGERS = new Set([
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStop',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PreTaskExec',
  'PostTaskExec',
  'PreCompact',
  'PostCompact',
  'PostFileCreate',
  'PostFileSave',
  'PostFileDelete',
  'Manual',
]);

/** Hook-level fields from the documented schema; anything else is a mistake. */
export const HOOK_FIELDS = new Set([
  'name',
  'description',
  'trigger',
  'matcher',
  'action',
  'timeout',
  'enabled',
  'confirm',
]);

export interface HookAction {
  readonly type: 'command' | 'agent';
  readonly command?: string;
  readonly prompt?: string;
  readonly [extra: string]: unknown;
}

export interface Hook {
  readonly name: string;
  readonly trigger: string;
  readonly description?: string;
  readonly matcher?: string;
  readonly action: HookAction;
  readonly timeout?: number;
  readonly [extra: string]: unknown;
}

export interface HookFile {
  readonly file: string;
  readonly version: string;
  readonly hooks: readonly Hook[];
}

export function loadHookFiles(): HookFile[] {
  return readdirSync(HOOKS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(HOOKS_DIR, file), 'utf8')) as {
        version: string;
        hooks: Hook[];
      };
      return { file, version: raw.version, hooks: raw.hooks };
    });
}

export function hookByFile(file: string): Hook {
  const found = loadHookFiles().find((h) => h.file === file);
  const hook = found?.hooks[0];
  if (!hook) throw new Error(`no hook in ${file}`);
  return hook;
}

export interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a command hook with an event on stdin. `path` is prepended to PATH (for fakes). */
export function runHook(
  hook: Hook,
  event: Record<string, unknown>,
  opts: { path?: string; env?: Record<string, string> } = {},
): RunResult {
  if (hook.action.type !== 'command' || typeof hook.action.command !== 'string') {
    throw new Error(`${hook.name} is not a command hook`);
  }
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...opts.env,
  };
  if (opts.path) env.PATH = `${opts.path}:${env.PATH ?? ''}`;
  const r = spawnSync('/bin/sh', ['-c', hook.action.command], {
    cwd: REPO_ROOT,
    input: JSON.stringify({ cwd: REPO_ROOT, session_id: 'guardrail-test', ...event }),
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** The PreToolUse event Kiro sends for a shell tool call. */
export function shellEvent(command: string): Record<string, unknown> {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'execute_bash',
    tool_input: { command },
  };
}

/** The PreToolUse event for a file write tool call. */
export function writeEvent(path: string, tool = 'fs_write'): Record<string, unknown> {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: { path, text: '{}' },
  };
}

/** A directory holding an executable fake `pnpm` that exits with `code`. */
export function fakePnpm(code: number, output = ''): string {
  const dir = mkdtempSync(join(tmpdir(), 'kiro-guardrails-'));
  const bin = join(dir, 'pnpm');
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(output)}\nexit ${code}\n`);
  chmodSync(bin, 0o755);
  return dir;
}

/** Kiro's selector rule: a matcher with no regex metacharacters is a tool id or tag. */
export function matcherSelects(matcher: string, toolId: string, tags: readonly string[]): boolean {
  if (!/[\\^$()[\]|+]/.test(matcher)) {
    const re = new RegExp(
      `^${matcher.replace(/[.]/g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    );
    if (re.test(toolId) || tags.some((t) => re.test(t))) return true;
  }
  return new RegExp(matcher).test(toolId);
}
