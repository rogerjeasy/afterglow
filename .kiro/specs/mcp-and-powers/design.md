# MCP server and Night-vision Power — Design

> Built 2026-11-27 in Claude Code after the Kiro credits ran out; the MCP server and Power were validated by tests and by Kiro CLI config checks, not yet exercised inside a Kiro agent session.

## Shape
```
Kiro agent ──stdio JSON-RPC──▶ tools/mcp-server (McpServer, @modelcontextprotocol/sdk 1.32.2)
                                 │
                                 ├─ luminance_check ─┐
                                 ├─ token_audit ─────┼─▶ @afterglow/design-system
                                 ├─ pixel_scan_png ──┘     (relativeLuminance, isRedDominant,
                                 │                          textCeiling, scanRgba, judgePixel)
                                 ├─ food_verdict ────────▶ @afterglow/core foodkeeper + thermal
                                 │                          over data/foodkeeper/*.json
                                 └─ heliograph_encode ───▶ @afterglow/core heliograph
```
The server owns only input validation (zod), the workspace fence, PNG decoding (pngjs) and JSON formatting. It adds no maths of its own.

## Files
| File | Role |
|---|---|
| `src/server.ts` | `createServer({ toolset, explicitRoot, fallbackRoot })`: registers the tools; `toolset: 'night-vision'` registers only the three luminance tools |
| `src/main.ts` | Reads `--root` and the root environment variables, connects the stdio transport, writes its ready line to stderr |
| `src/index.ts`, `src/power.ts` | Entry points for the full server and the Power's server |
| `src/workspace.ts` | `resolveInsideRoot(root, path, extensions)`: the fence (MCP-06) |
| `src/tools/*.ts` | One pure function per tool, tested without the protocol |
| `scripts/bundle.mjs` | esbuild, as `services/*` do: `dist/index.mjs` (gitignored) and `powers/night-vision/server/night-vision-mcp.mjs` (minified, committed) |

## Tool contracts
| Tool | Input (zod) | Answer | Refusal |
|---|---|---|---|
| `luminance_check` | `colours: string[1..256]`, `mode` | per colour: `verdict` (`pass`/`fail`/`unknown`), luminance, contrast, `redOnly`, `withinCeiling`, `problems`; `ceiling`; `allPass` | none: a bad colour is `unknown` |
| `token_audit` | `path?` (default `packages/design-system/theme.night.json`), `modes?` | `ok`, `modes`, `tokensChecked`, `ceilings`, `violations[]` (`mode`, `token`, `value`, `hex`, `tier`, `problem`, luminances) | outside root, missing, not `.json`, not JSON, not a theme |
| `pixel_scan_png` | `path`, `mode`, `maxOffenders?` (1..50, default 10) | `ok`, size, `offenders`, `maxRed`, `ceilingRed`, `worstOffenders[]` | outside root, missing, not `.png`, undecodable, over 40 M pixels |
| `food_verdict` | `food`, `appliance`, `minutesWithoutPower`, `roomTemperatureC?`, `fullness?`, `iceCrystals?` | `matchedFood`, `otherMatches`, `ambiguous`, the core `verdict`, `assumptions` | none: not found is the core's `unknown` |
| `heliograph_encode` | `message` (enum), `slot` 0..63, `sequence?` 0..3, `repeats?` 1..5 | `frameBits`, `preambleBits`, `codedBits`, `plans[]` for `standard` and `fast` | out of range (zod first, then `encodeFrame`/`planTransmission` returning null) |

All tools carry `readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false`.

## Decisions
- **Token audit checks every token against the ceiling, not only text tokens.** The pixel scan already holds every pixel to the ceiling, and every token in the real theme is at or below it, so the stricter check costs nothing and catches a bright surface. Each violation still says whether the token is `text` or `non-text`.
- **Worst offenders, not first offenders.** `scanRgba` keeps the first few in reading order, which is what a test failure needs. An agent fixing a screen needs the worst ones, so the tool ranks a second pass with the scanner's own `judgePixel`, only when the scan failed. A 1170 x 2532 all-failing screenshot takes about 0.5 s.
- **Not found in food search uses the core's own wording.** The tool asks the core to assess an id no product has, so the `unknown` text is the core's, not a copy.
- **The fence resolves twice.** First lexically (so `../` is refused before any file system access), then through `realpath` (so a symlink out is refused). Mutation-checked: removing the symlink check fails the MCP-06 property; removing the lexical check fails the reason test.
- **Root order.** An explicit root wins so the repository config is predictable; MCP roots come next so an installed Power can follow the client's workspace; the working directory is last.
- **The workspace config needs a build.** `node tools/mcp-server/dist/index.mjs` is what `.kiro/settings/mcp.json` runs; `dist/` is gitignored, so `pnpm --filter @afterglow/mcp-server build` (or `pnpm build`) must run first. Node's type stripping cannot run the source directly because the workspace packages import `./x.js` for `x.ts`.

## Kiro wiring
- `.kiro/settings/mcp.json`: server `afterglow`, `command: node`, `args: ["tools/mcp-server/dist/index.mjs"]`, `autoApprove` the five read-only tools by name.
- `.kiro/agents/night-watch.json`: its own `mcpServers.afterglow` (same command), `tools` adds `@afterglow/luminance_check`, `@afterglow/token_audit`, `@afterglow/pixel_scan_png`, `permissions` adds `{ capability: mcp, match: [afterglow/<tool> x3], effect: allow }`; `includeMcpJson` stays false and the blanket `fs_write` deny is untouched.

## Power layout
```
powers/night-vision/
├── plugin.json                     $schema, name, version, description, author, keywords, repository, license
├── mcp.json                        { night-vision: { type: stdio, command: node, args: ["${PLUGIN_ROOT}/server/night-vision-mcp.mjs"] } }
├── server/night-vision-mcp.mjs     generated by the build
├── README.md                       install, root selection, known limits, rebuild
└── skills/night-vision-gate/
    ├── SKILL.md                    the gate: numbers, theme shape, three checks, how to fix, rules for the agent
    ├── references/night-vision.steering.md   inclusion: auto; generalised rules to copy into .kiro/steering/
    └── assets/theme.example.json   a theme that passes the audit
```

## Testing
| File | Covers |
|---|---|
| `src/tools/luminance.property.test.ts` | MCP-01, MCP-02 (3 properties) |
| `src/tools/tokenAudit.property.test.ts` | MCP-03 (1 property: one mutated token is flagged exactly when `luminance_check` fails it, and nothing else is blamed) |
| `src/tools/pixelScan.test.ts` | MCP-04 |
| `src/workspace.property.test.ts` | MCP-06 (2 properties over generated traversal, absolute and symlinked paths) |
| `src/tools/coreTools.test.ts` | MCP-07, MCP-08 (1 property: every message, slot and sequence round-trips through `decodeCoded`) |
| `src/stdio.e2e.test.ts` | MCP-05, MCP-09, MCP-10: bundles both entries, spawns them, speaks raw JSON-RPC, answers a `roots/list` request |
| `src/kiroConfig.test.ts` | MCP-11, MCP-12: config shapes, and the committed Power server run from the Power folder alone |
