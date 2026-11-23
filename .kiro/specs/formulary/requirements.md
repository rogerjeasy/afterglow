# Formulary — Requirements

**Module:** `packages/core/src/formulary` (pure; no I/O, no timers, no randomness).
**Workflow:** Requirements-First (product and safety driven; the rules come from `label-only-medicine.md`).
**Spec name equals package name** per `structure.md`.

The formulary module turns a **signed, pharmacist-approved table** into medicine excursion clocks. It is the only code in the product that may produce a medicine storage clock. It never contains drug data: the validated table lives in the separate `afterglow-formulary` repository and is written only by its review pipeline. This module decides **whether an entry may be trusted** and **how much of its label budget has been consumed**. It never estimates, never extrapolates from a similar product, and never says "safe".

## Glossary (this spec)
- **Entry** — `{ product, labelVersion, condition: unopened|inUse, maxTempC, maxDays, notes, source, approver, approvedAt, signature }`. `source` is `{ title, url, excerpt }` so the screen can show the label excerpt.
- **Validated entry** — an entry that passed schema checks **and** whose signature verified, produced only by `buildFormulary`.
- **Verifier** — an injected synchronous function `(payload, signature) => boolean`. The core imports no crypto. The adapter layer owns the trust anchors and does the real (asynchronous) Ed25519 verification before calling it.
- **Room-temperature allowance** — the label's `maxTempC` for at most `maxDays`.
- **Refrigerated range** — at or below `REFRIGERATED_MAX_C` (8 °C, the upper edge of the 2–8 °C cold chain).
- **Excursion clock** — the budget of `maxDays × 1440` minutes, consumed only while the temperature is above the refrigerated range and at or below `maxTempC`.
- **Result** — a discriminated union `noExcursion | consuming | exhausted | beyondLabel | unknown`.

## Requirements

### FM-01 — Only validly signed, well-formed entries are admitted
**User story:** As a person who depends on medicine, I want every number on my screen to come from a pharmacist-approved label.
- THE SYSTEM SHALL admit an entry only if it has exactly the fields of the entry shape, each valid (finite numbers in range, with `maxTempC` from 8 °C to 60 °C and `maxDays` from 0 to 3650; non-empty strings without control characters; an `https` source URL; a real calendar date), **and** the verifier returns exactly `true` for its canonical payload and signature.
- IF an entry is malformed, carries an unexpected field, or fails verification THEN THE SYSTEM SHALL reject it with a reason and SHALL NOT include it in the table.
- IF the verifier throws, or returns anything other than `true` (including a Promise or any truthy value) THEN THE SYSTEM SHALL reject the entry.
- WHEN any signed field of an admitted entry is altered THE SYSTEM SHALL reject it.
- THE SYSTEM SHALL NOT throw for any input, however malformed.

### FM-02 — Not in the table means no clock
**User story:** As a person, I want the app to say it does not know rather than guess from a similar medicine.
- WHEN a product is looked up THE SYSTEM SHALL match only an exact normalised product name (Unicode NFKC, lower case, collapsed whitespace) and condition.
- IF no admitted entry matches, or the query is empty, THEN THE SYSTEM SHALL return `notInTable` with "ask your pharmacist", the reason, and the offer to submit the label for review.
- THE SYSTEM SHALL NOT match by prefix, substring, similarity or class.

### FM-03 — A forged or unadmitted entry never yields a clock
- THE SYSTEM SHALL compute a clock only for an entry object produced by `buildFormulary`.
- IF an entry has been copied, spread, structurally cloned, hand-built or cast THEN THE SYSTEM SHALL return `unknown` and SHALL NOT compute a clock.
- WHEN a formulary object is hand-built THE SYSTEM SHALL return `notInTable` for every lookup in it.

