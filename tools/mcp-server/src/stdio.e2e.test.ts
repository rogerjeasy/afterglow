import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End to end over stdio (MCP-09, MCP-10): the real server, bundled the way the
 * build bundles it, spawned as a child process and spoken to in raw JSON-RPC.
 */

const PKG = fileURLToPath(new URL('..', import.meta.url));
const REPO = path.resolve(PKG, '../..');
let out: string;

beforeAll(async () => {
  out = mkdtempSync(path.join(tmpdir(), 'mcp-e2e-'));
  const banner = {
    js: "import { createRequire as __r } from 'node:module'; const require = __r(import.meta.url);",
  };
  for (const entry of ['index', 'power']) {
    await build({
      entryPoints: [path.join(PKG, 'src', `${entry}.ts`)],
      outfile: path.join(out, `${entry}.mjs`),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'silent',
      banner,
    });
  }
}, 60_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

interface Tool {
  readonly name: string;
  readonly annotations?: Record<string, unknown>;
  readonly inputSchema: { readonly type: string };
}
interface Result {
  readonly serverInfo?: unknown;
  readonly capabilities?: { readonly tools?: unknown };
  readonly tools?: readonly Tool[];
  readonly content?: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
}
type Message = {
  id?: number;
  method?: string;
  result?: Result;
  error?: unknown;
  params?: unknown;
};

/** A minimal JSON-RPC client over a child's stdio. */
class Rpc {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = '';
  private readonly waiting = new Map<number, (m: Message) => void>();
  private nextId = 1;
  readonly stdoutNoise: string[] = [];

  constructor(
    script: string,
    args: string[],
    cwd: string,
    private readonly onRequest: (m: Message) => unknown = () => ({}),
  ) {
    this.child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: { PATH: process.env.PATH },
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      let nl = this.buffer.indexOf('\n');
      while (nl >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        nl = this.buffer.indexOf('\n');
        if (line.length === 0) continue;
        let m: Message;
        try {
          m = JSON.parse(line);
        } catch {
          this.stdoutNoise.push(line);
          continue;
        }
        if (m.method !== undefined && m.id !== undefined) {
          this.send({ jsonrpc: '2.0', id: m.id, result: this.onRequest(m) });
        } else if (m.id !== undefined) {
          this.waiting.get(m.id)?.(m);
        }
      }
    });
  }

  private send(m: object): void {
    this.child.stdin.write(`${JSON.stringify(m)}\n`);
  }

  request(method: string, params: object = {}): Promise<Message> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 15_000);
      this.waiting.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method: string, params: object = {}): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  async initialize(capabilities: object = {}): Promise<Message> {
    const init = await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities,
      clientInfo: { name: 'e2e', version: '0' },
    });
    this.notify('notifications/initialized');
    return init;
  }

  close(): void {
    this.child.kill();
  }
}

/** The JSON body of a tool result. */
const parse = (m: Message): Record<string, unknown> =>
  JSON.parse(m.result?.content?.[0]?.text ?? 'null');

describe('stdio end to end', () => {
  it('MCP-09 initialize, tools/list and tools/call work over stdio with nothing else on stdout', async () => {
    const rpc = new Rpc(path.join(out, 'index.mjs'), [], REPO);
    try {
      const init = await rpc.initialize();
      expect(init.result?.serverInfo).toEqual({ name: 'afterglow', version: '0.1.0' });
      expect(init.result?.capabilities?.tools).toBeDefined();

      const list = await rpc.request('tools/list');
      const tools = list.result?.tools ?? [];
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          'food_verdict',
          'heliograph_encode',
          'luminance_check',
          'pixel_scan_png',
          'token_audit',
        ].sort(),
      );
      // MCP-05: every tool is declared read-only and closed-world.
      for (const t of tools) {
        expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
        expect(t.inputSchema.type).toBe('object');
      }

      const call = await rpc.request('tools/call', {
        name: 'luminance_check',
        arguments: { colours: ['#A50000', '#A60000'], mode: 'night' },
      });
      expect(call.result?.isError).toBeFalsy();
      expect(parse(call)).toMatchObject({
        ceiling: { hex: '#A50000' },
        allPass: false,
        results: [{ verdict: 'pass' }, { verdict: 'fail' }],
      });

      const audit = await rpc.request('tools/call', { name: 'token_audit', arguments: {} });
      expect(parse(audit)).toMatchObject({
        path: 'packages/design-system/theme.night.json',
        ok: true,
        violations: [],
      });

      const outside = await rpc.request('tools/call', {
        name: 'token_audit',
        arguments: { path: '../../../etc/hosts.json' },
      });
      expect(outside.result?.isError).toBe(true);
      expect(parse(outside).refused).toBe(true);

      const invalid = await rpc.request('tools/call', {
        name: 'heliograph_encode',
        arguments: { message: 'HELP', slot: 99 },
      });
      expect(invalid.result?.isError ?? invalid.error !== undefined).toBe(true);
      expect(rpc.stdoutNoise).toEqual([]);
    } finally {
      rpc.close();
    }
  });

  it('MCP-10 the Power server lists only the luminance tools and honours --root', async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mcp-root-')));
    writeFileSync(
      path.join(root, 'theme.json'),
      JSON.stringify({
        ramp: { 'red.0': '#000000', 'red.9': '#FF0000' },
        textCeiling: { night: 'red.0' },
        semantic: { night: { bg: 'red.0', 'text.primary': 'red.9' } },
      }),
    );
    const rpc = new Rpc(path.join(out, 'power.mjs'), ['--root', root], PKG);
    try {
      await rpc.initialize();
      const list = await rpc.request('tools/list');
      expect((list.result?.tools ?? []).map((t) => t.name).sort()).toEqual([
        'luminance_check',
        'pixel_scan_png',
        'token_audit',
      ]);
      const audit = parse(
        await rpc.request('tools/call', { name: 'token_audit', arguments: { path: 'theme.json' } }),
      );
      expect(audit.ok).toBe(false);
      expect(audit.violations).toEqual([
        expect.objectContaining({
          mode: 'night',
          token: 'text.primary',
          problem: 'exceeds ceiling',
        }),
      ]);
    } finally {
      rpc.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('MCP-10 with no explicit root the server asks the client for its roots', async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mcp-client-root-')));
    writeFileSync(path.join(root, 'theme.json'), '{"not":"a theme"}');
    let asked = 0;
    const rpc = new Rpc(path.join(out, 'power.mjs'), [], PKG, (m) => {
      if (m.method !== 'roots/list') return {};
      asked += 1;
      return { roots: [{ uri: pathToFileURL(root).href, name: 'project' }] };
    });
    try {
      await rpc.initialize({ roots: { listChanged: false } });
      const res = await rpc.request('tools/call', {
        name: 'token_audit',
        arguments: { path: 'theme.json' },
      });
      expect(asked).toBe(1);
      // The file was found in the client's root (not the server's cwd) and refused as not a theme.
      expect(res.result?.isError).toBe(true);
      expect(parse(res)).toMatchObject({ refused: true, path: 'theme.json' });
      expect(parse(res).reason).toMatch(/Not a theme file/);
    } finally {
      rpc.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
