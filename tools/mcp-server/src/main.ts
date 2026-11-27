import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type Toolset, createServer } from './server.js';

/**
 * Start the server on stdio. The workspace root comes from `--root <dir>`, then
 * the `AFTERGLOW_MCP_ROOT` or `NIGHT_VISION_ROOT` environment variable, then
 * the client's MCP roots, then the working directory. Nothing is written to
 * stdout except protocol messages; diagnostics go to stderr.
 */
export async function main(toolset: Toolset, argv: readonly string[] = process.argv.slice(2)) {
  const at = argv.indexOf('--root');
  const fromArg = at >= 0 ? argv[at + 1] : undefined;
  const fromEnv = process.env.AFTERGLOW_MCP_ROOT || process.env.NIGHT_VISION_ROOT || undefined;
  const explicit = fromArg ?? fromEnv;
  const server = createServer({
    toolset,
    explicitRoot: explicit ? path.resolve(explicit) : null,
    fallbackRoot: process.cwd(),
  });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${toolset === 'all' ? 'afterglow' : 'night-vision'} MCP server ready\n`);
}
