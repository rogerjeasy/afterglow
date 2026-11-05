# Implementation Plan: Accounts and Spaces

## Overview

Optional, zero-knowledge accounts and an isolated demo mode. The vault and account service live in the new `@afterglow/adapters` package (WebCrypto, no dependencies). The app owns the active space and the sign-in screens. Status: `[x]` done, `[ ]` planned. Requirement ids (ACC-01..ACC-18) are defined in `requirements.md`.

## Tasks

- [x] 1. Create `@afterglow/adapters` package (tsconfig, vitest, workspace wiring)
  - _Requirements: ACC-18_
  - _Files: `packages/adapters/{package.json,tsconfig.json,vitest.config.ts}`_

- [x] 2. Byte helpers and the vault: KDF, wrapped DEK, recovery wrap, seal/open with AAD, non-extractable session key
  - _Requirements: ACC-04, ACC-05, ACC-06, ACC-07, ACC-08, ACC-09, ACC-12_
  - _Files: `packages/adapters/src/crypto/{bytes,vault}.ts`_

- [x] 3. Passphrase policy
  - _Requirements: ACC-10_
  - _File: `packages/adapters/src/accounts/policy.ts`_

- [x] 4. Account service: directory, create, sign in, recovery, change passphrase, delete, throttling, guest migration
  - _Requirements: ACC-02, ACC-11, ACC-12, ACC-14, ACC-15, ACC-16_
  - _File: `packages/adapters/src/accounts/service.ts`_

- [x] 5. Vault-backed storage: a storage object whose writes are encrypted and flushed
  - _Requirements: ACC-04, ACC-07_
  - _File: `packages/adapters/src/accounts/vault-storage.ts`_

- [x] 6. Property tests ACC-04..ACC-12 (low KDF iterations injected for speed; production default asserted)
  - _Files: `packages/adapters/src/**/*.test.ts`_

- [x] 7. App: spaces (guest, demo, account) with store isolation; demo is in memory only
  - _Requirements: ACC-01, ACC-02, ACC-03_
  - _Files: `apps/mobile/src/spaces/*`_

- [x] 8. App: Account screen (sign up with recovery code, sign in, lock, change passphrase, export, delete), idle auto-lock
  - _Requirements: ACC-10..ACC-16_
  - _File: `apps/mobile/src/screens/You.tsx`_

- [x] 9. Page hardening headers
  - _Requirements: ACC-17_
  - _File: `apps/mobile/vercel.json`_

- [ ] 10. Server accounts: Cognito (passkeys, OTP), ciphertext sync of the vault record, per-account authorisation (Wave 6.9; human gate for AWS)
  - _Requirements: ACC-18_

- [ ] 11. Argon2id KDF migration (re-wrap, no data re-encryption)
  - _Requirements: ACC-08_

## Notes

- Safety features never depend on this module (ACC-01). If anything here fails, the guest space still works.
- Tests inject a low PBKDF2 iteration count for speed; one test asserts the production default is at least 600,000.
- Tasks 10 and 11 are blocked on the backend wave and are not part of this slice.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3"] },
    { "id": 2, "tasks": ["4", "5"] },
    { "id": 3, "tasks": ["6", "7"] },
    { "id": 4, "tasks": ["8", "9"] },
    { "id": 5, "tasks": ["10", "11"] }
  ]
}
```
