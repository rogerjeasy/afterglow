# Cloud accounts — Tasks

Tasks map to requirement ids. Property tests are the definition of done (`tech.md`). Status: `[x]` done, `[ ]` planned.

## Server (`services/vault`)
- [x] 1. Pure handler over a store interface: routes, claims, envelope validation, versions (CA-01..CA-06)
- [x] 2. DynamoDB store with conditional writes; Lambda entry point; logs without bodies or ids (CA-03, CA-04, CA-06)
- [x] 3. Property tests CA-01..CA-06 with an in-memory store and a failing store
- [x] 4. Bundle for Lambda (Node, ESM, AWS SDK from the runtime)

## Infrastructure (`infra/modules/vault-api`)
- [x] 5. Function, role and least-privilege policy, encrypted log group (CA-08)
- [x] 6. HTTP API, JWT authorizer on every route, CORS for the app's origins, throttling (CA-07)
- [x] 7. Wire into `infra/regional`, outputs for the app, offline plan tests
- [x] 8. Plan, show, apply: bootstrap, then `dev` in `eu-central-1`

## App (`apps/mobile/src/cloud`)
- [x] 9. Login-secret derivation and its properties (CA-09)
- [x] 10. Cognito sign-up, email confirmation, SRP sign-in, refresh, sign-out and delete (CA-09, CA-11, CA-05)
- [x] 11. Cloud vault sync: device-first save, push, 409 merge of event logs, offline open (CA-10)
- [x] 12. "You" screen: create a cloud account, confirm the email code, sign in on another device, sign out, delete
- [x] 13. CSP `connect-src` for Cognito and the API only (ACC-17)
- [x] 14. Sign-up to synced household, no passphrase in any request, isolation as seen by the app: done as controller tests against the real `services/vault` handler with a fake Cognito (`apps/mobile/src/spaces/cloud.test.ts`), not as Playwright tests with mocked network; the browser path was proven live in task 15
- [x] 15. Live check against the deployed stack with two throwaway users, then delete them

## Later
- [ ] Forgotten passphrase: Cognito email-code reset plus the recovery code
- [ ] Passkeys

## Results (2026-11-26)

- **Server:** 8 properties in `services/vault` (isolation across any interleaving of many users, ciphertext only, versions, delete, failure). Contract test against a real device vault record.
- **Infrastructure:** 6 offline plan tests for `vault-api`; Checkov 42 passed, 0 failed. Applied to account 503002144480, `eu-central-1`, environment `dev`: bootstrap (20 resources) and the regional stack (72). A post-apply plan shows no drift.
- **App:** 13 controller tests drive the real `services/vault` handler (two devices, offline, merge, delete, passphrase change and its failure paths, revocation across restarts); 6 merge and login-secret properties; adapters seam tests.
- **Live check against the deployed stack, two throwaway users, then deleted:** sign-in through Cognito SRP; first sign-in creates and uploads the vault (404 then 200); a person added on the device synced; real-token checks all passed: A reads its own vault, the stored record contains no household text, B never sees A's vault, B's writes land only under B, a body naming another account is refused (400), B's delete leaves A intact, a tampered token gets 401; the raw table holds ciphertext only; a browser with no local copy signed in and got the household back.
- **Found on first apply:** Cognito refuses refresh-token rotation together with `ALLOW_REFRESH_TOKEN_AUTH`. Rotation was dropped (tokens are kept in memory only, revocation stays on); the identity test now states the real contract.
- **Found by an automated security review and fixed, each with a test:** delete before passphrase proof; passphrase change not reaching Cognito; untrusted record overwriting a local vault; non-atomic secret rotation; revocation forgotten across restarts.
