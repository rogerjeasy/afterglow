import { main } from './main.js';

// The full Afterglow server: the night-vision gate, the FoodKeeper verdict and the Heliograph encoder.
main('all').catch((error: unknown) => {
  process.stderr.write(`afterglow MCP server failed: ${String(error)}\n`);
  process.exit(1);
});
