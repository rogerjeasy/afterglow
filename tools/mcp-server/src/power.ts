import { main } from './main.js';

// The night-vision Power's server: only the three luminance tools, no Afterglow data.
main('night-vision').catch((error: unknown) => {
  process.stderr.write(`night-vision MCP server failed: ${String(error)}\n`);
  process.exit(1);
});
