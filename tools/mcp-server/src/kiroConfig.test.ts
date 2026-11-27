import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_TOOLS, NIGHT_VISION_TOOLS } from './server.js';

/**
 * The Kiro side (MCP-11, MCP-12): the workspace MCP config, the Night Watch
 * wiring and the Power package are in the documented shapes, and the shipped
 * Power server runs from its own folder. `kiro-cli agent validate` is the
 * authority for the agent schema; these tests pin what this spec decided.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const POWER = path.join(REPO, 'powers', 'night-vision');
const json = (p: string): Record<string, unknown> => JSON.parse(readFileSync(p, 'utf8'));

type Server = { command: string; args: string[]; autoApprove?: string[]; type?: string };

describe('Kiro configuration', () => {
  it('MCP-11 the workspace mcp.json registers the server and auto-approves only its read-only tools', () => {
    const cfg = json(path.join(REPO, '.kiro', 'settings', 'mcp.json')) as {
      mcpServers: Record<string, Server>;
    };
    expect(Object.keys(cfg)).toEqual(['mcpServers']);
    const server = cfg.mcpServers.afterglow as Server;
    expect(server.command).toBe('node');
    expect(server.args).toEqual(['tools/mcp-server/dist/index.mjs']);
    expect([...(server.autoApprove ?? [])].sort()).toEqual([...ALL_TOOLS].sort());
    expect(server.autoApprove).not.toContain('*');
  });

  it('MCP-11 Night Watch sees only the three luminance tools and stays read-only', () => {
    const agent = json(path.join(REPO, '.kiro', 'agents', 'night-watch.json')) as {
      tools: string[];
      includeMcpJson: boolean;
      mcpServers: Record<string, Server>;
      permissions: { rules: { capability: string; match?: string[]; effect: string }[] };
    };
    const mcpTools = agent.tools.filter((t) => t.startsWith('@'));
    expect(mcpTools).toEqual(NIGHT_VISION_TOOLS.map((t) => `@afterglow/${t}`));
    expect(agent.includeMcpJson).toBe(false);
    expect(agent.mcpServers.afterglow?.args).toEqual(['tools/mcp-server/dist/index.mjs']);
    const mcpAllow = agent.permissions.rules.filter((r) => r.capability === 'mcp');
    expect(mcpAllow).toEqual([
      {
        capability: 'mcp',
        match: NIGHT_VISION_TOOLS.map((t) => `afterglow/${t}`),
        effect: 'allow',
      },
    ]);
    expect(agent.permissions.rules).toContainEqual({ capability: 'fs_write', effect: 'deny' });
  });
});

describe('night-vision Power', () => {
  it('MCP-12 plugin.json and mcp.json follow the Agent Plugins format the Kiro docs describe', () => {
    const plugin = json(path.join(POWER, 'plugin.json'));
    expect(plugin.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    expect(plugin.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof plugin.description).toBe('string');
    expect((plugin.author as { name: string }).name.length).toBeGreaterThan(0);
    expect((plugin.keywords as string[]).length).toBeGreaterThan(3);

    const mcp = json(path.join(POWER, 'mcp.json')) as {
      $schema: string;
      mcpServers: Record<string, Server>;
    };
    expect(Object.keys(mcp).sort()).toEqual(['$schema', 'mcpServers']);
    expect(mcp.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
    const server = mcp.mcpServers['night-vision'] as Server;
    expect(server).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['${PLUGIN_ROOT}/server/night-vision-mcp.mjs'],
    });
    expect(existsSync(path.join(POWER, 'server', 'night-vision-mcp.mjs'))).toBe(true);
  });

  it('MCP-12 every skill has SKILL.md front matter whose name matches its folder', () => {
    const skills = readdirSync(path.join(POWER, 'skills'));
    expect(skills).toContain('night-vision-gate');
    for (const skill of skills) {
      const text = readFileSync(path.join(POWER, 'skills', skill, 'SKILL.md'), 'utf8');
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
      expect(front).toMatch(new RegExp(`^name: ${skill}$`, 'm'));
      const description = /^description: (.+)$/m.exec(front)?.[1] ?? '';
      expect(description.length).toBeGreaterThan(20);
      expect(description.length).toBeLessThanOrEqual(1024);
    }
    const steering = readFileSync(
      path.join(POWER, 'skills', 'night-vision-gate', 'references', 'night-vision.steering.md'),
      'utf8',
    );
    expect(steering.startsWith('---\ninclusion: auto\nname: night-vision\ndescription: ')).toBe(
      true,
    );
  });

  it('MCP-12 the shipped server runs from the Power folder alone and passes the example theme', async () => {
    const child = spawn(process.execPath, ['server/night-vision-mcp.mjs'], {
      cwd: POWER,
      env: { PATH: process.env.PATH },
    });
    const lines: string[] = [];
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c: string) => {
      buffer += c;
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      lines.push(...parts.filter((l) => l.trim().length > 0));
    });
    const send = (m: object) => child.stdin.write(`${JSON.stringify(m)}\n`);
    const waitFor = async (id: number) => {
      for (let i = 0; i < 300; i++) {
        const hit = lines.map((l) => JSON.parse(l)).find((m) => m.id === id);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`no response ${id}`);
    };
    try {
      send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 't', version: '0' },
        },
      });
      expect((await waitFor(1)).result.serverInfo.name).toBe('night-vision');
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const names = (await waitFor(2)).result.tools.map((t: { name: string }) => t.name);
      expect(names.sort()).toEqual([...NIGHT_VISION_TOOLS].sort());
      send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'token_audit',
          arguments: { path: 'skills/night-vision-gate/assets/theme.example.json' },
        },
      });
      const audit = JSON.parse((await waitFor(3)).result.content[0].text);
      expect(audit).toMatchObject({ ok: true, violations: [] });
    } finally {
      child.kill();
    }
  });
});
