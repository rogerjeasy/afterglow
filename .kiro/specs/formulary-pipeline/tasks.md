# Implementation Plan: Formulary pipeline
## Overview
`afterglow-formulary/` (to be lifted out as its own repository). Status: `[x]` done, `[ ]` planned, `[H]` a human gate. Requirement ids (FP-01..FP-10) are in `requirements.md`.
## Tasks
- [x] 1. Ids and paths (`safe.ts`), sources with hashes (`sources.ts`) — _FP-08, FP-09_
- [x] 2. Number checks: °C and °F, days and weeks, notes may not add a figure (`numbers.ts`) — _FP-02_
- [x] 3. Proposal and report contracts; every check with every reason (`proposal.ts`) — _FP-01, FP-03, FP-04_
- [x] 4. Approval: name, real past date, explicit "read the label", re-check, sign `canonicalPayload`, review log (`approve.ts`) — _FP-05_
- [x] 5. Snapshot: built, signed, and loaded by the real app loader before it is returned (`snapshot.ts`) — _FP-06_
- [x] 6. Keys: created outside the repo, owner-only, never printed; public anchors only (`keys.ts`) — _FP-07_
- [x] 7. Generated documentation (`docs.ts`) — _FP-10_
- [x] 8. Command line and file layout (`cli.ts`, `store.ts`); tested end to end in a temporary directory
- [x] 9. Tests: 35 (31 properties and examples, 4 command-line); invented fixtures only
## Human gates
- [ ] [H] A licensed pharmacist approves; no one is named here
- [ ] [H] The review key is generated and its public half is added to `TRUST_ANCHORS` in a reviewed commit
- [ ] [H] Answer the two questions in `docs/kiro/pharmacist-questions.md`
- [ ] [H] Run the Label Reader and Validator on two model families (Amazon Bedrock) to produce proposal and report files
- [ ] [H] Decide the data licence of the published table
## Later
- [ ] 10. Ingest from openFDA, EMA, SAHPRA and WHO feeds (the MCP server in `tools/mcp/openfda`)
- [ ] 11. A `sinceOpeningDays` entry type, if the pharmacist's answer to question 2 needs it (a schema change in core)
- [ ] 12. Evaluation set of labelled extractions run on every model change (architecture 9)
