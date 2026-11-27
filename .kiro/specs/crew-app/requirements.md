# Afterglow Crew app — Requirements

**Package:** `afterglow-crew/` (planned as its own public repository, `afterglow-crew`; built here so it can watch this repository and share its guardrails).
**Workflow:** Requirements-First (product-driven: what should a person be told in the morning?).
**Target:** the "Best Kiro Crew App" bonus. The planned Crew app has an `app.json` manifest, an agent, skills, scheduled jobs, a Python backend behind the gateway's signed proxy, and a dashboard page.
**Status (2026-11-27):** only the Python backend exists: the check runner, regression classification, notifications and the weekly digest (CW-01 to CW-06, CW-08, CW-09, CW-12), with 95 Hypothesis and pytest tests. The manifest, agent, skills, schedule and dashboard are not built, so this is not yet a loadable Crew app. See `tasks.md`.

## What it is for

A person building Afterglow needs one answer each morning: *did anything get worse overnight?* The Crew app runs the project's own checks on a schedule, remembers every run, and says so **only when something regressed**. It is Afterglow's night watch, and like the product it fails closed: a check that could not run is reported as unknown, never as passing.

It watches only what exists today. It does **not** pretend to run satellite corroboration, provider health or a dark-room device farm: none of those exist yet, and a dashboard that showed them would be a costume with no measurement behind it.

## Glossary

- **Check** — one command from the allow-list in `checks.json` (for example `pnpm typecheck`), with a timeout.
- **Run** — one execution of every check, repeated `repeats` times so flakiness can be seen.
- **Outcome** — `pass | fail | unknown`. Unknown means the check could not be judged (timed out, could not start, output unreadable).
- **Regression** — a change between the previous run and this one that a person should hear about.

## Requirements

### CW-01 — Unknown is never a pass
- IF a check times out, cannot be started, or exits with a status the app cannot read THEN THE SYSTEM SHALL record the outcome `unknown`, never `pass`.
- THE SYSTEM SHALL count a run as passing only when every check is `pass` in every repeat.
- IF a check declares a test-output parser and the parser counts zero tests THEN THE SYSTEM SHALL record `unknown`: a suite that ran nothing has passed nothing.

### CW-02 — A flaky check is a finding
- WHEN a check has both `pass` and `fail` among the repeats of one run THE SYSTEM SHALL classify it `flaky`, and SHALL report it as a regression even though the check sometimes passes. (A property that fails one run in four was found by luck; see `docs/kiro/pbt-catches.md`, HL-07.)

### CW-03 — Lost tests are a regression
- WHEN the number of tests a check counts drops against the previous run THE SYSTEM SHALL report `tests dropped` with both counts, even if everything still passes. A deleted test is the quietest way to turn a suite green.
- IF the count could not be read for either run THEN THE SYSTEM SHALL say so and SHALL NOT infer a drop.

### CW-04 — Regression kinds are exact and exhaustive
- THE SYSTEM SHALL classify each check against the previous run as exactly one of: `new failure`, `still failing`, `flaky`, `tests dropped`, `became unknown`, `still unknown`, `check removed`, `recovered`, `steady`, or `first run`.
- THE SYSTEM SHALL treat every kind except `recovered`, `steady` and `first run` as a regression.
- WHEN there is no previous run THE SYSTEM SHALL call a check `first run` only if it passed. A first run that failed, was flaky or was unknown is a `new failure`, `flaky` or `became unknown`: a first run is not a free pass.
- WHEN a check present in the previous run is absent from this one THE SYSTEM SHALL report `check removed`. Dropping a check is the quietest way to turn a run green.
- THE SYSTEM SHALL return the same classification whatever order the checks and repeats arrive in.

### CW-05 — Quiet when nothing regressed
- WHEN a run has no regression THE SYSTEM SHALL produce no notification text. The scheduled job is `silent`, so the agent speaks only when told there is something to say.
- WHEN a run has regressions THE SYSTEM SHALL produce one short message that names each regression, the check, and the evidence, without secrets or file contents.

