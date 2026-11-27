# MCP server and Night-vision Power — Tasks

> The MCP server and Power were validated by tests and by Kiro CLI config checks, not yet exercised inside a Kiro agent session.

Status: `[x]` done, `[ ]` planned.

## Server (`tools/mcp-server`)
- [x] 1. Package `@afterglow/mcp-server`: `bin`, `build` (esbuild to `dist/index.mjs`), `start`, `typecheck`, `lint`, `test`; `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.1.12, `pngjs` 7.0.0 pinned
- [x] 2. `luminance_check` over the design-system functions (`tools/luminance.ts`) — _MCP-01, MCP-02_
- [x] 3. `token_audit` for any `{ ramp, textCeiling, semantic }` theme (`tools/tokenAudit.ts`) — _MCP-03_
- [x] 4. `pixel_scan_png`: pngjs decode, `scanRgba` verdict, ranked worst offenders (`tools/pixelScan.ts`) — _MCP-04_
- [x] 5. Workspace fence: lexical and realpath checks, extension, size and NUL refusals (`workspace.ts`) — _MCP-06_
- [x] 6. `food_verdict` over the core FoodKeeper search and assessment, defaults stated (`tools/food.ts`) — _MCP-07_
- [x] 7. `heliograph_encode` over the core frame encoder and transmit plan (`tools/heliograph.ts`) — _MCP-08_
- [x] 8. stdio server with read-only annotations and the root order (`server.ts`, `main.ts`) — _MCP-05, MCP-09, MCP-10_
- [x] 9. Tests: 35 in 7 files, 7 of them fast-check properties; the stdio test bundles and spawns both servers — _MCP-01..MCP-12_
- [x] 10. Mutation check on the fence: the symlink check and the lexical check each have a test that fails without them

## Kiro
- [x] 11. `.kiro/settings/mcp.json` registers `afterglow` with `autoApprove` for its five read-only tools — _MCP-11_
- [x] 12. Night Watch gets the three luminance tools through its own `mcpServers` entry and an `mcp` allow rule; `kiro-cli agent validate` exits 0 — _MCP-11_
- [x] 13. `kiro-cli mcp list` lists `afterglow` (`node`) for the default agent once the workspace config exists (the list was empty before); `kiro-cli mcp status --name afterglow` reads it back. Neither starts the server — _MCP-11_

## Power (`powers/night-vision`)
- [x] 14. `plugin.json` and `mcp.json` in the Agent Plugins format; self-contained server bundle — _MCP-12_
- [x] 15. Skill `night-vision-gate`, generalised steering file, example theme that passes the audit — _MCP-12_
- [x] 16. README: IDE and CLI install, root selection, known limits, rebuild — _MCP-12_
- [x] 17. `kiro-cli powers install powers/night-vision` succeeds into a throwaway `HOME` (no chat, the real `~/.kiro` untouched) — _MCP-12_

## Planned
- [ ] 18. Exercise both servers inside a real Kiro agent session (IDE and CLI V3): tool approval, `autoApprove` name form, Night Watch calling `token_audit` and `pixel_scan_png` on a Playwright screenshot
- [ ] 19. Confirm whether Kiro expands `${PLUGIN_ROOT}` in a Power's `mcp.json` and whether it sends MCP roots; change `mcp.json` or the README to match what it does
- [ ] 20. A check that the committed Power bundle matches its source (rebuild and compare in CI)
- [ ] 21. An amber-variant option (`hue: amber`) for `luminance_check`, `token_audit` and `pixel_scan_png` once the design-system amber work settles
- [ ] 22. Import the Power from its GitHub folder URL in the Kiro IDE once the branch is pushed
