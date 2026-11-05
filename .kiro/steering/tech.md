---
inclusion: always
---

# Technology

The architecture, stack choices, alternatives considered and ADRs are in the document below. Treat it as the source of truth and read the relevant section before changing anything structural. Versions are pinned in the repository (lockfiles, Terraform), not in the doc.

#[[file:docs/afterglow-architecture.md]]

## Stack at a glance
- Client: one Expo app (React Native on the New Architecture with Hermes, React 19, Expo Router) for iOS, Android and web PWA. Native sensing and BLE in Expo Modules (Kotlin/Swift). Maps: MapLibre with self-hosted Protomaps PMTiles.
- Shared core: `packages/core`, pure TypeScript, runs identically on Hermes, V8/JSC and Node.
- Local data: SQLite everywhere (expo-sqlite native, wa-sqlite on OPFS web), append-only event log with reducers.
- Crypto: libsodium, WebCrypto, Ed25519/X25519, HKDF.
- Backend: AWS in five self-contained regions. CloudFront, API Gateway, Kinesis, Managed Service for Apache Flink (Java 17), Lambda (Node 24, TypeScript), Python 3.13 jobs on Step Functions, DynamoDB, S3, OpenSearch Serverless, Glue and Athena. Amazon Pinpoint is not used.
- AI: Amazon Bedrock with two model families (proposer and validator). Batch only, never on the request path.
- Infra and delivery: Terraform, GitHub Actions with OIDC, EAS Build/Submit/Update, Turborepo.

## Language and tooling conventions
- TypeScript 5 strict everywhere on the TS side; Biome for lint and format; pnpm workspaces + Turborepo.
- Tests: Vitest + fast-check for TypeScript, Hypothesis + pytest for Python, Playwright for web e2e and pixel scans, Maestro for native e2e. Detox is not used.
- Properties are the definition of done. Each EARS requirement id (for example `GS-07`) appears in its property test name and its task. When a property fails and shrinks, record it in `docs/kiro/pbt-catches.md` the same day.
- Allowed shell by default: `pnpm test*`, `pnpm lint*`, read-only git. Never run `npm publish`, `eas submit`, `terraform apply`, or anything that sends SMS, calls or pushes to real users. Publishing and deploying are human steps.

## Engineering rules that follow from the architecture
- The core imports nothing but itself: no I/O, no timers, no randomness except injected generators.
- External services sit behind adapter interfaces so properties run against pure code. Sensing is tested with recorded fixtures.
- Platform differences live in adapter modules chosen by file suffix (`.native.ts`, `.web.ts`, `.android.ts`, `.ios.ts`).
- Every external source uses the adapter pattern (`fetch`, `normalise`, `health`) and is tested against recorded fixtures, including malformed ones.
- Storage and ingest assume burst load: accept and buffer first, compute later; clients get 202 immediately.
- No secrets in code, logs or prompts. Files matched by `.kiroignore` (env files, keys, raw audio recordings) are never read.
