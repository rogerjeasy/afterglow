# MCP server and Night-vision Power — Requirements

> The MCP server and Power were validated by tests and by Kiro CLI config checks, not yet exercised inside a Kiro agent session.

**Module:** `tools/mcp-server` (package `@afterglow/mcp-server`), `.kiro/settings/mcp.json`, `.kiro/agents/night-watch.json` and `powers/night-vision/`.
**Workflow:** Requirements-First. The tools add no new maths: every number comes from `packages/design-system` or `packages/core`, and these requirements say how it is served.

Agents working on Afterglow, and on any other dark-room interface, should check luminance with the same code that guards the real tokens instead of estimating it. This spec puts that code behind an MCP server on stdio, registers it with Kiro, gives the read-only Night Watch reviewer the three luminance tools, and packages the luminance gate as a Kiro Power that another project can install. Every tool is read-only, deterministic and fails closed: a malformed input, an unknown food or a path outside the workspace is an explicit refusal or `unknown`, never a guess.

## Sources (checked 2026-11-27)
- Kiro docs, saved as markdown the same day: MCP configuration (`mcpServers`, `command`, `args`, `env`, `disabled`, `autoApprove`, `disabledTools`; workspace file `.kiro/settings/mcp.json`), agent configuration reference (`mcpServers`, `tools` with `@server/tool`, `includeMcpJson`, `permissions` with capability `mcp`), Powers (Agent Plugins format: `plugin.json`, optional `skills/` and `mcp.json`), Powers installation, Skills, Steering.
- Agent Plugins specification (agent-plugins.org): `${PLUGIN_ROOT}` expansion in stdio `args`, `env` and `cwd`; plugin root as the default working directory; v1 has exactly two component types, skills and MCP servers.
- Model Context Protocol, `@modelcontextprotocol/sdk` 1.32.2: stdio transport, `tools/list`, `tools/call`, tool annotations, client roots.

## Glossary
- **Workspace root** — the one folder whose files the server may read.
- **Refusal** — a tool result with `isError: true` and `{ refused: true, reason }`.
- **Ceiling** — the mode's text ceiling from `theme.night.json` (`night` `#A50000`, `dusk` `#B70000`, `ember` `#FF0000`).
- **Red-only** — `R >= 3 x max(G, B)` (`isRedDominant`).

## Requirements

### MCP-01 — luminance_check reports the design-system numbers
- WHEN `luminance_check` is called with a list of colours and a mode THE SYSTEM SHALL return, for each `#RRGGBB` colour, the WCAG relative luminance, the contrast on black and whether it is red-only, computed by the design-system functions, plus the ceiling used (mode, ramp key, hex, luminance).

### MCP-02 — Pass means red-only and within the ceiling; malformed is unknown
- THE SYSTEM SHALL mark a colour `pass` only when it is red-only and its luminance is at or below the mode ceiling, and `fail` otherwise.
- IF a colour is not a 6-digit hex colour THEN THE SYSTEM SHALL mark it `unknown` and SHALL report `allPass: false`.
- A pure red `#RR0000` SHALL pass exactly when the design-system pixel scanner allows that pixel in the same mode.

### MCP-03 — token_audit reports every token that breaks a rule
- WHEN `token_audit` is called THE SYSTEM SHALL read `packages/design-system/theme.night.json`, or the given path inside the workspace, and report every semantic token in every mode that is brighter than its mode's ceiling, is not red-only, does not resolve to a hex colour, or is a background (`bg`, `background`) that is not `#000000`, and every mode with no ceiling.
- IF the file is not JSON or not shaped `{ ramp, textCeiling, semantic }` THEN THE SYSTEM SHALL refuse it.
- THE SYSTEM SHALL report `ok: true` only when there are no violations.

### MCP-04 — pixel_scan_png uses the existing scanner
- WHEN `pixel_scan_png` is called with a PNG inside the workspace and a mode THE SYSTEM SHALL decode it and return the design-system `scanRgba` verdict, its offender count and brightest red channel, and the worst offending pixels (coordinates, colour, reason, how far past the rule) up to a cap.
- IF the bytes are not a readable PNG THEN THE SYSTEM SHALL refuse it.
- IF the PNG header declares more than 40 million pixels THEN THE SYSTEM SHALL refuse it from the header, before decoding, so a small compressed file cannot make it allocate gigabytes. (Security review, 2026-11-27.)

### MCP-05 — Read-only and deterministic
- THE SYSTEM SHALL declare every tool `readOnlyHint: true` and `openWorldHint: false`, SHALL NOT write files, call a model or use the network, and SHALL return the same result for the same input and files.

