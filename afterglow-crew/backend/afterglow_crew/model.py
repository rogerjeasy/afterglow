"""Records of runs, checks and repeats (CW-01, CW-04).

Plain dataclasses and a strict parser. Anything read from disk is untrusted: a record
that does not have exactly the expected fields and types is refused, never repaired.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Outcome = Literal["pass", "fail", "unknown"]
CheckOutcome = Literal["pass", "fail", "flaky", "unknown"]

REGRESSION_KINDS = frozenset(
    {
        "new failure",
        "still failing",
        "flaky",
        "tests dropped",
        "became unknown",
        "still unknown",
        "check removed",
    }
)
OK_KINDS = frozenset({"recovered", "steady", "first run"})
ALL_KINDS = REGRESSION_KINDS | OK_KINDS

MAX_TAIL_CHARS = 2000
MAX_NAME = 80
MAX_COMMAND = 300


@dataclass(frozen=True)
class Repeat:
    outcome: Outcome
    exit_code: int | None
    duration_ms: int
    tests: int | None
    tail: str = ""


@dataclass(frozen=True)
class CheckResult:
    name: str
    command: str
    repeats: tuple[Repeat, ...]


@dataclass(frozen=True)
class Finding:
    check: str
    kind: str
    evidence: str

    @property
    def is_regression(self) -> bool:
        return self.kind in REGRESSION_KINDS


@dataclass(frozen=True)
class Run:
    id: str
    started_at: str
    finished_at: str
    trigger: str
    commit: str | None
    dirty: bool | None
    checks: tuple[CheckResult, ...]
    findings: tuple[Finding, ...] = field(default_factory=tuple)

    def check(self, name: str) -> CheckResult | None:
        for c in self.checks:
            if c.name == name:
                return c
        return None


class RecordError(ValueError):
    """A stored or received record was malformed."""


def _exact(d: Any, keys: set[str], what: str) -> dict[str, Any]:
    if not isinstance(d, dict) or set(d.keys()) != keys:
        raise RecordError(f"{what} must have exactly the fields {sorted(keys)}")
    return d


def _int(v: Any, what: str, *, lo: int = 0, hi: int = 10**12, none: bool = False) -> int | None:
    if v is None and none:
        return None
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise RecordError(f"{what} must be a whole number between {lo} and {hi}")
    return v


def _str(v: Any, what: str, *, maxlen: int, none: bool = False, empty: bool = False) -> str | None:
    if v is None and none:
        return None
    if not isinstance(v, str) or len(v) > maxlen or (not empty and v == ""):
        raise RecordError(f"{what} must be text of at most {maxlen} characters")
    return v


_REPEAT_KEYS = {"outcome", "exitCode", "durationMs", "tests", "tail"}
_CHECK_KEYS = {"name", "command", "repeats"}
_FINDING_KEYS = {"check", "kind", "evidence"}
_RUN_KEYS = {
    "v",
    "id",
    "startedAt",
    "finishedAt",
    "trigger",
    "commit",
    "dirty",
    "checks",
    "findings",
}
RECORD_VERSION = 1


def parse_run(raw: Any) -> Run:
    """Strictly parse one stored run, or raise RecordError. Never guesses."""
    d = _exact(raw, _RUN_KEYS, "a run")
    if d["v"] != RECORD_VERSION:
        raise RecordError("unsupported record version")
    dirty = d["dirty"]
    if dirty is not None and not isinstance(dirty, bool):
        raise RecordError("dirty must be true, false or null")
    if not isinstance(d["checks"], list) or len(d["checks"]) > 50:
        raise RecordError("checks must be a list of at most 50")
    if not isinstance(d["findings"], list) or len(d["findings"]) > 200:
        raise RecordError("findings must be a list of at most 200")
    checks: list[CheckResult] = []
    for c in d["checks"]:
        cd = _exact(c, _CHECK_KEYS, "a check")
        if not isinstance(cd["repeats"], list) or not 1 <= len(cd["repeats"]) <= 20:
            raise RecordError("a check needs between 1 and 20 repeats")
        reps: list[Repeat] = []
        for r in cd["repeats"]:
            rd = _exact(r, _REPEAT_KEYS, "a repeat")
            if rd["outcome"] not in ("pass", "fail", "unknown"):
                raise RecordError("a repeat outcome must be pass, fail or unknown")
            reps.append(
                Repeat(
                    outcome=rd["outcome"],
                    exit_code=_int(rd["exitCode"], "exitCode", lo=-1000, hi=1000, none=True),
                    duration_ms=_int(rd["durationMs"], "durationMs") or 0,
                    tests=_int(rd["tests"], "tests", none=True),
                    tail=_str(rd["tail"], "tail", maxlen=MAX_TAIL_CHARS, empty=True) or "",
                )
            )
        checks.append(
            CheckResult(
                name=_str(cd["name"], "name", maxlen=MAX_NAME) or "",
                command=_str(cd["command"], "command", maxlen=MAX_COMMAND) or "",
                repeats=tuple(reps),
            )
        )
    if len({c.name for c in checks}) != len(checks):
        raise RecordError("two checks share a name")
    findings: list[Finding] = []
    for f in d["findings"]:
        fd = _exact(f, _FINDING_KEYS, "a finding")
        kind = _str(fd["kind"], "kind", maxlen=40) or ""
        if kind not in ALL_KINDS:
            raise RecordError("unknown finding kind")
        findings.append(
            Finding(
                check=_str(fd["check"], "check", maxlen=MAX_NAME) or "",
                kind=kind,
                evidence=_str(fd["evidence"], "evidence", maxlen=300, empty=True) or "",
            )
        )
    return Run(
        id=_str(d["id"], "id", maxlen=40) or "",
        started_at=_str(d["startedAt"], "startedAt", maxlen=40) or "",
        finished_at=_str(d["finishedAt"], "finishedAt", maxlen=40) or "",
        trigger=_str(d["trigger"], "trigger", maxlen=20) or "",
        commit=_str(d["commit"], "commit", maxlen=40, none=True),
        dirty=dirty,
        checks=tuple(checks),
        findings=tuple(findings),
    )


def run_to_json(run: Run) -> dict[str, Any]:
    return {
        "v": RECORD_VERSION,
        "id": run.id,
        "startedAt": run.started_at,
        "finishedAt": run.finished_at,
        "trigger": run.trigger,
        "commit": run.commit,
        "dirty": run.dirty,
        "checks": [
            {
                "name": c.name,
                "command": c.command,
                "repeats": [
                    {
                        "outcome": r.outcome,
                        "exitCode": r.exit_code,
                        "durationMs": r.duration_ms,
                        "tests": r.tests,
                        "tail": r.tail,
                    }
                    for r in c.repeats
                ],
            }
            for c in run.checks
        ],
        "findings": [
            {"check": f.check, "kind": f.kind, "evidence": f.evidence} for f in run.findings
        ],
    }
