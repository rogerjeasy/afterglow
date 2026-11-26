<p align="center">
  <img src="assets/logo/png/lockup/afterglow-lockup-on-black-1200x391.png" alt="Afterglow" width="480">
</p>

<h3 align="center">The only app you can read when the grid dies.</h3>

<p align="center">
  <a href="https://afterglow-flax.vercel.app/?tour=1"><b>Take the one-minute tour with Wisp</b></a>
  ·
  <a href="https://afterglow-flax.vercel.app/?phase=outage&elapsed=45">Jump into a blackout</a>
  ·
  <a href="https://afterglow-flax.vercel.app">Start from the beginning</a>
  ·
  <a href=".kiro/">The .kiro directory</a>
</p>

---

**Afterglow is a blackout companion for the 1.5 to 3.5 billion people who live with electricity they cannot count on.** When the power goes out it answers the questions nobody else answers *during* an outage: is it just my house or the whole street, when is the fridge food unsafe, how cold will my home get tonight, is my mother okay across the courtyard, and when will the power come back.

It is built for the real conditions: a mid-range phone, a dying battery, a pitch-black room and a congested network. So the whole interface is **red on pure black under a measured luminance ceiling**: it keeps your night vision, does not light up the room, and spends as little battery as possible.

Kiroween category: **Costume Contest**. In Afterglow every spooky element is a measurement:

| Costume | What it actually measures |
|---|---|
| Tombstone | A fridge or freezer. The epitaph is the time until the food must be thrown out (USDA rules and a thermal model of *your* appliance). |
| Ghost | A person you look after who has not checked in since the outage began. |
| Lantern map | Where mains power still exists, from phones that sense it, published only when at least 5 devices back a cell. |
| Séance | Sending "I am safe" or "Help" as flashes of light from one phone's screen to another phone's camera. It works with no network at all. |
| Graveyard Shift | Tonight's indoor temperature curve, with a headstone where your home crosses the danger line. |
| Candle | A battery: what it can keep running, in what order, for how long. |
| Ward | An unsafe action the app refuses (for example, running a generator before the carbon-monoxide checks are confirmed). |

## Try it in 60 seconds