### MCP-06 — The workspace fence
- IF a requested path resolves outside the workspace root, lexically or through a symlink, THEN THE SYSTEM SHALL refuse it with the reason.
- THE SYSTEM SHALL also refuse a path that does not exist, is not a regular file, is larger than 64 MiB, contains a NUL byte or has an extension the tool does not read (`.json` for `token_audit`, `.png` for `pixel_scan_png`).

### MCP-07 — food_verdict is the core verdict
- WHEN `food_verdict` is called with a food name, an appliance (`refrigerator` or `freezer`) and minutes without power THE SYSTEM SHALL return the core `assessFood` verdict, with its USDA citation, for the top result of the core `searchFood`, and SHALL list the other matches and flag `ambiguous` when there are several.
- IF no food matches THEN THE SYSTEM SHALL return the core's own `unknown` verdict ("This food is not in the USDA FoodKeeper list.").
- A food USDA does not name in its outage lists SHALL come back as the core's perishable clock with `listed: false`.
- WHEN room temperature or fullness is not given THE SYSTEM SHALL use the core default room temperature (22 C) and `half` fullness (the faster-warming case) and SHALL state each assumption in the answer.

### MCP-08 — heliograph_encode is the core encoder
- WHEN `heliograph_encode` is called with a message name and slot THE SYSTEM SHALL return the 32 frame bits from `encodeFrame` and the transmit plan for both profiles from `planTransmission` (symbol length, frame length, repeats, symbols, total duration, runs).
- IF the message, slot, sequence or repeat count is out of range THEN THE SYSTEM SHALL refuse it.

### MCP-09 — It speaks MCP on stdio
- THE SYSTEM SHALL answer `initialize`, `tools/list` and `tools/call` over stdio with the official SDK and SHALL write nothing to stdout except protocol messages.

### MCP-10 — One root, chosen in a fixed order
- THE SYSTEM SHALL take the workspace root from `--root`, else `AFTERGLOW_MCP_ROOT` or `NIGHT_VISION_ROOT`, else the client's first `file://` MCP root, else the working directory, and SHALL report which source it used when it refuses a path.
- The Power's server SHALL expose only `luminance_check`, `token_audit` and `pixel_scan_png`.

### MCP-11 — Wired into Kiro in the documented schema
- THE SYSTEM SHALL register the server in `.kiro/settings/mcp.json` with `command` and `args` that work from the workspace root after a build, and SHALL list in `autoApprove` only its read-only tools, by name, never `*`.
- Night Watch SHALL get only `@afterglow/luminance_check`, `@afterglow/token_audit` and `@afterglow/pixel_scan_png`, through its own `mcpServers` entry with `includeMcpJson` left false, with a matching `mcp` allow rule and its `fs_write` deny unchanged. `kiro-cli agent validate` SHALL accept it.

### MCP-12 — A Power another project can install
- THE SYSTEM SHALL ship `powers/night-vision/` in the Agent Plugins format: `plugin.json` with the required fields, `mcp.json` with one stdio server, and a `night-vision-gate` skill whose `SKILL.md` front matter names its folder.
- The Power's MCP server SHALL be one self-contained file inside the Power, so the Power needs only Node.js 22 or later, not this repository.
- The night-vision rules SHALL ship generalised (no Afterglow names) as a Kiro steering file the user can copy, because Agent Plugins v1 has no steering component.
- The README SHALL give install steps for the IDE and the CLI from the installation docs, SHALL NOT claim the Power is published, and SHALL state what has not been verified.

## Analysis
- **Why `autoApprove` lists names, not `mcp_*` ids.** The configuration reference says "Tool names to auto-approve"; the usage page's example uses `mcp_aws_docs_search_documentation`. This spec follows the configuration reference. If a Kiro session still prompts for these tools, the usage-page form is the one to try.
- **Why Night Watch does not use `includeMcpJson`.** It would also load every server in the user's global `~/.kiro/settings/mcp.json` into a read-only reviewer. A dedicated `mcpServers` entry keeps its tool surface to exactly three tools.
- **Why a bundled server inside the Power.** The package is not published, so `npx` is not possible. The build writes one minified file (about 0.8 MB: MCP SDK, zod, pngjs and the design-system maths) into the Power.
- **What is not verified.** Whether Kiro expands `${PLUGIN_ROOT}` (the Agent Plugins specification requires it; the Kiro docs do not mention it, and the string does not appear in the Kiro CLI 3.6.1 bundle), and whether Kiro sends MCP roots. Both have documented fallbacks in the Power README.