### CW-06 — Only allow-listed commands run
- THE SYSTEM SHALL run a command only if it is in `checks.json` and starts with `pnpm`.
- THE SYSTEM SHALL refuse any command containing a publish, deploy, send or destructive word (`publish`, `apply`, `destroy`, `submit`, `push`, `reset`, `clean`, `rm`), and any shell metacharacter (`;`, `&`, `|`, `` ` ``, `$`, `>`, `<`, a newline).
- THE SYSTEM SHALL run each command with no shell, in the repository root, with a hard timeout and a bounded amount of captured output.

### CW-07 — The backend trusts only the gateway
- THE SYSTEM SHALL accept `/api/*` requests only with a valid, fresh gateway v2 signature (`X-KiroCrew-Proxy-V2` with a one-time `X-KiroCrew-Proxy-Nonce`), computed exactly as Crew computes it over the raw request target.
- THE SYSTEM SHALL refuse a request that carries only the v1 signature. v1 has no nonce, so accepting it when v2 is absent would let a captured request be replayed within 60 seconds by stripping the v2 headers.
- THE SYSTEM SHALL leave `/health` unauthenticated, because the gateway probes it directly, and SHALL expose nothing else without a signature.
- IF no secret is configured THEN THE SYSTEM SHALL refuse every `/api/*` request.
- THE SYSTEM SHALL bind to loopback only.

### CW-08 — Input to the backend is bounded and validated
- THE SYSTEM SHALL refuse a request body over 64 KiB, and a run record that does not have exactly the expected fields and types, with a plain error and no stack trace.
- THE SYSTEM SHALL keep at most 200 runs, dropping the oldest.

### CW-09 — It never reaches outside the repository
- THE SYSTEM SHALL accept a repository path only if it exists, is a directory, and contains `pnpm-workspace.yaml` and `AGENTS.md`.
- THE SYSTEM SHALL write only inside its own data directory, with owner-only permissions, and SHALL never read files matched by the repository's `.kiroignore`.

### CW-10 — The dashboard says only what was measured
- THE SYSTEM SHALL show, for the latest run, each check's outcome, its repeats, its test count and its duration, and the regressions; and for history, the last runs.
- WHEN there is no run THE SYSTEM SHALL say "No run yet" and offer to run one, and SHALL NOT show placeholder numbers.
- WHEN the backend is unreachable THE SYSTEM SHALL say so and what to do, and SHALL NOT show stale data as current.

### CW-11 — It keeps its own evidence and never edits the repository
- THE SYSTEM SHALL record every run, with its findings, in its own data directory, and SHALL NOT write into the repository it watches.
- THE SYSTEM SHALL give the agent no file-write tool. A person copies a finding worth keeping into `docs/kiro/` through a normal reviewed change.

### CW-12 — A weekly digest says what the history shows
- THE SYSTEM SHALL summarise the last 7 days from the stored runs: runs, how many had regressions, the checks that were flaky, and the first and last test counts per check.
- WHEN there are no runs in the window THE SYSTEM SHALL say so, and SHALL NOT report zeroes as if they were measurements.

## Analysis

- **Why checks run in a script and not only in the agent.** A model deciding "did the tests pass?" is exactly the AI-on-the-verdict-path the product forbids. The script runs the commands and classifies deterministically (CW-01 to CW-04); the agent's job is to explain, suggest a cause and decide whether a person should be told.
- **Notifications.** Crew documents Slack and the dashboard as delivery targets. Telegram is a chat interface only, so "heartbeat to Telegram" in the architecture sketch is not built. The cron is `silent` and the agent notifies only on regression.
- **Timezone.** Wall-clock crons need an explicit zone. The jobs state `UTC` unless the person changes it in the manifest: this is a decision for the owner, not a default to hide.
- **What the dashboard does not show,** because it does not exist: satellite confirmation, provider adherence, the dark-room canary, formulary drift of a published table. They are listed in "Later" in `tasks.md` so no one mistakes them for done.
- **Formulary:** the pipeline's own tests are watched like any other suite. Drift of a *published* table is not watched yet because nothing is published; `pipeline verify` would exit non-zero for that normal state and the app would call it a regression.
- **The agent's shell is not the repository's.** The repository's deny hooks guard Kiro IDE and CLI sessions, not Crew agents. The safeguards that hold in Crew are the script's allow-list (CW-06) and the agent having no write tool (CW-11). The agent's prompt says so plainly.
- **Version.** Written against the installed Crew 0.12.0 (the docs recommend 0.13 for git installs). Fields the docs omit but 0.12 honours (`silent`, `timezone`, `timeout_secs`) were read from Crew's source and are exercised by `AppManifest` validation in the tests.
