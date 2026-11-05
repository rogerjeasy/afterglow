# Requirements Document

## Introduction

Accounts and Spaces: optional zero-knowledge accounts and an isolated demo mode.

**Module:** `packages/adapters/src/{crypto,accounts}` (platform adapter, WebCrypto) · `apps/mobile/src/spaces`.
**Workflow:** Requirements-First (product-driven, security-critical).
**Spec name equals package name** per `structure.md`.

Afterglow works with no account (`afterglow-project-description.md` §6.1, ADR-006). An optional account adds a private, encrypted space for a person's household data. This spec covers three **spaces**: **guest** (the anonymous device space that exists today), **demo** (a throwaway sandbox with simulated data) and **account** (an encrypted vault unlocked by a passphrase). The design follows the docs: "household data encrypted at rest with user-held keys" (§12) and "customer-held keys for household sync" (architecture §11.1). The server, when it exists, only ever holds ciphertext.

## Glossary

- **Space** — the data context the app is running in: `guest`, `demo` or `account`.
- **Vault** — one account's stored record: KDF parameters, wrapped data key, wrapped recovery key, encrypted data.
- **KEK** — key-encryption key, derived from the passphrase. Never stored.
- **DEK** — data-encryption key, random 256-bit AES-GCM key. Stored only wrapped.
- **Session** — an unlocked account: holds the DEK as a non-extractable key in memory only.
- **Recovery code** — a random 125-bit code shown once; wraps the DEK so a forgotten passphrase is recoverable.

## Requirements

### ACC-01 — Accounts are optional; safety never waits on sign-in

- THE SYSTEM SHALL provide every safety feature in the guest and demo spaces without an account.
- THE SYSTEM SHALL NOT require sign-in before showing the Hearth, the Cold screen or any clock.

### ACC-02 — Spaces are isolated

**User story:** As a person on a shared phone, I want other people's data to be unreachable from my account.

- THE SYSTEM SHALL keep guest, demo and each account's data in separate stores with no shared keys.
- WHEN the space changes THE SYSTEM SHALL discard the previous in-memory store and key before the new one is created.
- THE SYSTEM SHALL NOT read or write another account's vault from a session.

### ACC-03 — Demo is ephemeral and labelled

- THE SYSTEM SHALL keep demo data in memory only, never write it to persistent storage, and never send it anywhere.
- WHILE in demo THE SYSTEM SHALL show that the data is simulated and offer a one-tap exit, which discards it.
- THE SYSTEM SHALL NOT mix demo data into the guest space or any account.

### ACC-04 — Zero-knowledge at rest

- THE SYSTEM SHALL encrypt an account's data with AES-256-GCM under a random DEK.
- THE SYSTEM SHALL NOT store the passphrase, a passphrase hash, the KEK, the raw DEK or any plaintext of the data.
- THE SYSTEM SHALL verify a passphrase only by successfully unwrapping the DEK (authenticated decryption), not by comparing a stored hash.

### ACC-05 — Fail closed on wrong passphrase or tampering

- IF the passphrase is wrong, or any part of the vault was altered, THEN THE SYSTEM SHALL return a generic failure, expose no data and create no session.
- THE SYSTEM SHALL NOT distinguish "wrong passphrase" from "corrupted vault" in what it tells the user.

### ACC-06 — Ciphertext is bound to its account

- THE SYSTEM SHALL bind every ciphertext to its account id and purpose as additional authenticated data.
- IF a ciphertext from one account is placed in another account's vault THEN decryption SHALL fail.

### ACC-07 — Key handling

- THE SYSTEM SHALL hold the unlocked DEK as a non-extractable key, in memory only.
- WHEN the account is locked or signed out THE SYSTEM SHALL flush pending writes, drop the session and the store, and require the passphrase again.

### ACC-08 — Key derivation

- THE SYSTEM SHALL derive the KEK with PBKDF2-HMAC-SHA256 at no fewer than 600,000 iterations and a random 128-bit salt per account.
- THE SYSTEM SHALL store the KDF name, iterations and salt in the vault so parameters can be raised later.

### ACC-09 — No nonce reuse

- THE SYSTEM SHALL use a fresh random 96-bit IV for every encryption.

### ACC-10 — Passphrase policy

- THE SYSTEM SHALL require at least 12 characters, at least 5 distinct characters, no match with the account name, and not a common passphrase.
- THE SYSTEM SHALL explain why a passphrase was refused in plain words.

### ACC-11 — Sign-in throttling

- WHEN sign-in fails five times THE SYSTEM SHALL refuse further attempts for a delay that doubles with each further failure, up to 15 minutes, and reset on success.
- THE SYSTEM SHALL state honestly that this slows casual guessing but that protection against someone holding a copy of the data comes from the passphrase and the KDF.

### ACC-12 — Recovery

