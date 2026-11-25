---
name: kiro-evidence
description: Record evidence for the hackathon write-up truthfully: a property-test catch, an experiment result, a privacy finding or a hook event, appended to docs/kiro. Use whenever a property fails and shrinks, a hook blocks something, or an experiment finishes.
---
# Recording evidence

Nothing is claimed in the write-up that is not in `docs/kiro/`. Append the same day, in the file's existing style. Be accurate over impressive: a negative result is evidence too.

## `docs/kiro/pbt-catches.md` (a real bug a property found)
Heading `## <date> · <requirement id> · <one-line summary>`, then: **Requirement**, **Property**, **How it surfaced** (include if it was flaky), **Shrunken counterexample** (the real one, in a code block), **Root cause** and whether it was the implementation, the test or the requirement, **Fix**, **Tests added**, and the **mutation check** (the old code fails the new test).
Be honest about how it was found. If a hand-built test found it and not a fast-check shrink, say so in the entry.

## `docs/kiro/privacy-findings.md` (Privacy Red Team)
The attack, how it was run, whether it worked, the smallest fix. Record attempts that failed.

## `docs/kiro/experiments.md`
The row's hypothesis, method, the metric measured, the result, the date and a link to the evidence. Keep negative results.

## Rules
- Never paste a secret, a coordinate or a real person's data.
- Quote real output, not a paraphrase of what you expect it to say.
- Do not edit an old entry to look better; add a dated note.
