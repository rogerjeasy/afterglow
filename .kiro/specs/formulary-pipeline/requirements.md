# Formulary pipeline — Requirements

**Package:** `afterglow-formulary/` (planned as its own repository, `afterglow-formulary`; built here so it shares the app's guardrails and verifier).
**Workflow:** Design-First (a fixed process: source, proposal, check, queue, approval, signature, snapshot).
**Governing invariant:** `.kiro/steering/label-only-medicine.md`. Medicine numbers come only from entries a second model family checked and a licensed pharmacist approved, signed with a key the pipeline's operator holds.

The pipeline produces exactly what the app's loader (`@afterglow/adapters` `loadFormulary`, FM-15 to FM-19) verifies. It contains **no drug data**: the repository ships with an empty `validated/` and nothing is published until a pharmacist approves a first entry.

## Roles and who may write where

| Actor | May write | May not |
|---|---|---|
| Label Reader agent (AI, family A) | `proposals/**` | `validated/**`, `review-queue/**`, signatures |
| Pharmacist Validator agent (AI, family B) | `reports/**` (a validator report handed to `review`) | `validated/**`, `proposals/**`, `review-queue/**` |
| Pipeline (deterministic code) | `review-queue/**`, `rejected/**`, `reviews/log.jsonl` | `validated/**` without an approval |
| Licensed pharmacist, with the signing key | `validated/**` through `approve` only | |

## Requirements

### FP-01 — The excerpt is the label's own words
- THE SYSTEM SHALL accept a proposal only when its label excerpt appears verbatim (whitespace-collapsed) in the stored source text.
- IF the excerpt is not in the source THEN THE SYSTEM SHALL reject the proposal with that reason.

### FP-02 — Every number is in the excerpt
- THE SYSTEM SHALL accept `maxTempC` only when the excerpt states that temperature in degrees Celsius, or in degrees Fahrenheit converting to it exactly.
- THE SYSTEM SHALL accept `maxDays` only when the excerpt states that duration in days, or in weeks (times 7).
- THE SYSTEM SHALL accept `notes` only when every number in it also appears in the excerpt, so a note cannot introduce a figure the label does not state.

### FP-03 — A different model family must agree
- THE SYSTEM SHALL require a validator report whose model family differs (case-insensitively) from the proposer's, and whose model differs.
- THE SYSTEM SHALL require the validator to have extracted the same condition, `maxTempC` and `maxDays`, and to have said `agree`.
- IF they disagree, or the families match, THEN THE SYSTEM SHALL reject the proposal and keep the reasons in `rejected/`.

### FP-04 — The proposal matches its source
- THE SYSTEM SHALL require the proposal's product, label version, title and URL to equal the stored source's, and its entry to pass the core's own entry rules (`formulary.parseEntry`), so the pipeline never queues what the app would refuse.

### FP-05 — Only an approval writes the validated table
- THE SYSTEM SHALL write `validated/` only from `approve`, which requires: a queued item that passes every check again at approval time (the queue is not trusted), a named approver, a real approval date not in the future, an explicit confirmation that the approver has read the label, and a signing key.
- THE SYSTEM SHALL sign `formulary.canonicalPayload(entry)` as `<keyId>.<base64url Ed25519 signature>`, the exact bytes the app verifies.
- THE SYSTEM SHALL record every approval and rejection, with the approver, the date and the SHA-256 of the proposal, in an append-only `reviews/log.jsonl`.

### FP-06 — A published snapshot is verified before it exists
- THE SYSTEM SHALL build `dist/snapshot.json` from `validated/` only after verifying every entry against the pinned public keys in `anchors.json`, refusing on any entry that does not verify, any duplicate product and condition, or an empty table.
- THE SYSTEM SHALL sign the manifest over the new version and the entry signatures, raise the version by exactly one, and then load the result with the real app loader; IF that does not load with no rejected entries THEN THE SYSTEM SHALL write nothing.

### FP-07 — Keys stay out of the repository
- THE SYSTEM SHALL refuse to write a private key inside the repository, refuse to read one whose file is readable by group or others, and never print or log a private key.
- THE SYSTEM SHALL keep only public keys in the repository (`anchors.json`).

### FP-08 — Ids and paths are safe
- THE SYSTEM SHALL accept a proposal id only of the form `[a-z0-9][a-z0-9-]{0,80}` so no id can name a path outside the repository.

### FP-09 — The sources are fixed at ingestion
- THE SYSTEM SHALL store each source with its URL, label version, fetch time and SHA-256, and SHALL refuse a source whose stored text no longer matches its hash.

### FP-10 — The published table is documented from itself
- THE SYSTEM SHALL generate `docs/FORMULARY.md` from the validated entries alone, listing for each its product, condition, limits, label version, approver, approval date and source, so the documentation cannot drift from the table.

## Analysis

- **Why the validator writes `reports/` and not the queue.** The architecture sketch had the validator writing `review-queue/**`. The queue is the pipeline's output and the pharmacist's input, so a model should not write it. The validator hands over a report; `review` decides what is queued. The pipeline re-checks at approval anyway, so this is defence in depth, not the only gate.
- **Same family is refused by the pipeline, not by the agents.** Two Kiro agents with no pinned model would both run on the default family. FP-03 therefore refuses a report whose family matches, and the human gate for running the models on two families stays open.

- **What the machine can and cannot do.** The checks prove the numbers are in the label text and two model families agree. They do not prove the extraction is clinically right (for example which of several storage statements applies to a presentation). That is the pharmacist's job, and the approval step puts the excerpt in front of them.
- **Open questions** are in `docs/kiro/pharmacist-questions.md`: where the refrigerated range ends (8 °C), and products whose in-use budget counts days since opening.
- **Not done here:** the AI calls themselves (Amazon Bedrock, two families). The pipeline defines the contract (a proposal file, a validator report file) and refuses anything that does not meet it. Running the models needs AWS and is a human gate.
- **Data licence** for the published table is a founder decision (see the README).
