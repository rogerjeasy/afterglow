---
inclusion: always
---

# Repository structure

The planned layout is in `docs/afterglow-architecture.md` section 14.1 (repository), with client layering in section 4.2. That document is already loaded through `tech.md`, so it is not referenced again here.

Current state: the repository holds `docs/` and `assets/` (logo and icon exports) only. The code directories below are planned and may not exist yet; create them following this layout rather than inventing another.

## Top-level map
- `apps/mobile/`: Expo app for iOS, Android and web
- `apps/consoles/`: Beacon and Business web consoles
- `packages/core/`: deterministic domain in pure TypeScript, with property tests next to each module
- `packages/design-system/`: Night Shell tokens (`theme.night.json`), components, lint rules
- `packages/adapters/`: platform adapter interfaces and web implementations
- `packages/sdk/`: Platform API SDK generated from OpenAPI
- `modules/`: Expo Modules (Kotlin/Swift) for sensing, BLE, Wi-Fi Aware/Multipeer, ggwave
- `services/<name>/`: Lambda services (intake, providers, alerts, relay, business, beacon, platform, tiles, voice)
- `jobs/<name>/`: Python jobs (corroboration, forecast, opendata, formulary)
- `flink/cell-aggregation/`: Flink job
- `infra/`: Terraform modules and per-region stacks
- `data/`: FoodKeeper snapshot, archetype tables, device table, fixtures
- `tools/simulator/`, `tools/mcp/`: simulator and MCP servers we build
- `powers/`: published Kiro Powers
- `.kiro/`: specs, steering, hooks, agents, skills, workflows, settings
- `docs/kiro/`: write-up and evidence (pbt-catches, experiments, privacy-findings, hooks-log)

## Layering rules
- Dependencies point downward only: UI → feature modules → `packages/core` → platform adapters → OS APIs.
- Feature modules never import OS or browser APIs directly; they import adapter interfaces.
- `packages/core` imports nothing outside itself.
- Components consume semantic design tokens only. Raw colour values appear only in `theme.night.json`.

## Naming and placement conventions
- Spec names equal package or service names: `.kiro/specs/<module>/{requirements.md, design.md, tasks.md}`.
- Property tests live beside the code as `*.property.test.ts`, and their names carry the requirement id.
- Recorded fixtures go in `data/fixtures/`. Raw audio recordings under `data/fixtures/audio/raw/` are ignored by the agent.
- The validated formulary lives in the separate `afterglow-formulary` repository and is written only by its review pipeline. The Kiro Crew app lives in the separate `afterglow-crew` repository.
- Tooling and Kiro configuration (`.kiro/`, `AGENTS.md`, `.kiroignore`, `powers/`, `docs/kiro/`) are reviewed like source code.
