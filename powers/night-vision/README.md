# Night vision (Kiro Power)

A Kiro Power for interfaces that are read in the dark. It teaches the agent one rule set (red-only colours on pure black, a luminance ceiling per mode) and gives it three deterministic tools to prove a change keeps to it. It is the gate Afterglow uses on its own Night Shell, with nothing Afterglow-specific left in it.

This Power is not published to the Kiro catalog or anywhere else. You install it from a folder or from this repository's URL.

## What is inside

```text
night-vision/
├── plugin.json                    manifest (Agent Plugins format)
├── mcp.json                       starts the bundled MCP server with Node
├── server/night-vision-mcp.mjs    the MCP server, one self-contained file (generated)
└── skills/night-vision-gate/
    ├── SKILL.md                   how to keep a UI under the ceiling and run the gate
    ├── references/night-vision.steering.md   the rules, as a Kiro steering file
    └── assets/theme.example.json  a starting theme in the shape the tools read
```

The MCP tools:

| Tool | What it does |
|---|---|
| `luminance_check` | For each `#RRGGBB` colour and a mode (`night`, `dusk`, `ember`): WCAG relative luminance, contrast on black, red-only or not, pass or fail against the mode's ceiling. |
| `token_audit` | Reads a theme JSON inside your project and lists every token that is too bright, not red, unresolved, or a background that is not black. |
| `pixel_scan_png` | Reads a PNG screenshot inside your project and fails it if any pixel is too bright or not red, with the worst pixels and their coordinates. |

All three are read-only. None of them calls a model or the network.

## Install

You need Node.js 22 or later on your `PATH`.

**Kiro IDE.** Open the Powers panel, choose **Add Custom Power**, then either **Import power from a folder** and pick this `night-vision` folder, or **Import power from a repository URL** and paste the URL of this folder on GitHub (`https://github.com/rogerjeasy/afterglow/tree/main/powers/night-vision`).

**Kiro CLI.** From a shell, without starting a chat:

```bash
kiro-cli powers install /path/to/afterglow/powers/night-vision
```

or, inside a chat, `/powers install /path/to/afterglow/powers/night-vision`. Remove it with `kiro-cli powers uninstall night-vision`.

The Power activates when a conversation mentions things like night mode, red light, luminance or a dark room.

**Steering.** The Agent Plugins format has no steering component, so the rules ship as a skill reference. To make them apply to every change in your project, copy `skills/night-vision-gate/references/night-vision.steering.md` to `.kiro/steering/night-vision.md`.

## Point the tools at your project

`token_audit` and `pixel_scan_png` only read files inside one root folder, and refuse any path outside it. The server picks the root in this order:

1. `--root <folder>` in the server's `args`;
2. the `NIGHT_VISION_ROOT` environment variable;
3. the folders your client shares over MCP roots, if it shares any;
4. the server's working directory.

If a tool answers "Not found inside the workspace" for a file you can see, your client did not share its roots. Add your project folder to `mcp.json`:

```json
"args": ["${PLUGIN_ROOT}/server/night-vision-mcp.mjs", "--root", "/absolute/path/to/your/project"]
```

## Known limits

- `mcp.json` uses `${PLUGIN_ROOT}`, which the [Agent Plugins specification](https://agent-plugins.org/specification) says clients must expand in `args`. The Kiro documentation does not mention it, and this has not been tried inside a Kiro agent session yet. If the server fails to start with "Cannot find module", replace `${PLUGIN_ROOT}` with the installed folder. Kiro CLI 3.6.1 copies the Power to `~/.kiro/powers/installed/night-vision/`.
- The theme must have the `ramp`, `textCeiling` and `semantic` shape shown in `assets/theme.example.json`. Other shapes are refused rather than guessed at.
- The pixel scan judges the PNG as it is; transparency is ignored.

## Rebuild the server

`server/night-vision-mcp.mjs` is generated from `tools/mcp-server/src/power.ts` in the Afterglow repository. It bundles `@modelcontextprotocol/sdk`, `zod` and `pngjs` (all MIT) with Afterglow's design-system maths. After changing the source:

```bash
pnpm install
pnpm --filter @afterglow/mcp-server build
```

Licence: Apache-2.0.
