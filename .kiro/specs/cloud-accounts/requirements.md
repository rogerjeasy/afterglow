# Cloud accounts — Requirements

**Modules:** `services/vault` (the API: a Lambda behind API Gateway with a JWT authorizer), `infra/modules/vault-api` (its infrastructure), and `apps/mobile/src/cloud` (sign-in and sync in the app).
**Workflow:** Requirements-First. Builds on `.kiro/specs/accounts` (ACC-01..ACC-18), whose vault record was designed to be the only thing a server stores (ACC-18).
**Decided by the founder (2026-11-26):** real accounts on AWS in `eu-central-1`; one passphrase per person; the agent may apply Terraform after showing the plan.

A person signs in with an email address and one passphrase, on any device, and finds their household there. Nobody else can reach it: not another user, and not the operator, because the server only ever holds ciphertext. Safety still never waits on sign-in (ACC-01): the device keeps an encrypted copy, so a signed-in household opens with no network, and syncs when the network returns.

## Glossary

- **Vault record**: the account's encrypted record from `.kiro/specs/accounts`: KDF parameters, the wrapped data key(s) and the sealed data. It contains no plaintext and no key.
- **Login secret**: the password Cognito sees, derived on the device from the passphrase and the email with PBKDF2-SHA256 (600,000 rounds, its own salt). It is never the passphrase, and the vault key cannot be computed from it.
- **Account id**: the Cognito `sub` of the signed-in user.
- **Version**: a counter the server keeps per vault record for optimistic concurrency.

## Requirements

### CA-01 — Identity comes only from the verified token
**User story:** As a person with an account, I want the server to know who I am from proof, never from what a request claims.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL accept a request only through an API Gateway JWT authorizer that verifies the token against the Cognito user pool's issuer and the app client.
- THE SYSTEM SHALL take the account id only from the verified `sub` claim, and SHALL require `token_use` to be `access` and `client_id` to be the app client.
- THE SYSTEM SHALL NOT read an account id from the path, the query or the body.
- IF the claims are missing or wrong THEN THE SYSTEM SHALL answer 401 and touch no data.

*Property:* `CA-01 a request without valid claims is refused and touches nothing`.

### CA-02 — One person can never reach another's vault
**User story:** As a person, I want certainty that no other account can read, change or delete my data.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL key every read, write and delete by the account id from CA-01 and nothing else.
- For any interleaving of requests by any number of accounts, a GET by an account SHALL return only the record that same account last stored successfully, or 404.
- A DELETE by one account SHALL NOT change any other account's record.

*Property:* `CA-02 across any interleaving of many users, each sees only their own record`.

### CA-03 — The server stores ciphertext only, and never logs it
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL accept on PUT only a well-formed vault record: version 1, PBKDF2 parameters, wrapped keys and sealed data in base64url, within 256 KiB.
- THE SYSTEM SHALL reject anything else with 400 and SHALL NOT store it.
- THE SYSTEM SHALL NOT log request bodies, tokens or account ids; logs carry the method, route, status and duration only.

*Property:* `CA-03 only well-formed vault records are stored`.

### CA-04 — No lost updates between devices
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL store a PUT only when its expected version equals the stored version (or no record exists and none is expected), and SHALL then increase the version by one.
- WHEN versions do not match THE SYSTEM SHALL answer 409 with the current version and store nothing.

*Property:* `CA-04 versions increase by one per accepted write and a stale write is refused`.

### CA-05 — Deleting an account deletes its vault
**Acceptance criteria (EARS):**
- WHEN an account deletes its vault THE SYSTEM SHALL remove it, so a later GET answers 404.
- WHEN a person deletes their account in the app THE SYSTEM SHALL delete the server vault, the Cognito user and the copy on the device.

*Property:* `CA-05 delete removes only the caller's vault`.

### CA-06 — Fail closed on errors
**Acceptance criteria (EARS):**
- IF the store fails THEN THE SYSTEM SHALL answer 503 with a generic message and return no partial data.
- THE SYSTEM SHALL answer every route it does not serve with 404.

*Property:* `CA-06 a failing store yields 503 and nothing else`.

### CA-07 — The edge admits nothing unauthenticated
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL attach the JWT authorizer to every route of the API.
- THE SYSTEM SHALL allow cross-origin calls only from the app's listed origins.
- THE SYSTEM SHALL throttle requests per route.

*Tests:* `infra/modules/vault-api/tests` (offline plan tests).

### CA-08 — Least privilege
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL let the function read, write and delete items in the `vault` table only, and use the region's key only for that table.
- THE SYSTEM SHALL keep the function's logs for 30 days, encrypted.

*Tests:* offline plan tests over the IAM policy.

### CA-09 — The passphrase and the vault key never leave the device
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL derive the login secret on the device with PBKDF2-SHA256, at least 600,000 rounds, with a salt made from a fixed label and the normalised email.
- THE SYSTEM SHALL sign in with SRP, so the login secret itself is not sent.
- THE SYSTEM SHALL NOT send the passphrase, the vault key or the data key in any request.

*Properties:* `CA-09 the login secret is deterministic per email and passphrase, and differs across emails`; browser test `CA-09 no request carries the passphrase`.

### CA-10 — Offline first, and sync that never drops an event
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL save every change to the device's encrypted copy first, and push it to the server after.
- WHEN the server reports a newer version THE SYSTEM SHALL fetch it, merge the two households' event logs (a union, as the event log is order-independent), seal the result and retry.
- THE SYSTEM SHALL let a person who has signed in on this device before open their household with no network.

*Property:* `CA-10 merging two copies keeps every event of both`.

### CA-11 — Signing out leaves nothing readable
**Acceptance criteria (EARS):**
- WHEN a person signs out THE SYSTEM SHALL drop the tokens and every in-memory key, and leave only the encrypted copy on the device.

### CA-12 — Accounts are for adults, and the demo stays a demo
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL require the person to confirm they are 18 or older (ACC-16) before creating a cloud account.
- THE SYSTEM SHALL keep the demo and guest spaces exactly as they are; a cloud account is a third way in, never required.

## Analysis

- **Why one passphrase is safe here.** Two secrets come from it. The vault key uses a random salt stored in the vault record, and the login secret uses a salt built from the email. An attacker who stole Cognito's SRP verifier would have to guess passphrases at PBKDF2's 600,000 rounds per guess, the same cost as attacking the vault record directly. The two derivations share no salt, so knowing the login secret does not give the vault key.
- **What the operator can see.** Email addresses (Cognito), the time and size of each vault write, and ciphertext. Not names of people, foods, medicines or anything in the household.
- **Recovery.** The recovery code still unwraps the data key on any device. Resetting the login secret after a forgotten passphrase needs Cognito's email-code reset; that flow is listed in tasks, after the core.
- **Why a JWT authorizer and `sub`, not per-user IAM credentials.** API Gateway rejects unauthenticated calls before any code runs, and the function cannot be asked for another key because it never reads one from the request. A property test drives thousands of interleaved requests from many users through the real handler to show it.
