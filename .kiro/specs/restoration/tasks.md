# Implementation Plan: Restoration
## Overview
A pure estimator in `packages/core/src/restoration`. Status: `[x]` done, `[ ]` planned. Requirement ids (RS-01..RS-09) are in `requirements.md`.
## Tasks
- [x] 1. Types: `PastOutage`, `RestorationInput`, `RestorationEstimate` (`estimate | promiseOnly | underway | unknown`), `MIN_HISTORY`
  - _Requirements: RS-01, RS-03, RS-08, RS-09_
- [x] 2. `estimateRestoration`: validation, crowd precedence, eligibility filter, nearest-rank percentiles
  - _Requirements: RS-01..RS-09_
- [x] 3. Property tests RS-01..RS-09 (fast-check)
  - _File: `packages/core/src/restoration/restoration.property.test.ts`_
- [ ] 4. Replace the baseline with the weekly forecast job when it beats this on held-out outages (Wave 6.6)
## Notes
- Not on the AI path. Fail closed: no promise, thin history, or bad input gives `unknown` or `promiseOnly`, never a point estimate.
