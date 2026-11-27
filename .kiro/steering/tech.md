---
inclusion: always
---

# Technology

What is in the repository today. The full architecture, alternatives and ADRs are in `docs/afterglow-architecture.md`; the `architecture-reference` steering file loads it when a request is about architecture. Versions are pinned in lockfiles and Terraform, not here.

## Stack as built
- Client: one web app, `apps/mobile`: Vite 6, React 19, Tailwind 4 (red-only tokens), own history router, service worker that precaches the whole build. Installable PWA; every safety screen works offline. Native (Expo) targets are planned, not built.
- Shared core: `packages/core`, pure TypeScript; the same property suites run in Node and in headless Chromium.
- Local data: an append-only event log with reducers, kept in localStorage per space (guest, demo, account). Accounts encrypt it on the device (AES-256-GCM, PBKDF2-SHA256 600k) before it leaves.
- Backend: AWS `eu-central-1`. Cognito (SRP, JWT authorizer), API Gateway HTTP APIs, Lambda (Node 24, TypeScript, esbuild), DynamoDB, KMS, S3, CloudWatch alarms. Public data: OpenStreetMap (Overpass) and Open-Meteo through the crowd service.
- AI at runtime: one place only. `POST /v1/ask` may have Claude on Amazon Bedrock rephrase passages the deterministic guidance library already chose; a check rejects any phrasing whose numbers are not in the passages. Every other verdict is deterministic code.
- Infra and delivery: Terraform (offline plan tests, Checkov), GitHub Actions CI, Vercel for the web app (deploys main).

## Language and tooling conventions
- TypeScript 5.7 strict; Biome for lint and format; pnpm 9 workspaces + Turborepo.
- Tests: Vitest + fast-check (TypeScript), Hypothesis + pytest (Python, `afterglow-crew`), Playwright for browser tests and the pixel scan, Terraform test files for infra.
- Properties are the definition of done. Each EARS requirement id (for example `GS-07`) appears in its property test name and its task. When a property fails and shrinks, record it in `docs/kiro/pbt-catches.md` the same day.
- Allowed shell by default: `pnpm test*`, `pnpm lint*`, `pnpm typecheck*`, read-only git. Never run `npm publish`, `eas submit`, `terraform apply`, or anything that sends SMS, calls or pushes to real users; the `deny-*` hooks enforce this.

## Engineering rules
- The core imports nothing but itself: no I/O, no timers, no randomness except injected generators.
- Every external source sits behind an adapter and is tested against recorded or malformed input.
- Ingest assumes burst load: accept and buffer first, compute later; clients get 202 when work is pending.
- No secrets in code, logs or prompts. Files matched by `.kiroignore` are never read.
