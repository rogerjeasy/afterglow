---
inclusion: always
---

# Repository structure

This is the layout as it is today (2026-11-27). The long-term target layout, with native modules, Flink and more services, is in `docs/afterglow-architecture.md` section 14.1; build toward it, but describe and test what exists.

## Top-level map
- `apps/mobile/`: the web app (Vite 6, React 19, Tailwind 4 on red-only tokens), installable as a PWA and fully offline. Public site at `/`, `/features`, `/how-it-works`, `/science`, `/organisations`, `/pricing`; sign-in at `/signin`, `/signup`; the product at `/app/...` (Hearth, Lantern, Séance, Cold, Plan, Alerts, account, Business and Beacon consoles). Browser tests and the pixel scan in `apps/mobile/e2e/`.
- `packages/core/`: the deterministic domain, pure TypeScript, property tests beside each module (`alerts`, `cells`, `coguard`, `energy`, `events`, `foodkeeper`, `formulary`, `fusion`, `guidance`, `heliograph`, `household`, `restoration`, `schedule`, `sensing`, `thermal`).
- `packages/design-system/`: Night Shell tokens (`theme.night.json`), luminance maths and the pixel scanner.
- `packages/adapters/`: WebCrypto vault, signed-formulary loader, Heliograph sender and camera reader.
- `services/vault`, `services/crowd`, `services/console`: AWS Lambda functions (Node, TypeScript, bundled with esbuild) behind API Gateway: the zero-knowledge vault, the public crowd API (reports, cells, places, weather, Ask, USSD and SMS), and the Business and Beacon consoles.
- `afterglow-formulary/`: proposal → review → approval → Ed25519-signed snapshot pipeline. Holds no drug data until a pharmacist signs.
- `afterglow-crew/`: Python backend of the planned Kiro Crew night-watch app (checks runner, regression classification, digest). Not yet a complete Crew app.
- `tools/simulator/`: the seeded neighbourhood used by the demo and tests. `tools/kiro-guardrails/`: executes every Kiro hook as Kiro does. `tools/mcp-server/`: the Afterglow MCP server. `tools/data/`: snapshot builders.
- `powers/`: Kiro Powers built here.
- `infra/`: Terraform `bootstrap` and `regional` stacks and their modules; deployed to `eu-central-1` (`dev`).
- `data/`: FoodKeeper snapshot and outage rules, thermal tables.
- `.kiro/`: specs, steering, hooks, agents, skills, settings. `docs/kiro/`: evidence (pbt-catches, experiments, session evidence, implementation plan).

## Layering rules
- Dependencies point downward only: UI → feature modules → `packages/core` → adapters → OS and browser APIs.
- Feature modules never import OS or browser APIs directly; they go through adapters.
- `packages/core` imports nothing outside itself.
- Components consume semantic design tokens only. Raw colour values appear only in `theme.night.json`.
- `apps/mobile/src/guide/` (Wisp) is imported only by the app shell (GD-02).

## Naming and placement conventions
- Spec names equal package, service or feature names: `.kiro/specs/<name>/{requirements.md, design.md, tasks.md}`, or `bugfix.md` instead of `requirements.md` for a bugfix spec.
- Property tests live beside the code as `*.property.test.ts`, and their names carry the requirement id. Ids are unique across all specs.
- The validated formulary (`afterglow-formulary/validated/`) is written only by the review pipeline; agents write proposals.
- Tooling and Kiro configuration (`.kiro/`, `AGENTS.md`, `.kiroignore`, `powers/`, `docs/kiro/`) are reviewed like source code.
