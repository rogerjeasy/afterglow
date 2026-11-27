"""Deciding what changed between two runs (CW-01 to CW-04).

Deterministic and order-independent. No model is consulted: whether something regressed is a
verdict, and verdicts are code with citable inputs.
"""

from __future__ import annotations

from collections.abc import Iterable

from .model import REGRESSION_KINDS, CheckOutcome, CheckResult, Finding, Run


def check_outcome(c: CheckResult) -> CheckOutcome:
    """One word for a check across its repeats. Unknown is never promoted to pass (CW-01)."""
    outcomes = {r.outcome for r in c.repeats}
    has_pass, has_fail, has_unknown = "pass" in outcomes, "fail" in outcomes, "unknown" in outcomes
    if has_pass and has_fail:
        return "flaky"  # CW-02: sometimes passing is itself the finding
    if has_fail:
        return "fail"
    if has_unknown:
        return "unknown"
    return "pass"


def count_tests(c: CheckResult) -> int | None:
    """The tests a check counted, or None when any repeat could not be read (CW-03).

    Repeats may count differently when a suite is flaky; the smaller count is used, so a drop is
    never hidden by a lucky repeat.
    """
    counts = [r.tests for r in c.repeats]
    if any(n is None for n in counts):
        return None
    return min(n for n in counts if n is not None)


def run_passed(checks: Iterable[CheckResult]) -> bool:
    """A run passes only when every check passed in every repeat (CW-01). No checks is not a pass."""
    items = list(checks)
    return bool(items) and all(check_outcome(c) == "pass" for c in items)


def _evidence(c: CheckResult, kind: str, prev: CheckResult | None) -> str:
    n = len(c.repeats)
    fails = sum(r.outcome == "fail" for r in c.repeats)
    passes = sum(r.outcome == "pass" for r in c.repeats)
    unknowns = sum(r.outcome == "unknown" for r in c.repeats)
    codes = sorted({r.exit_code for r in c.repeats if r.exit_code not in (None, 0)})
    code_note = f" (exit {', '.join(str(x) for x in codes)})" if codes else ""
    if kind == "flaky":
        return f"passed {passes} of {n} repeats and failed {fails}"
    if kind in ("new failure", "still failing"):
        return f"failed {fails} of {n} repeats{code_note}"
    if kind in ("became unknown", "still unknown"):
        return f"could not be judged in {unknowns} of {n} repeats"
    if kind == "tests dropped" and prev is not None:
        return f"counted {count_tests(c)} tests, down from {count_tests(prev)}"
    if kind == "recovered":
        return f"passed all {n} repeats after not passing before"
    if kind == "steady":
        count = count_tests(c)
        return f"passed all {n} repeats" + (f", {count} tests" if count is not None else "")
    return f"passed all {n} repeats"  # first run


def classify(previous: Run | None, current: Iterable[CheckResult]) -> tuple[Finding, ...]:
    """One finding per check, plus one per check that disappeared (CW-04).

    The order the checks arrive in never changes the answer.
    """
    cur = {c.name: c for c in current}
    prev = {c.name: c for c in previous.checks} if previous is not None else {}
    out: list[Finding] = []

    for name, c in cur.items():
        co = check_outcome(c)
        p = prev.get(name)
        po = check_outcome(p) if p is not None else None
        if co == "flaky":
            kind = "flaky"
        elif co == "fail":
            kind = "still failing" if po == "fail" else "new failure"
        elif co == "unknown":
            kind = "still unknown" if po == "unknown" else "became unknown"
        elif po is None:
            kind = "first run"  # only a check that passed gets a quiet first run
        elif po != "pass":
            kind = "recovered"
        else:
            now, before = count_tests(c), count_tests(p) if p is not None else None
            # CW-03: infer a drop only when both counts were read.
            kind = "tests dropped" if now is not None and before is not None and now < before else "steady"
        out.append(Finding(check=name, kind=kind, evidence=_evidence(c, kind, p)))

    for name in prev:
        if name not in cur:
            out.append(Finding(check=name, kind="check removed", evidence="was in the last run and is not in this one"))

    return tuple(sorted(out, key=lambda f: (f.check, f.kind)))


def regressions(findings: Iterable[Finding]) -> tuple[Finding, ...]:
    return tuple(f for f in findings if f.kind in REGRESSION_KINDS)
