import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENTED_TRIGGERS,
  HOOK_FIELDS,
  fakePnpm,
  hookByFile,
  loadHookFiles,
  matcherSelects,
  runHook,
  shellEvent,
  writeEvent,
} from './hooks.js';

/**
 * Spec: .kiro/specs/kiro-guardrails (bugfix.md, design.md, tasks.md).
 * Every guardrail the README says "blocks" is run here, as Kiro runs it, against
 * inputs it must block and inputs it must let through.
 */

const BLOCK = 2;
const ALLOW = 0;
const RUNS = { numRuns: 40 };

describe('KG-01 every hook file follows the documented schema', () => {
  const files = loadHookFiles();

  it('KG-01 there are hook files to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
  });

  for (const f of files) {
    it(`KG-01 ${f.file}: version v1, documented trigger and fields, timeout at hook level`, () => {
      expect(f.version).toBe('v1');
      expect(f.hooks.length).toBeGreaterThan(0);
      for (const h of f.hooks) {
        expect(DOCUMENTED_TRIGGERS.has(h.trigger), `trigger ${h.trigger}`).toBe(true);
        for (const k of Object.keys(h)) expect(HOOK_FIELDS.has(k), `field ${k}`).toBe(true);
        expect(['command', 'agent']).toContain(h.action.type);
        // Kiro reads only hooks[].timeout; a timeout inside action is silently ignored.
        expect(Object.keys(h.action).sort()).toEqual(
          h.action.type === 'command' ? ['command', 'type'] : ['prompt', 'type'],
        );
        if (h.timeout !== undefined) expect(Number.isInteger(h.timeout)).toBe(true);
      }
    });
  }
});

describe('KG-02 hooks use only what Kiro provides', () => {
  for (const f of loadHookFiles()) {
    it(`KG-02 ${f.file} does not depend on KIRO_WORKSPACE_ROOT (Kiro never sets it)`, () => {
      expect(JSON.stringify(f.hooks)).not.toContain('KIRO_WORKSPACE_ROOT');
    });
  }

  it('KG-02 test commands that can exceed Kiro’s 60 s default declare a longer timeout', () => {
    for (const file of ['agent-stop-gate.json', 'post-task-verify.json']) {
      expect(hookByFile(file).timeout ?? 60).toBeGreaterThanOrEqual(300);
    }
  });
});

describe('KG-03 shell guardrails see every shell tool', () => {
  const shellHooks = [
    'deny-dialers.json',
    'deny-publish-deploy.json',
    'deny-formulary-write-shell.json',
  ];
  for (const file of shellHooks) {
    it(`KG-03 ${file} selects execute_bash, execute_pwsh and control_bash_process`, () => {
      const m = hookByFile(file).matcher ?? '';
      expect(matcherSelects(m, 'execute_bash', ['shell', '@builtin'])).toBe(true);
      expect(matcherSelects(m, 'execute_pwsh', ['shell', '@builtin'])).toBe(true);
      expect(matcherSelects(m, 'control_bash_process', ['shell', '@builtin'])).toBe(true);
      expect(matcherSelects(m, 'read_file', ['read', '@builtin'])).toBe(false);
    });
  }

  it('KG-03 the formulary write guard selects every built-in write tool', () => {
    const m = hookByFile('deny-formulary-write.json').matcher ?? '';
    for (const tool of ['fs_write', 'fs_append', 'str_replace', 'delete_file', 'code']) {
      expect(matcherSelects(m, tool, ['write', '@builtin']), tool).toBe(true);
    }
  });
});

describe('KG-04 deny-publish-deploy blocks publishing and applying', () => {
  const hook = hookByFile('deny-publish-deploy.json');
  const blocked = [
    'npm publish',
    'pnpm publish --access public',
    'pnpm -r publish',
    'yarn publish',
    'cd infra/regional && terraform apply -auto-approve',
    'terraform -chdir=infra/regional apply',
    'tofu destroy',
    'eas submit -p ios',
    'eas update --branch prod',
  ];
  for (const c of blocked) {
    it(`KG-04 blocks: ${c}`, () => {
      const r = runHook(hook, shellEvent(c));
      expect(r.code).toBe(BLOCK);
      expect(r.stderr).toContain('deny-publish-deploy');
    });
  }
  for (const c of ['pnpm test', 'terraform plan -out=tfplan', 'git log --oneline', 'pnpm build']) {
    it(`KG-04 allows: ${c}`, () => {
      expect(runHook(hook, shellEvent(c)).code).toBe(ALLOW);
    });
  }

  it('KG-04 property: a publish chained after any harmless command is still blocked', () => {
    const safe = fc.constantFrom('pnpm test', 'git status', 'ls', 'echo ok', 'pnpm build');
    const sep = fc.constantFrom(' && ', '; ', ' || ');
    const bad = fc.constantFrom('npm publish', 'terraform apply', 'pnpm publish');
    fc.assert(
      fc.property(
        safe,
        sep,
        bad,
        (a, s, b) => runHook(hook, shellEvent(`${a}${s}${b}`)).code === BLOCK,
      ),
      RUNS,
    );
  });
});

