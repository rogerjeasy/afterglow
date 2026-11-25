"""A weekly view of what the stored runs show (CA-12). Measured, or silent."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .classify import check_outcome, count_tests
from .model import REGRESSION_KINDS, Run


def _parse(ts: str) -> datetime | None:
    try:
        d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def weekly_digest(runs: list[Run], now: datetime, days: int = 7) -> dict[str, object]:
    """Summarise runs that finished in the last `days` days, oldest to newest."""
    since = now - timedelta(days=days)
    inside = [r for r in runs if (t := _parse(r.finished_at)) is not None and since <= t <= now]
    inside.sort(key=lambda r: r.finished_at)
    if not inside:
        return {"runs": 0, "message": f"No runs in the last {days} days. Nothing is reported as zero."}
    flaky: dict[str, int] = {}
    kinds: dict[str, int] = {}
    counts: dict[str, dict[str, int | None]] = {}
    for r in inside:
        for f in r.findings:
            if f.kind in REGRESSION_KINDS:
                kinds[f.kind] = kinds.get(f.kind, 0) + 1
            if f.kind == "flaky":
                flaky[f.check] = flaky.get(f.check, 0) + 1
        for c in r.checks:
            entry = counts.setdefault(c.name, {"first": count_tests(c), "last": count_tests(c)})
            entry["last"] = count_tests(c)
    return {
        "runs": len(inside),
        "runsWithRegressions": sum(any(f.kind in REGRESSION_KINDS for f in r.findings) for r in inside),
        "regressionsByKind": dict(sorted(kinds.items())),
        "flakyChecks": dict(sorted(flaky.items())),
        "testCounts": dict(sorted(counts.items())),
        "lastRunOutcomes": {c.name: check_outcome(c) for c in inside[-1].checks},
    }