### FM-04 — The clock never exceeds its budget
- THE SYSTEM SHALL report `consumedMinutes` between 0 and `maxDays × 1440` inclusive, and `remainingMinutes = budget − consumed` when it reports a remainder.
- WHEN the budget is fully consumed THE SYSTEM SHALL report `exhausted`, report `remainingMinutes = 0`, and stop.

### FM-05 — The clock is monotonic
- FOR a fixed temperature series, AS `nowMinute` increases, `consumedMinutes` SHALL NOT decrease.
- AS `nowMinute` increases the status SHALL NOT move backwards through `noExcursion → consuming → exhausted → beyondLabel`.

### FM-06 — No consumption inside the refrigerated range
- WHILE the temperature stays at or below `REFRIGERATED_MAX_C` THE SYSTEM SHALL consume nothing and report `noExcursion`.

### FM-07 — Beyond the label, the clock stops and says so
- IF the temperature exceeds `maxTempC` at any time in the window THEN THE SYSTEM SHALL report `beyondLabel`, SHALL report no remaining time, and SHALL say "Excursion beyond label: consult your pharmacist."
- ONCE `beyondLabel` has been reported for a series THE SYSTEM SHALL NOT report anything else for a later `nowMinute`.

### FM-08 — Sampling is conservative
- WHEN an interval's endpoints straddle a threshold THE SYSTEM SHALL judge the interval by its warmer endpoint.
- FOR a modelled monotone temperature curve, a coarser sampling step SHALL NOT report less consumption than a finer step that divides it.

### FM-09 — Unknown is a first-class answer
- IF the window or a sample is invalid (non-finite, negative, `now` before `start`, minutes not strictly increasing, no sample at or before `start`, more than 100 000 samples, an invalid thermal state, or a non-positive step) THEN THE SYSTEM SHALL return `unknown` with a plain reason and what would resolve it.

### FM-10 — Every result is cited and never says "safe"
- THE SYSTEM SHALL attach to every non-`unknown` result the product, condition, label version, approver, approval date, source title, URL and label excerpt, and the sentence "Derived from the label. Confirm with your pharmacist. Not medical advice."
- THE SYSTEM SHALL NOT use the word "safe" in any message it generates.

### FM-11 — The table is order-independent and resolves conflicts closed
- THE SYSTEM SHALL return the same table for any ordering of the same entries.
- WHEN two admitted entries share a product and condition THE SYSTEM SHALL keep the one with the later `approvedAt`.
- IF the latest two are tied and differ THEN THE SYSTEM SHALL reject the whole group as conflicting.

### FM-12 — Freezing is flagged, not hidden
- IF the temperature reaches 0 °C or below within the window THEN THE SYSTEM SHALL set `reachedFreezing` and add the line "The temperature reached 0 °C or below. Many labels forbid freezing. Check your label."

### FM-13 — Search lists only admitted entries
- THE SYSTEM SHALL search admitted entries by normalised name prefix, deterministically ranked and limited, and return nothing for an empty query.

### FM-14 — An in-use result never implies it is the whole label count
- WHEN the entry's condition is `inUse` THE SYSTEM SHALL add to every non-`unknown` result the line "This counts only time outside the fridge. If your label also counts days since you first opened it, that count is separate. Check your label."
- WHEN the condition is `unopened` THE SYSTEM SHALL NOT add that line.

### FM-15 — Only entries signed by a pinned trust anchor are admitted (loader, `packages/adapters/src/formulary`)
**User story:** As a person who depends on medicine, I want a table that only the review pipeline can have produced.
- THE SYSTEM SHALL verify each entry's signature with Ed25519 against a public key pinned in the app, where the signature is `<keyId>.<base64url signature>` over the core's canonical payload.
- IF the key id is unknown, the signature is malformed, the signature was made by another key, or any signed field changed THEN THE SYSTEM SHALL reject the entry.
- THE SYSTEM SHALL NOT throw for any snapshot, anchor list or signature.

