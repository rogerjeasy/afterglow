---
name: formulary-review
description: How to propose or check a medicine storage entry against its stored label for the Afterglow formulary pipeline. Use when writing a proposal as the Label Reader or a report as the Pharmacist Validator.
---
# Formulary review

The label is the law. The pipeline (`afterglow-formulary`) re-checks everything you write, and a licensed pharmacist approves. You only propose or check. Read `afterglow-formulary/src/proposal.ts` for the exact shapes; read `afterglow-formulary/README.md` for who may write where.

## What counts as stated
- A temperature is stated if the excerpt says it in °C, or in °F that converts exactly (86°F is 30°C). A space before the degree sign is different typography and the pipeline will not match it: copy the excerpt exactly.
- A duration is stated in days or weeks (weeks times 7). "One month", "a fortnight" and number words are **not** read: say it needs a person.
- `maxTempC` is at least 8 (the top of the refrigerated range the model uses). Anything lower is not representable.
- One statement per entry: `unopened` or `inUse`.

## Proposer (family A)
Copy the excerpt word for word from the source `text`; take `product`, `labelVersion`, `title` and `url` from the source exactly; write one file under `afterglow-formulary/proposals/`. If a statement is ambiguous, write nothing and say why.

## Validator (family B, a different vendor)
Read the label yourself **before** reading the proposal's numbers, and put what you read in `extracted`. Copying the proposal's numbers defeats the check. Disagree if the excerpt is not in the source, if numbers mix two statements, if a range was read as a maximum, or if you are unsure. When in doubt, disagree.

## Never
Estimate, extrapolate from a similar product, use a general rule, or write to `validated/`, `review-queue/` or any signature.
