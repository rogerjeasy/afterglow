---
inclusion: manual
---
# Release checklist

Invoke with `#release-checklist`. Each gate says how to check it and who can meet it. "Machine" gates are checked with a command and its output quoted. "Human" gates are listed, never attempted by an agent.

## Machine gates
1. **Types and lint are clean.** `pnpm typecheck` and `pnpm lint` exit 0.
2. **Every property suite is green, repeatedly.** `pnpm test` exits 0. For anything random, run the property suite at least three times: a flaky property is a bug found, not noise (see `docs/kiro/pbt-catches.md`, HL-07).
3. **The core is green in a browser.** `pnpm --filter @afterglow/core test:browser`.
4. **The Night Shell holds.** Build the app, then `pnpm exec playwright test` in `apps/mobile`: the pixel scan of every route in Night, Dusk and Ember, the 320 px overflow checks and the 44 px target checks all pass.
5. **No raw colour outside the theme.** No hex value appears in `apps/mobile/src` or `packages/design-system/src` outside `theme.night.json`.
6. **Every requirement has a property.** Each EARS id in the specs appears in a test name.
7. **Every catch is recorded.** New shrunken counterexamples are in `docs/kiro/pbt-catches.md`, with whether the implementation, the test or the requirement was wrong.
8. **Nothing validated by hand.** `git log -- afterglow-formulary/validated` shows commits only from the review pipeline's approval.
9. **No secrets.** No file matched by `.kiroignore` is tracked; no key material in the repository (`git ls-files | grep -E '\.(key|pem|p8)$'` is empty).
10. **The pipeline's tests.** `pnpm --filter @afterglow/formulary-pipeline test`.

## Human gates (an agent lists these and stops)
- **Formulary:** a licensed pharmacist has approved at least the entries that ship; the review key's public half is in `TRUST_ANCHORS` in a reviewed commit; the two questions in `docs/kiro/pharmacist-questions.md` are answered. Until then the app shows no medicine clock, by design.
- **Privacy review of Q1** (`.kiro/specs/cells/requirements.md`): re-confirmation reports versus a server-side carry-forward. Until decided, the map is simulated and labelled so.
- **AWS:** `terraform plan` reviewed and `terraform apply` run by a person.
- **Stores:** signing identities, `eas submit`, store listings.
- **Real messages:** any SMS, voice call or push to a real person.
- **Publishing:** Powers, open data, the data licence of the formulary table.
- **Trademark search** for the brand mark before a store listing.

## How to report
Three lists: met (with the evidence quoted), not met (what is red and where), and the human gates. Never write "should be fine".