### FM-16 — An older snapshot is refused (rollback protection)
- THE SYSTEM SHALL require `formularyVersion` to be a positive decimal integer without leading zeros.
- IF the offered version is lower than the last accepted version THEN THE SYSTEM SHALL refuse the whole snapshot and return no table.
- WHEN the offered version equals or exceeds the last accepted version THE SYSTEM SHALL accept it and return the version for the caller to persist.

### FM-17 — A bad trust configuration yields no table
- IF the anchor list is empty, has a duplicate key id, has a key id outside `[A-Za-z0-9_-]{1,64}`, or has a public key that is not 32 bytes of base64url THEN THE SYSTEM SHALL return `badAnchors` and no table.

### FM-18 — The core stays the judge
- THE SYSTEM SHALL build the table only through the core's `buildFormulary`, so every rule FM-01 to FM-14 applies to loaded entries, and SHALL NOT mark any entry admitted itself.

### FM-19 — The snapshot as a whole is signed (manifest)
**User story:** As a person who depends on medicine, I want a withdrawn entry to stay withdrawn.
- THE SYSTEM SHALL require, in addition to each entry's signature, a manifest signature `<keyId>.<base64url>` over `["afterglow-formulary-manifest/v1", formularyVersion, sorted entry signatures]`, verified against a pinned anchor, before any entry is admitted.
- IF the manifest is missing, malformed, signed by an unpinned key, or does not match the version and the exact set of entry signatures THEN THE SYSTEM SHALL refuse the whole snapshot with `badManifest`.
- THE SYSTEM SHALL refuse a snapshot in which any entry is not an object with a string signature.
- WHEN an old entry is replayed inside a snapshot with a higher version, or an entry is removed from or added to a signed snapshot, THE SYSTEM SHALL refuse it.

## Analysis
- **Where trust lives.** The label rule requires "its signature verifies". Real Ed25519 verification through WebCrypto is asynchronous, and the core must stay pure and synchronous. So the core takes an injected synchronous verifier and checks it returned exactly `true`. The adapter layer verifies asynchronously first and hands the core a lookup over the results. The pinned public keys (trust anchors) are an adapter and release concern, not the core's.
- **Why a registry, not a type alone.** A TypeScript brand stops honest mistakes; it does not stop a cast. Admitted entries are tracked in a module-private `WeakSet`, so a cast, spread or clone is not trusted (FM-03).
- **Refrigerated range is a stated assumption.** The entry shape has `maxTempC` and `maxDays` only. The refrigerated edge (8 °C) is the conventional cold-chain upper bound, not a label claim. The review pipeline and a pharmacist should confirm it applies, and a label with a different refrigerated range needs a schema change, not a code default.
- **In-use semantics need pharmacist confirmation.** Rule 3 of `label-only-medicine.md` consumes the budget only outside the refrigerated range. Some in-use labels count days since first use regardless of temperature. This module follows the rule as written and shows the `condition` and the label excerpt. If a pharmacist says in-use budgets are time-since-opening, that is a schema addition, not a guess here.
- **Conservative sampling.** An interval is judged by its warmer endpoint, and an excursion beyond the label is dated to the start of the interval that contains it. Both err toward consuming more. For a monotone RC curve the warmer endpoint is exact, so coarse sampling can only overstate (FM-08).
- **Revocation and rollback.** A withdrawn entry is represented by publishing a newer snapshot without it. Entry signatures alone do not bind `formularyVersion` or the set of entries, so a monotonic version check would be defeated by replaying an old entry under a higher version. The manifest signature (FM-19) binds the version and the exact entry set, and the loader's rollback check (FM-16) is only meaningful on top of it. The version is persisted only after the manifest verifies.
- **Out of scope:** the AI proposer and validator (pipeline), the signing and review workflow, the real verifier and its key distribution, "Ask Afterglow" refusal for medicine questions, the screens, and any medicine data. No drug names or storage numbers appear in this repository except obviously fictional test fixtures.
