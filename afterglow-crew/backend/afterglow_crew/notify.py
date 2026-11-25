"""What to say, and when to say nothing (CA-05)."""

from __future__ import annotations

from .model import Finding, Run

MAX_MESSAGE = 900

_VERB = {
    "new failure": "now fails",
    "still failing": "is still failing",
    "flaky": "is flaky",
    "tests dropped": "lost tests",
    "became unknown": "could not be judged",
    "still unknown": "still could not be judged",
    "check removed": "was removed from the run",
}


def notification_text(run: Run) -> str | None:
    """None when nothing regressed, so a silent job stays silent.

    Names the check, what happened and the measured evidence. Never includes command output, file
    contents or paths: the tail of a log can hold anything.
    """
    bad = [f for f in run.findings if f.kind in _VERB]
    if not bad:
        return None
    lines = [f"Afterglow night watch: {len(bad)} regression{'s' if len(bad) != 1 else ''}."]
    for f in bad:
        lines.append(f"- {f.check} {_VERB[f.kind]}: {f.evidence}.")
    if run.commit:
        lines.append(f"Commit {run.commit[:10]}{' (uncommitted changes)' if run.dirty else ''}.")
    text = "\n".join(lines)
    return text if len(text) <= MAX_MESSAGE else text[: MAX_MESSAGE - 1].rstrip() + "…"


def regression_findings(findings: tuple[Finding, ...]) -> list[Finding]:
    return [f for f in findings if f.kind in _VERB]
