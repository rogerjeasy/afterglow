import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { foodVerdict } from './tools/food.js';
import { MESSAGE_NAMES, heliographEncode } from './tools/heliograph.js';
import { luminanceCheck } from './tools/luminance.js';
import { scanPng } from './tools/pixelScan.js';
import { auditTheme } from './tools/tokenAudit.js';
import { resolveInsideRoot } from './workspace.js';

/**
 * The Afterglow MCP server (MCP-09). Every tool is read-only and deterministic:
 * it computes from the pure core and the design system, never from a model.
 * Refusals come back as tool errors with a reason; `unknown` verdicts come back
 * as answers, because they are answers.
 */

export const SERVER_VERSION = '0.1.0';
export const DEFAULT_THEME_PATH = 'packages/design-system/theme.night.json';

export type Toolset = 'all' | 'night-vision';

export interface ServerOptions {
  /** A root given with `--root` or an environment variable; wins over everything. */
  readonly explicitRoot: string | null;
  /** Used when there is no explicit root and the client offers no file roots. */
  readonly fallbackRoot: string;
  readonly toolset: Toolset;
}

export const NIGHT_VISION_TOOLS = ['luminance_check', 'token_audit', 'pixel_scan_png'] as const;
export const ALL_TOOLS = [...NIGHT_VISION_TOOLS, 'food_verdict', 'heliograph_encode'] as const;

const mode = z
  .enum(['night', 'dusk', 'ember'])
  .describe('Luminance mode: night (darkest, ceiling #A50000), dusk (#B70000) or ember (#FF0000).');

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const answer = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});

const refuse = (reason: string, extra: Record<string, unknown> = {}): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ refused: true, reason, ...extra }, null, 2) }],
  isError: true,
});

export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer(
    {
      name: options.toolset === 'all' ? 'afterglow' : 'night-vision',
      version: SERVER_VERSION,
    },
    {
      instructions:
        'Deterministic night-vision tools: check colours, theme tokens and PNG screenshots against a red-only luminance ceiling. File paths must be inside the workspace root; anything else is refused.',
    },
  );

  /** The workspace root: explicit, else the client's first file root, else the fallback. */
  async function workspaceRoot(): Promise<{ root: string; source: string }> {
    if (options.explicitRoot !== null) return { root: options.explicitRoot, source: 'explicit' };
    if (server.server.getClientCapabilities()?.roots) {
      try {
        const { roots } = await server.server.listRoots(undefined, { timeout: 5000 });
        const first = roots.find((r) => r.uri.startsWith('file://'));
        if (first) return { root: fileURLToPath(first.uri), source: 'client roots' };
      } catch {
        // A client that advertises roots but cannot list them falls back below.
      }
    }
    return { root: options.fallbackRoot, source: 'working directory' };
  }

  server.registerTool(
    'luminance_check',
    {
      title: 'Luminance check',
      description:
        'For each CSS hex colour (#RRGGBB): WCAG relative luminance, contrast on black, whether it is red-only (R >= 3 x max(G, B)), and pass or fail against the text ceiling of the given mode. Unparseable colours are reported as unknown, never passed.',
      inputSchema: {
        colours: z.array(z.string().max(32)).min(1).max(256).describe('Colours like "#A50000".'),
        mode,
      },
      annotations: readOnly,
    },
    async ({ colours, mode: m }) => answer(luminanceCheck(colours, m)),
  );

  server.registerTool(
    'token_audit',
    {
      title: 'Theme token audit',
      description: `Audit a theme JSON file shaped { ramp, textCeiling, semantic } (default ${DEFAULT_THEME_PATH}). Reports every semantic token that is brighter than its mode's text ceiling, is not red-only, does not resolve, or is a background that is not pure black. Paths outside the workspace root are refused.`,
      inputSchema: {
        path: z
          .string()
          .min(1)
          .max(1024)
          .optional()
          .describe('Theme JSON path, relative to the workspace root.'),
        modes: z.array(mode).min(1).optional().describe('Audit only these modes.'),
      },
      annotations: readOnly,
    },
    async ({ path, modes }) => {
      const { root, source } = await workspaceRoot();
      const file = resolveInsideRoot(root, path ?? DEFAULT_THEME_PATH, ['.json']);
      if (!file.ok) return refuse(file.reason, { rootSource: source });
      let theme: unknown;
      try {
        theme = JSON.parse(readFileSync(file.absolute, 'utf8'));
      } catch {
        return refuse('The file is not valid JSON; not judged.', { path: file.relative });
      }
      const result = auditTheme(theme, modes);
      if ('refused' in result) return refuse(result.reason, { path: file.relative });
      return answer({ path: file.relative, ...result });
    },
  );

  server.registerTool(
    'pixel_scan_png',
    {
      title: 'Pixel scan of a PNG',
      description:
        "Decode a PNG inside the workspace and run the night-vision pixel scanner: no pixel may be brighter than the mode's ceiling and every visible pixel must be red-dominant. Returns pass or fail, counts and the worst offending pixels.",
      inputSchema: {
        path: z.string().min(1).max(1024).describe('PNG path, relative to the workspace root.'),
        mode,
        maxOffenders: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('How many of the worst pixels to list (default 10).'),
      },
      annotations: readOnly,
    },
    async ({ path, mode: m, maxOffenders }) => {
      const { root, source } = await workspaceRoot();
      const file = resolveInsideRoot(root, path, ['.png']);
      if (!file.ok) return refuse(file.reason, { rootSource: source });
      const result = scanPng(readFileSync(file.absolute), m, maxOffenders ?? 10);
      if ('refused' in result) return refuse(result.reason, { path: file.relative });
      return answer({ path: file.relative, ...result });
    },
  );

  if (options.toolset === 'all') {
    server.registerTool(
      'food_verdict',
      {
        title: 'USDA FoodKeeper outage verdict',
        description:
          'The deterministic Afterglow verdict for one food after a power cut, with its USDA citation: ok (with the minute the window ends), discard, lookRequired (ice crystals) or unknown. A food not in the USDA FoodKeeper list is unknown; a food USDA does not name in its outage lists is treated as perishable (listed: false).',
        inputSchema: {
          food: z.string().min(1).max(200).describe('Food name, e.g. "milk" or "chicken".'),
          appliance: z.enum(['refrigerator', 'freezer']),
          minutesWithoutPower: z.number().describe('Minutes since the power went out.'),
          roomTemperatureC: z.number().min(-40).max(60).optional(),
          fullness: z.enum(['full', 'half']).optional(),
          iceCrystals: z
            .enum(['present', 'absent'])
            .optional()
            .describe('Freezer only: the answer after looking at the food.'),
        },
        annotations: readOnly,
      },
      async (input) => answer(foodVerdict(input)),
    );

    server.registerTool(
      'heliograph_encode',
      {
        title: 'Heliograph frame encoder',
        description:
          'Encode a Heliograph light message: the 32 frame bits (preamble plus two Hamming-coded bytes with CRC-4) and the transmit plan for the standard (200 ms) and fast (100 ms) profiles.',
        inputSchema: {
          message: z.enum(MESSAGE_NAMES),
          slot: z.number().int().min(0).max(63).describe('Sender roster slot, 0..63.'),
          sequence: z.number().int().min(0).max(3).optional(),
          repeats: z.number().int().min(1).max(5).optional(),
        },
        annotations: readOnly,
      },
      async (input) => {
        const result = heliographEncode(input);
        return 'refused' in result ? refuse(result.reason) : answer(result);
      },
    );
  }

  return server;
}