- THE SYSTEM SHALL generate a 125-bit random recovery code at sign-up, show it once, and require the person to confirm they saved it.
- THE SYSTEM SHALL let the recovery code reset the passphrase without losing data.
- THE SYSTEM SHALL state plainly that without the passphrase **and** the recovery code the data cannot be recovered (ADR-006: privacy wins).

### ACC-13 — Locking

- THE SYSTEM SHALL lock an unlocked account after 10 minutes without interaction.
- WHILE an outage is active THE SYSTEM SHALL NOT auto-lock, because a lock screen in a blackout is a safety cost. A manual lock is always available.

### ACC-14 — Re-authentication for sensitive actions

- THE SYSTEM SHALL require the current passphrase to change the passphrase, regenerate the recovery code, or delete the account.

### ACC-15 — Export and deletion

- THE SYSTEM SHALL offer export of an account's data as a file and deletion of the account, each within two taps.
- WHEN an account is deleted THE SYSTEM SHALL remove its vault and directory entry, discard its session and give the device a new anonymous identity.

### ACC-16 — No children's accounts

- THE SYSTEM SHALL require the person to confirm they are 18 or older before an account is created, and SHALL NOT store that confirmation or any date of birth.

### ACC-17 — Page hardening

- THE SYSTEM SHALL be served with a Content-Security-Policy that allows scripts only from its own origin, forbids framing, and sets `base-uri` and `object-src` to none, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a Permissions-Policy that denies unneeded capabilities.

### ACC-18 — Server-ready

- THE SYSTEM SHALL keep the vault format self-describing and versioned so that a future server stores only that record (ciphertext and KDF parameters) and never receives the passphrase, KEK or DEK.

## Analysis

- **What this does not do (honest limits).** There is no server, so an account lives on one device and does not follow the person to another. A person who forgets the passphrase and loses the recovery code loses the data by design. Someone with a copy of the stored vault can guess passphrases offline; the cost of each guess is set by PBKDF2 and the passphrase policy, which is why the policy and iteration count are requirements. Client-side throttling cannot stop that attack and the UI says so.
- **Who can read what.** Another person on the same phone can see that an account name exists (the directory lists names so you can pick yours) but cannot read its data without the passphrase. Page script on the same origin could call the unlocked key; that is why ACC-17 forbids third-party scripts and inline script, and why the key is non-extractable (it cannot be exported, only used).
- **Why PBKDF2 and AES-GCM from WebCrypto.** The architecture names libsodium and Argon2-class hashing for later. PBKDF2-SHA256 at 600,000 iterations is the OWASP-recommended floor for PBKDF2, needs no dependency, and runs identically on browsers and Node (ADR-002). Argon2id is a memory-hard improvement; the vault records the KDF name so a migration is a re-wrap, not a re-encryption of data.
- **Why a wrapped DEK.** Changing the passphrase or using the recovery code re-wraps one small key instead of re-encrypting all data, and a recovery code can be an independent second wrap.
- **Multiple tabs.** Two tabs editing the same account can overwrite each other's latest changes. Flushes only replace the data field of the vault so a passphrase change in one tab is not lost. Cross-tab merge is future work (the event log is mergeable by design).
- **Guest data is not encrypted.** Guest is the anonymous, no-account space that exists today. It is device-local plaintext like any web app's local storage. The Account screen says that creating an account is how to get encryption.
- **Out of scope here:** passkeys, SMS/email OTP, Cognito, cross-device sync, Business/Beacon roles and household sharing (all depend on the server and are tracked in the implementation plan, Wave 6.9).

## Verification

- `packages/adapters`: 36 tests (ACC-02, 04..12, 14..16), including the mutation checks recorded in `docs/kiro/pbt-catches.md`.
- `apps/mobile`: 19 space-controller tests (ACC-01..03, 05, 11..16), 4 mode-policy tests, 6 header tests (ACC-17).
- A real-browser audit under the exact production headers (26 checks): no Content-Security-Policy violations through sign-up, lock, wrong passphrase, lockout and recovery; no plaintext, passphrase or recovery code in `localStorage`; pixel scan of the account screens in Night mode.

## Known limits (stated, not hidden)

- **No server, no cross-device accounts.** An account exists on one device. Server accounts, sync and per-account authorisation are Wave 6.9 and need AWS (a human gate).
- **Offline guessing.** Someone who copies the stored vault can try passphrases offline at PBKDF2 speed; client-side throttling does not apply to them. The 12-character policy and 600,000 iterations are the defence. Argon2id (memory-hard) is the planned upgrade.
- **Same-origin script.** The key is non-extractable and the CSP forbids third-party and inline script, but a compromised build would defeat any in-browser scheme. Signed releases and dependency scanning (architecture 11.1) cover that.
- **Guest data is unencrypted** by design (anonymous, no account). The You screen says so.
- **Two tabs** open on the same account can overwrite each other's latest household changes; merging them is future work.
