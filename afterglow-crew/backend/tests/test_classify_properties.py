"""Properties of the night watch's judgement (CA-01 to CA-05, CA-12).

Hypothesis plays the part fast-check plays for the TypeScript core.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone

import pytest
from afterglow_crew.classify import (
    check_outcome,
    classify,
    regressions,
    run_passed,
    count_tests,
)
from afterglow_crew.digest import weekly_digest
from afterglow_crew.model import (
    ALL_KINDS,
    OK_KINDS,
    REGRESSION_KINDS,
    CheckResult,
    Finding,
    RecordError,
    Repeat,
    Run,
    parse_run,
    run_to_json,
)
from afterglow_crew.notify import MAX_MESSAGE, notification_text
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

SETTINGS = settings(max_examples=300, suppress_health_check=[HealthCheck.too_slow], deadline=None)

NAMES = st.sampled_from(["typecheck", "lint", "test", "browser", "pixel", "formulary"])
outcome_st = st.sampled_from(["pass", "fail", "unknown"])


def repeat_st(tests=st.one_of(st.none(), st.integers(0, 2000))):
    return st.builds(
        Repeat,
        outcome=outcome_st,
        exit_code=st.one_of(st.none(), st.integers(-5, 5)),
        duration_ms=st.integers(0, 600_000),
        tests=tests,
        tail=st.text(max_size=40),
    )


def check_st(name=NAMES):
    return st.builds(
        CheckResult,
        name=name,
        command=st.just("pnpm test"),
        repeats=st.lists(repeat_st(), min_size=1, max_size=5).map(tuple),
    )


def checks_st():
    return st.lists(check_st(), max_size=6, unique_by=lambda c: c.name)


def run_of(checks, findings=(), commit="a" * 40, dirty=False) -> Run:
    return Run(
        id="r1",
        started_at="2026-11-25T02:00:00Z",
        finished_at="2026-11-25T02:10:00Z",
        trigger="cron",
        commit=commit,
        dirty=dirty,
        checks=tuple(checks),
        findings=tuple(findings),
    )


def with_outcomes(name: str, outcomes: list[str], tests=None) -> CheckResult:
    return CheckResult(
        name=name,
        command="pnpm test",
        repeats=tuple(Repeat(o, 0 if o == "pass" else 1, 10, tests, "") for o in outcomes),
    )


# ------------------------------------------------------------------ CA-01


@SETTINGS
@given(check_st())
def test_CA01_a_check_passes_only_if_every_repeat_passed(c):
    assert (check_outcome(c) == "pass") == all(r.outcome == "pass" for r in c.repeats)


@SETTINGS
@given(check_st())
def test_CA01_unknown_is_never_promoted_to_pass(c):
    if any(r.outcome == "unknown" for r in c.repeats):
        assert check_outcome(c) != "pass"


@SETTINGS
@given(checks_st())
def test_CA01_a_run_passes_only_when_every_check_passes(checks):
    if run_passed(checks):
        assert checks and all(check_outcome(c) == "pass" for c in checks)


def test_CA01_a_run_with_no_checks_is_not_a_pass():
    assert run_passed([]) is False


def test_CA01_pass_and_unknown_is_unknown_and_fail_wins_over_unknown():
    assert check_outcome(with_outcomes("t", ["pass", "unknown"])) == "unknown"
    assert check_outcome(with_outcomes("t", ["fail", "unknown"])) == "fail"
    assert check_outcome(with_outcomes("t", ["unknown", "unknown"])) == "unknown"


# ------------------------------------------------------------------ CA-02


@SETTINGS
@given(st.lists(outcome_st, min_size=2, max_size=8))
def test_CA02_a_check_that_both_passes_and_fails_is_flaky_and_a_regression(outcomes):
    c = with_outcomes("test", outcomes)
    if "pass" in outcomes and "fail" in outcomes:
        assert check_outcome(c) == "flaky"
        for prev in (None, run_of([with_outcomes("test", ["pass"])])):
            (f,) = classify(prev, [c])
            assert f.kind == "flaky" and f.kind in REGRESSION_KINDS


def test_CA02_flaky_is_reported_even_if_the_previous_run_was_also_flaky():
    flaky = with_outcomes("test", ["pass", "fail", "pass"])
    (f,) = classify(run_of([flaky]), [flaky])
    assert f.kind == "flaky"


# ------------------------------------------------------------------ CA-03


@SETTINGS
@given(st.integers(0, 3000), st.integers(0, 3000))
def test_CA03_tests_dropped_exactly_when_a_passing_check_counts_fewer(before, now):
    prev = run_of([with_outcomes("test", ["pass"] * 3, tests=before)])
    (f,) = classify(prev, [with_outcomes("test", ["pass"] * 3, tests=now)])
    assert (f.kind == "tests dropped") == (now < before)
    if now < before:
        assert str(before) in f.evidence and str(now) in f.evidence


@SETTINGS
@given(st.integers(0, 3000))
def test_CA03_an_unreadable_count_never_infers_a_drop(n):
    known = with_outcomes("test", ["pass"], tests=n)
    unread = with_outcomes("test", ["pass"], tests=None)
    assert classify(run_of([known]), [unread])[0].kind == "steady"
    assert classify(run_of([unread]), [known])[0].kind == "steady"


def test_CA03_one_unreadable_repeat_makes_the_whole_count_unreadable():
    c = CheckResult(
        "test",
        "pnpm test",
        (Repeat("pass", 0, 1, 10, ""), Repeat("pass", 0, 1, None, "")),
    )
    assert count_tests(c) is None


def test_CA03_the_smaller_count_is_used_so_a_lucky_repeat_cannot_hide_a_drop():
    c = CheckResult("test", "pnpm test", (Repeat("pass", 0, 1, 300, ""), Repeat("pass", 0, 1, 290, "")))
    assert count_tests(c) == 290
    prev = run_of([with_outcomes("test", ["pass"], tests=300)])
    assert classify(prev, [c])[0].kind == "tests dropped"


# ------------------------------------------------------------------ CA-04


@SETTINGS
@given(st.one_of(st.none(), checks_st().map(run_of)), checks_st())
def test_CA04_one_finding_per_current_check_and_per_removed_check(prev, cur):
    findings = classify(prev, cur)
    cur_names = {c.name for c in cur}
    removed = {c.name for c in prev.checks} - cur_names if prev else set()
    assert {f.check for f in findings if f.kind != "check removed"} == cur_names
    assert {f.check for f in findings if f.kind == "check removed"} == removed
    assert len(findings) == len(cur_names) + len(removed)
    assert all(f.kind in ALL_KINDS for f in findings)


@SETTINGS
@given(st.one_of(st.none(), checks_st().map(run_of)), checks_st())
def test_CA04_a_failing_flaky_or_unknown_check_is_never_quiet(prev, cur):
    by_check = {f.check: f for f in classify(prev, cur) if f.kind != "check removed"}
    for c in cur:
        if check_outcome(c) != "pass":
            assert by_check[c.name].kind in REGRESSION_KINDS


@SETTINGS
@given(st.one_of(st.none(), checks_st().map(run_of)), checks_st())
def test_CA04_no_regression_means_a_clean_run(prev, cur):
    """The headline safety property: silence is only possible when everything really passed."""
    findings = classify(prev, cur)
    if not regressions(findings):
        assert all(check_outcome(c) == "pass" for c in cur)
        assert not any(f.kind == "check removed" for f in findings)
        # Nothing was dropped silently either.
        assert all(f.kind in OK_KINDS for f in findings)


@SETTINGS
@given(checks_st())
def test_CA04_first_run_is_quiet_only_for_a_check_that_passed(cur):
    for f in classify(None, cur):
        c = next(c for c in cur if c.name == f.check)
        assert (f.kind == "first run") == (check_outcome(c) == "pass")


@SETTINGS
@given(st.one_of(st.none(), checks_st().map(run_of)), checks_st(), st.randoms(use_true_random=False))
def test_CA04_order_of_checks_and_repeats_never_changes_the_answer(prev, cur, rnd: random.Random):
    shuffled = []
    for c in cur:
        reps = list(c.repeats)
        rnd.shuffle(reps)
        shuffled.append(CheckResult(c.name, c.command, tuple(reps)))
    rnd.shuffle(shuffled)
    assert classify(prev, cur) == classify(prev, shuffled)


def test_CA04_a_check_dropped_from_the_run_is_a_regression_even_if_all_else_passes():
    prev = run_of([with_outcomes("test", ["pass"]), with_outcomes("browser", ["pass"])])
    findings = classify(prev, [with_outcomes("test", ["pass"])])
    assert [f.kind for f in regressions(findings)] == ["check removed"]
    assert next(f for f in findings if f.check == "browser").kind == "check removed"


def test_CA04_the_transitions_in_one_table():
    P, F, U = ["pass"], ["fail"], ["unknown"]
    cases = [
        (P, P, "steady"), (F, P, "recovered"), (U, P, "recovered"),
        (P, F, "new failure"), (F, F, "still failing"), (U, F, "new failure"),
        (P, U, "became unknown"), (F, U, "became unknown"), (U, U, "still unknown"),
    ]
    for before, now, want in cases:
        (f,) = classify(run_of([with_outcomes("t", before)]), [with_outcomes("t", now)])
        assert f.kind == want, (before, now, f.kind)
    # A check that is new to a later run behaves like a first run.
    prev = run_of([with_outcomes("other", ["pass"])])
    kinds = {f.check: f.kind for f in classify(prev, [with_outcomes("other", ["pass"]), with_outcomes("t", ["fail"])])}
    assert kinds == {"other": "steady", "t": "new failure"}


# ------------------------------------------------------------------ CA-05


@SETTINGS
@given(checks_st(), st.one_of(st.none(), checks_st().map(run_of)))
def test_CA05_silent_exactly_when_there_is_no_regression(cur, prev):
    run = run_of(cur, classify(prev, cur))
    text = notification_text(run)
    assert (text is None) == (not regressions(run.findings))


MARKER = "ZZ-SECRET-FROM-A-LOG-ZZ"


@SETTINGS
@given(checks_st())
def test_CA05_a_message_never_carries_command_output(cur):
    """A log tail can hold anything, including a token: it must never reach a notification."""
    leaky = [
        CheckResult(
            c.name,
            c.command,
            tuple(Repeat(r.outcome, r.exit_code, r.duration_ms, r.tests, MARKER) for r in c.repeats),
        )
        for c in cur
    ]
    text = notification_text(run_of(leaky, classify(None, leaky)))
    assert text is None or MARKER not in text


@SETTINGS
@given(st.integers(1, 40))
def test_CA05_a_message_is_bounded_and_names_the_checks_when_short(n):
    bad = [with_outcomes(f"check-{i}", ["fail", "fail"]) for i in range(n)]
    run = run_of(bad, classify(None, bad))
    text = notification_text(run)
    assert text is not None and len(text) <= MAX_MESSAGE
    if n <= 3:
        assert all(f"check-{i} now fails" in text for i in range(n))


def test_CA05_a_regression_message_is_short_and_plain():
    cur = [with_outcomes("test", ["pass", "fail", "pass"])]
    run = run_of(cur, classify(run_of([with_outcomes("test", ["pass"])]), cur))
    text = notification_text(run)
    assert text == (
        "Afterglow night watch: 1 regression.\n"
        "- test is flaky: passed 2 of 3 repeats and failed 1.\n"
        f"Commit {'a' * 10}."
    )
    assert notification_text(run_of([with_outcomes("test", ["pass"])], classify(None, [with_outcomes("test", ["pass"])]))) is None


def test_CA05_uncommitted_changes_are_said_plainly():
    cur = [with_outcomes("t", ["fail"])]
    text = notification_text(run_of(cur, classify(None, cur), dirty=True))
    assert text is not None and "(uncommitted changes)" in text


# ------------------------------------------------------------------ record parsing (CA-08)


@SETTINGS
@given(checks_st())
def test_CA08_a_run_survives_a_round_trip_through_json(cur):
    run = run_of(cur, classify(None, cur))
    assert parse_run(json.loads(json.dumps(run_to_json(run)))) == run


json_st = st.recursive(
    st.none() | st.booleans() | st.integers() | st.floats(allow_nan=False) | st.text(max_size=20),
    lambda c: st.lists(c, max_size=4) | st.dictionaries(st.text(max_size=8), c, max_size=4),
    max_leaves=12,
)


@SETTINGS
@given(json_st)
def test_CA08_arbitrary_input_is_refused_only_with_a_record_error(raw):
    try:
        parse_run(raw)
    except RecordError:
        pass


def test_CA08_extra_fields_wrong_types_and_versions_are_refused():
    good = run_to_json(run_of([with_outcomes("t", ["pass"])], classify(None, [with_outcomes("t", ["pass"])])))
    parse_run(good)
    for mutate in (
        lambda d: d.update(extra=1),
        lambda d: d.update(v=2),
        lambda d: d.update(dirty="yes"),
        lambda d: d["checks"][0]["repeats"][0].update(outcome="maybe"),
        lambda d: d["checks"][0]["repeats"][0].update(durationMs=True),
        lambda d: d["checks"][0]["repeats"][0].update(tests=-1),
        lambda d: d["checks"][0]["repeats"].clear(),
        lambda d: d["findings"].append({"check": "t", "kind": "made up", "evidence": ""}),
        lambda d: d["checks"].append(dict(d["checks"][0])),
    ):
        bad = json.loads(json.dumps(good))
        mutate(bad)
        with pytest.raises(RecordError):
            parse_run(bad)


# ------------------------------------------------------------------ digest (CA-12)

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)


def stamped(days_ago: float, checks) -> Run:
    t = (NOW - timedelta(days=days_ago)).isoformat().replace("+00:00", "Z")
    r = run_of(checks)
    return Run(r.id, t, t, r.trigger, r.commit, r.dirty, r.checks, classify(None, checks))


def test_CA12_no_runs_in_the_window_says_so_and_reports_no_numbers():
    d = weekly_digest([stamped(30, [with_outcomes("t", ["pass"])])], NOW)
    assert d["runs"] == 0 and "No runs" in str(d["message"]) and "runsWithRegressions" not in d
    assert weekly_digest([], NOW)["runs"] == 0


def test_CA12_counts_only_runs_inside_the_window_and_names_flaky_checks():
    runs = [
        stamped(1, [with_outcomes("test", ["pass", "fail"], tests=10)]),
        stamped(2, [with_outcomes("test", ["pass"], tests=12)]),
        stamped(3, [with_outcomes("test", ["pass", "fail"], tests=12)]),
        stamped(20, [with_outcomes("test", ["fail"], tests=1)]),
    ]
    d = weekly_digest(runs, NOW)
    assert d["runs"] == 3
    assert d["runsWithRegressions"] == 2
    assert d["flakyChecks"] == {"test": 2}
    assert d["testCounts"] == {"test": {"first": 12, "last": 10}}


@SETTINGS
@given(st.lists(st.floats(0, 40), max_size=12))
def test_CA12_the_digest_counts_exactly_the_runs_in_the_window(ages):
    runs = [stamped(a, [with_outcomes("t", ["pass"])]) for a in ages]
    d = weekly_digest(runs, NOW)
    assert d["runs"] == sum(a <= 7 for a in ages)
