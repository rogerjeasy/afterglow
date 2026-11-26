# Cloud accounts — Tasks

Tasks map to requirement ids. Property tests are the definition of done (`tech.md`). Status: `[x]` done, `[ ]` planned.

## Server (`services/vault`)
- [ ] 1. Pure handler over a store interface: routes, claims, envelope validation, versions (CA-01..CA-06)
- [ ] 2. DynamoDB store with conditional writes; Lambda entry point; logs without bodies or ids (CA-03, CA-04, CA-06)
- [ ] 3. Property tests CA-01..CA-06 with an in-memory store and a failing store
- [ ] 4. Bundle for Lambda (Node, ESM, AWS SDK from the runtime)

## Infrastructure (`infra/modules/vault-api`)
- [ ] 5. Function, role and least-privilege policy, encrypted log group (CA-08)
- [ ] 6. HTTP API, JWT authorizer on every route, CORS for the app's origins, throttling (CA-07)
- [ ] 7. Wire into `infra/regional`, outputs for the app, offline plan tests
- [ ] 8. Plan, show, apply: bootstrap, then `dev` in `eu-central-1`

## App (`apps/mobile/src/cloud`)
- [ ] 9. Login-secret derivation and its properties (CA-09)
- [ ] 10. Cognito sign-up, email confirmation, SRP sign-in, refresh, sign-out and delete (CA-09, CA-11, CA-05)
- [ ] 11. Cloud vault sync: device-first save, push, 409 merge of event logs, offline open (CA-10)
- [ ] 12. "You" screen: create a cloud account, confirm the email code, sign in on another device, sign out, delete
- [ ] 13. CSP `connect-src` for Cognito and the API only (ACC-17)
- [ ] 14. Browser tests against a mocked Cognito and API: sign-up to synced household, no passphrase in any request, isolation as seen by the app
- [ ] 15. Live check against the deployed stack with two throwaway users, then delete them

## Later
- [ ] Forgotten passphrase: Cognito email-code reset plus the recovery code
- [ ] Passkeys