The fastest way: **[take the tour](https://afterglow-flax.vercel.app/?tour=1)**. Wisp, a small ghost who is scared of bright screens, turns off the lights and walks you through one night across all five tabs. Wisp has jokes, but never numbers of its own: every figure it says is computed by the core for the screen you are looking at, and a property test holds it to that.

Or explore on your own:

1. Open **[a blackout in progress](https://afterglow-flax.vercel.app/?phase=outage&elapsed=45)**. It opens a labelled demo household 45 minutes into an outage. Nothing is saved or sent.
2. **Hearth** shows the one line of truth (grid down, for how long, how many neighbours, the restoration estimate), plus the fridge and freezer clocks and the hours your home stays safe.
3. **Lantern** shows the neighbourhood map. Drag the playback slider to watch the night end.
4. **Séance** sends a message as light. Tap *Simulate a message* to watch the real decoder read a recorded signal, or point a second phone's camera at the screen.
5. **Plan** draws the Graveyard Shift and the generator ward.
6. Tap **Power is back** on the Hearth.

The app runs fully offline in the browser. Install it as a PWA on a phone and turn off the lights.

## Why it is different

- **It never guesses to look helpful.** Every verdict (grid state, food discard time, hours of safety, restoration estimate, map cell) comes from deterministic code with cited inputs. "Unknown" is a real answer, and the app says why it does not know.
- **The label is the law for medicine.** Medicine clocks come only from pharmacist-approved, signed entries in a separate formulary pipeline. No entry means no clock and "ask your pharmacist". The app ships with an empty table and says so, rather than inventing a number.
- **Privacy by construction.** Location leaves the device only as a ~1 km cell. A cell is shown only when at least 5 distinct devices back it (k-anonymity, enforced in code and tested by properties). Raw camera and microphone data never leave memory.
- **Light as a radio.** When the network is down, the Heliograph sends short coded messages (Manchester coding, Hamming(12,8) and CRC-4) between phones with screens and cameras, through a window or across a courtyard.

## What is real and what is simulated

Real and tested:
- The deterministic core in [`packages/core`](packages/core/src): events, cells and k-anonymity, schedules, thermal models, USDA FoodKeeper rules over all 661 products, formulary clocks, the energy planner, CO Guard, the Heliograph codec and receiver, and the restoration estimator.
- The Night Shell design system: luminance tokens and a pixel scanner that fails the build if any pixel on any screen exceeds the mode's brightness ceiling.
- The web app, local encrypted accounts (AES-256-GCM, PBKDF2 with 600k iterations), the formulary signing pipeline, and the Terraform for five AWS regions (planned and policy-checked, never applied).

Simulated, and labelled as simulated in the app:
- The neighbourhood on the Lantern map is a seeded simulation of about 900 devices. Its reports still go through the real k-anonymity code.
- The demo household and its outage.
- Native sensing (mains hum, light flicker, charging edge) is specified and fused in the core, but needs Expo native modules that are not built yet. In the browser the app says "unknown" instead of pretending.

## How Kiro built it

Afterglow was built spec-first in Kiro. Everything below is in the repository.

**Specs: 18 modules, EARS requirements traced to property tests.** Each module in [`.kiro/specs/`](.kiro/specs) has `requirements.md` written in EARS with ids such as `GS-07` or `CE-03`, and a `tasks.md`. Every id appears in the name of the property test that proves it, so `grep CE-03` shows the requirement, the task and the test together.

**Steering: 9 files, three inclusion modes.** Four safety invariants are always included: [`fail-closed`](.kiro/steering/fail-closed.md), [`privacy-aggregation`](.kiro/steering/privacy-aggregation.md), [`night-vision`](.kiro/steering/night-vision.md) and [`label-only-medicine`](.kiro/steering/label-only-medicine.md). [`terraform-regions`](.kiro/steering/terraform-regions.md) loads only for `infra/**`. [`release-checklist`](.kiro/steering/release-checklist.md) is manual.

**Hooks: 13, mostly guardrails that block rather than advise.**

| Hook | Trigger | What it does |
|---|---|---|
| [Agent stop gate](.kiro/hooks/agent-stop-gate.json) | Stop | The agent cannot finish while any property test is red. |
| [Deny dialers](.kiro/hooks/deny-dialers.json) (+ [MCP](.kiro/hooks/deny-dialers-mcp.json)) | PreToolUse | Blocks anything that could SMS, call or push a real person. |
| [Deny formulary write](.kiro/hooks/deny-formulary-write.json) (+ [shell](.kiro/hooks/deny-formulary-write-shell.json)) | PreToolUse | No agent can write the validated medicine table; only the pharmacist pipeline can. |
| [Deny publish and deploy](.kiro/hooks/deny-publish-deploy.json) | PreToolUse | Blocks `npm publish`, `eas submit`, `terraform apply`. |
| [Luminance on token save](.kiro/hooks/luminance-on-token-save.json) | PostFileSave | Re-checks every colour token against the night-vision ceilings. |
| [Sensing fixtures on save](.kiro/hooks/sensing-fixtures-on-save.json) | PostFileSave | Re-runs the sense-fusion properties when fusion code changes. |
| [Property skeleton on create](.kiro/hooks/property-skeleton-on-create.json) | PostFileCreate | A new core file gets a property-test skeleton next to it. |
| [Post-task verify](.kiro/hooks/post-task-verify.json) | PostTaskExec | After each spec task: typecheck, lint, every property suite, and the pixel scan of every route in all three modes. |
| [Prompt context and secret scan](.kiro/hooks/prompt-context.json) | UserPromptSubmit | Adds context and refuses prompts that contain secrets. |
| [Session brief](.kiro/hooks/session-brief.json) | SessionStart | Briefs the agent on the latest property-test catches, open questions, human gates and uncommitted work. |
| [Formulary docs regen](.kiro/hooks/formulary-docs-regen.json) | PostFileSave | Regenerates the public formulary docs from the approved table. |

**Custom agents: 8, each with scoped tools and write paths.** For example, the [Label Reader](.kiro/agents/label-reader.json) may write only to `afterglow-formulary/proposals/`, and the [Pharmacist Validator](.kiro/agents/pharmacist-validator.json) runs on a *different model vendor* so one model's blind spot cannot approve itself. [Night Watch](.kiro/agents/night-watch.json) is a read-only reviewer that rejects non-red pixels and unsourced numbers. Boundaries were tested headless with `kiro-cli` (see [experiments](docs/kiro/experiments.md)).

**Skills: 4** in [`.kiro/skills/`](.kiro/skills): EARS authoring, property-test authoring, formulary review and Kiro evidence.

**Evidence, not claims.**
- [`docs/kiro/pbt-catches.md`](docs/kiro/pbt-catches.md): 12 real bugs found by property tests and the pixel scan that example tests missed, each with its shrunk counterexample. One example: back-to-back Heliograph repeats spelled a false frame, so three messages could not be read at all.
- [`docs/kiro/experiments.md`](docs/kiro/experiments.md): what was measured about Kiro's hooks and permissions, including inconclusive results.
- [`docs/kiro/implementation-plan.md`](docs/kiro/implementation-plan.md): the live plan, with what is done and what is not.

## Architecture

```
apps/mobile            web PWA today (Expo native targets planned), the five tabs
  └─ packages/adapters   WebCrypto vault, signed-formulary loader, Heliograph camera and screen lamp
       └─ packages/core    pure TypeScript: no I/O, no timers, no randomness; runs in Node and the browser
packages/design-system  Night Shell tokens, luminance maths, pixel scanner
tools/simulator         seeded neighbourhood used by the demo and the tests
afterglow-formulary     proposal → review → approval → Ed25519-signed snapshot pipeline (no drug data yet)
afterglow-crew          nightly checks, regression triage and digest (Python, Hypothesis)
infra                   Terraform: bootstrap + regional stacks, KMS, S3, DynamoDB, identity, edge, alerts
```

Dependencies point one way: UI → feature modules → core → adapters → OS. The full design is in [`docs/afterglow-architecture.md`](docs/afterglow-architecture.md), the UI and UX in [`docs/afterglow-design.md`](docs/afterglow-design.md), and the complete product in [`docs/afterglow-project-description.md`](docs/afterglow-project-description.md).

## Run it

Requires Node 22+ and pnpm 9.

```bash
pnpm install
pnpm --filter @afterglow/mobile dev      # http://localhost:5173
pnpm test                                # every unit and property suite
pnpm typecheck && pnpm lint
pnpm --filter @afterglow/mobile e2e      # Playwright, including the pixel scan
```

About 545 TypeScript unit and property tests, 120 Playwright browser tests (including the pixel scan of every screen in three modes), Python property tests for the Crew app, and 63 offline Terraform plan tests.

## Not an emergency service

Afterglow never replaces your local emergency number and is not a medical device. It gives label-derived information with its sources, not a diagnosis.

## License

[Apache-2.0](LICENSE). Food safety data: USDA FoodKeeper (CC0).