describe('KG-05 deny-dialers blocks anything that can reach a real person', () => {
  const hook = hookByFile('deny-dialers.json');
  const blocked = [
    'curl -X POST https://api.twilio.com/2010-04-01/Accounts/x/Messages.json',
    'twilio api:core:messages:create --to +1555',
    'aws sns publish --phone-number +15555550100 --message hi',
    'aws sesv2 send-email --from-email-address a@b.c',
    'aws pinpoint send-messages --application-id x',
    'node -e "fetch(\'https://api.africastalking.com/version1/messaging\')"',
  ];
  for (const c of blocked) {
    it(`KG-05 blocks: ${c.slice(0, 60)}`, () => {
      expect(runHook(hook, shellEvent(c)).code).toBe(BLOCK);
    });
  }
  for (const c of ['pnpm test', 'aws sts get-caller-identity', 'grep -r twilio-like docs']) {
    it(`KG-05 allows: ${c}`, () => {
      expect(runHook(hook, shellEvent(c)).code).toBe(ALLOW);
    });
  }

  it('KG-05 the MCP guard matches dialling and SMS tools, not the project’s own tools', () => {
    const m = hookByFile('deny-dialers-mcp.json').matcher ?? '';
    expect(matcherSelects(m, '@sms/send_sms', ['@mcp'])).toBe(true);
    expect(matcherSelects(m, '@phone/dial_number', ['@mcp'])).toBe(true);
    expect(matcherSelects(m, '@afterglow/luminance_check', ['@mcp'])).toBe(false);
    expect(runHook(hookByFile('deny-dialers-mcp.json'), { tool_name: '@sms/send_sms' }).code).toBe(
      BLOCK,
    );
  });
});

describe('KG-06 only the pharmacist pipeline writes the validated formulary', () => {
  const write = hookByFile('deny-formulary-write.json');
  const shell = hookByFile('deny-formulary-write-shell.json');

  it('KG-06 a write tool cannot touch afterglow-formulary/validated', () => {
    for (const tool of ['fs_write', 'str_replace', 'delete_file']) {
      const r = runHook(write, writeEvent('afterglow-formulary/validated/insulin.json', tool));
      expect(r.code, tool).toBe(BLOCK);
    }
  });

  it('KG-06 proposals stay writable', () => {
    expect(runHook(write, writeEvent('afterglow-formulary/proposals/insulin.json')).code).toBe(
      ALLOW,
    );
  });

  it('KG-06 shell redirection into the table is blocked; reading it is allowed', () => {
    expect(runHook(shell, shellEvent('echo {} > afterglow-formulary/validated/a.json')).code).toBe(
      BLOCK,
    );
    expect(runHook(shell, shellEvent('cp x.json afterglow-formulary/validated/')).code).toBe(BLOCK);
    expect(runHook(shell, shellEvent('cat afterglow-formulary/validated/a.json')).code).toBe(ALLOW);
    expect(runHook(shell, shellEvent('pnpm test')).code).toBe(ALLOW);
  });

  it('KG-06 property: any file under validated/ is refused, any under proposals/ is not', () => {
    const name = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.json$/);
    fc.assert(
      fc.property(name, (n) => {
        return (
          runHook(write, writeEvent(`afterglow-formulary/validated/${n}`)).code === BLOCK &&
          runHook(write, writeEvent(`afterglow-formulary/proposals/${n}`)).code === ALLOW
        );
      }),
      { numRuns: 25 },
    );
  });
});

describe('KG-07 the prompt hook refuses secrets and adds context otherwise', () => {
  const hook = hookByFile('prompt-context.json');
  const secrets = [
    'deploy with AKIAABCDEFGHIJKLMNOP please',
    'my token is ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'password = hunter2hunter2',
  ];
  for (const s of secrets) {
    it(`KG-07 refuses a prompt containing ${s.split(' ')[1]}…`, () => {
      const r = runHook(hook, { hook_event_name: 'UserPromptSubmit', prompt: s });
      expect(r.code).toBe(BLOCK);
      expect(r.stderr).toContain('secret');
    });
  }
  it('KG-07 an ordinary prompt passes and gets the shared vocabulary', () => {
    const r = runHook(hook, { hook_event_name: 'UserPromptSubmit', prompt: 'add a freezer test' });
    expect(r.code).toBe(ALLOW);
    expect(r.stdout).toContain('unknown = fail closed');
    expect(r.stdout).toMatch(/Open spec tasks: \d+/);
  });
});

describe('KG-08 the Stop gate turns red tests into another turn', () => {
  const hook = hookByFile('agent-stop-gate.json');

  it('KG-08 red tests: exit 0 with a block decision that carries the failure', () => {
    const r = runHook(hook, { hook_event_name: 'Stop' }, { path: fakePnpm(1, 'FAIL CE-03') });
    expect(r.code).toBe(0);
    const decision = JSON.parse(r.stdout.trim()) as { decision: string; reason: string };
    expect(decision.decision).toBe('block');
    expect(decision.reason).toContain('FAIL CE-03');
  });

  it('KG-08 green tests: exit 0 and no decision, so the agent may stop', () => {
    const r = runHook(hook, { hook_event_name: 'Stop' }, { path: fakePnpm(0, 'all green') });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});

describe('KG-09 the session brief and post-task verify run from the project root', () => {
  it('KG-09 the session brief prints the latest catches and the uncommitted count', () => {
    const r = runHook(hookByFile('session-brief.json'), { hook_event_name: 'SessionStart' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Latest property-test catches');
    expect(r.stdout).toMatch(/Uncommitted paths: \d+/);
  });

  it('KG-09 post-task verify reports red loudly and exits non-zero', () => {
    const r = runHook(
      hookByFile('post-task-verify.json'),
      { hook_event_name: 'PostTaskExec' },
      { path: fakePnpm(1, 'typecheck failed') },
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('post-task-verify');
  });
});
