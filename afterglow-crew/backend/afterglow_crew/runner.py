"""Running the project's own checks, safely (CW-01, CW-06).

Only commands from `checks.json` run, only if they pass a positive allow-list, never through a
shell, with a hard timeout and bounded output. A check that cannot be judged is `unknown`.
"""

from __future__ import annotations

import os
import re
import signal
import subprocess
import tempfile
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .classify import classify
from .model import CheckResult, Finding, Outcome, Repeat, Run

MAX_TAIL = 2000
MAX_CAPTURE_BYTES = 256 * 1024
MAX_REPEATS = 10
MAX_TIMEOUT_S = 3600
MAX_CHECKS = 20

# A token may contain only these characters. A positive list, not a list of bad ones: anything a
# shell could act on (; & | ` $ > < quotes, backslash, brackets, braces, globs, ~) is simply not allowed.
_TOKEN = re.compile(r"^[A-Za-z0-9@_./:=+-]+$")
# Words that mean publishing, deploying, sending or destroying. A token containing one is refused,
# whatever else the command says. The repository's deny hooks do not guard Crew agents, so this is
# the guard that holds here.
_BANNED = ("publish", "deploy", "apply", "destroy", "submit", "push", "reset", "clean", "send", "rm", "sudo", "curl", "wget", "ssh", "scp", "install", "add")


class CommandRefused(ValueError):
    """A command was not allowed to run."""


# What a check may ask pnpm to do. `exec` may start only these tools, so `pnpm exec <anything>` is not
# a way to run an arbitrary program. `turbo` is here so a check can bypass its cache: a cached run replays
# old output, and a stale pass reported as fresh is the worst thing a night watch can do.
_VERBS = frozenset({"test", "lint", "typecheck", "build", "exec", "run", "--filter"})
_EXEC_TOOLS = frozenset({"turbo", "playwright", "vitest", "tsc", "biome"})


def validate_command(command: str) -> list[str]:
    """Split a command into argv, or refuse it (CW-06). Never returns something a shell could expand."""
    if not isinstance(command, str) or not command.strip() or len(command) > 300:
        raise CommandRefused("A command must be non-empty text of at most 300 characters.")
    tokens = command.split()
    if tokens[0] != "pnpm":
        raise CommandRefused("Only pnpm commands may run.")
    for t in tokens:
        if not _TOKEN.fullmatch(t):
            raise CommandRefused("A command may only contain letters, digits and @ _ . / : = + -.")
        if ".." in t.split("/"):
            raise CommandRefused("A command may not name a parent directory.")
        # A banned word is refused as a whole segment of a token (split on - _ . / : = @ +), so `--send`,
        # `a-curl` and `run-deploy` are caught, while `typecheck` or `format` are not mistaken for `rm`.
        # A prefix match catches the long forms too (`publishing`, `deployment`, `applying`).
        for seg in re.split(r"[-_./:=@+]+", t.lower()):
            for word in _BANNED:
                if seg == word or (len(word) >= 5 and seg.startswith(word)):
                    raise CommandRefused(f"A command may not publish, deploy, send or destroy ({word}).")
    # Skip any `--filter <package>` pairs, then the next word is the verb.
    i = 1
    while i < len(tokens) and tokens[i] == "--filter":
        if i + 1 >= len(tokens):
            raise CommandRefused("--filter needs a package name.")
        i += 2
    # A verb is one of the words above, or a package script such as `test:browser` that starts with one.
    verb = tokens[i] if i < len(tokens) else ""
    base = verb.split(":", 1)[0]
    if base not in _VERBS - {"--filter"}:
        raise CommandRefused("Only test, lint, typecheck, build, run and exec are allowed.")
    if verb == "exec" and (i + 1 >= len(tokens) or tokens[i + 1] not in _EXEC_TOOLS):
        raise CommandRefused("pnpm exec may start only turbo, playwright, vitest, tsc or biome.")
    return tokens


# ------------------------------------------------------------------ redaction

_SECRETS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"(?i)\b(password|passwd|secret|api[_-]?key|access[_-]?token|token)\b(\s*[=:]\s*)\S{6,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]{16,}"),
]
_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")


def redact(text: str) -> str:
    """Remove colour codes and anything shaped like a secret before text is stored or shown."""
    text = _ANSI.sub("", text)
    for rx in _SECRETS:
        if rx.groups:
            text = rx.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", text)
        else:
            text = rx.sub("[redacted]", text)
    return text


def tail_of(text: str) -> str:
    text = redact(text)
    return text[-MAX_TAIL:]


# ------------------------------------------------------------------ parsing test counts

_VITEST = re.compile(r"\bTests\s{2,}[^()\n]*\((\d+)\)")
_PW_PASSED = re.compile(r"(\d+)\s+passed\b")
_PW_FAILED = re.compile(r"(\d+)\s+failed\b")
_PW_FLAKY = re.compile(r"(\d+)\s+flaky\b")
_PW_SKIPPED = re.compile(r"(\d+)\s+(?:skipped|did not run)\b")


def parse_tests(parser: str | None, output: str) -> int | None:
    """The number of tests a run counted, or None when it cannot be read (CW-03). Never guesses."""
    if parser is None:
        return None
    text = _ANSI.sub("", output)
    if parser == "vitest":
        found = [int(m.group(1)) for m in _VITEST.finditer(text)]
        return sum(found) if found else None
    if parser == "playwright":
        # The reporter ends with a block like "  2 failed / 1 flaky / 3 skipped / 85 passed (1.3m)".
        # Read only the last lines, and take the last figure for each word.
        tail = text.splitlines()[-25:]
        total, seen = 0, False
        for rx in (_PW_PASSED, _PW_FAILED, _PW_FLAKY, _PW_SKIPPED):
            ms = [int(m.group(1)) for ln in tail for m in rx.finditer(ln)]
            if ms:
                seen = True
                total += ms[-1]
        return total if seen else None
    return None


# ------------------------------------------------------------------ executing


@dataclass(frozen=True)
class ExecResult:
    exit_code: int | None  # None: it could not be started or was killed for time
    timed_out: bool
    started: bool
    output: str
    duration_ms: int


Executor = Callable[[list[str], Path, int], ExecResult]

_ENV_KEEP = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SHELL", "USER", "NVM_DIR", "PNPM_HOME", "COREPACK_HOME")


def minimal_env() -> dict[str, str]:
    env = {k: os.environ[k] for k in _ENV_KEEP if k in os.environ}
    env.update({"CI": "1", "NO_COLOR": "1", "FORCE_COLOR": "0"})
    return env


def real_executor(argv: list[str], cwd: Path, timeout_s: int) -> ExecResult:
    """Run argv with no shell, in its own process group, with bounded output and a hard timeout."""
    start = time.monotonic()
    with tempfile.TemporaryFile() as sink:
        try:
            proc = subprocess.Popen(
                argv,
                cwd=str(cwd),
                stdin=subprocess.DEVNULL,
                stdout=sink,
                stderr=subprocess.STDOUT,
                env=minimal_env(),
                start_new_session=True,
                shell=False,
            )
        except OSError:
            return ExecResult(None, False, False, "", int((time.monotonic() - start) * 1000))
        timed_out = False
        try:
            code: int | None = proc.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            timed_out = True
            code = None
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                proc.kill()
            proc.wait()
        else:
            # A child that died of a signal reports a negative status: that is not an answer.
            if code is not None and code < 0:
                code = None
        size = sink.seek(0, os.SEEK_END)
        sink.seek(max(0, size - MAX_CAPTURE_BYTES))
        output = sink.read().decode("utf-8", errors="replace")
    return ExecResult(code, timed_out, True, output, int((time.monotonic() - start) * 1000))


def judge(result: ExecResult, parser: str | None) -> tuple[Outcome, int | None]:
    """One repeat's outcome and test count. Unknown unless there is a clear answer (CW-01)."""
    if not result.started or result.timed_out or result.exit_code is None:
        return "unknown", None
    tests = parse_tests(parser, result.output)
    if result.exit_code in (126, 127):
        return "unknown", tests  # the shell could not run it: not a verdict on the project
    if result.exit_code == 0:
        # A suite that counted zero tests has passed nothing.
        if parser is not None and tests == 0:
            return "unknown", 0
        return "pass", tests
    if 0 < result.exit_code < 126:
        return "fail", tests
    return "unknown", tests


# ------------------------------------------------------------------ checks and runs


@dataclass(frozen=True)
class CheckSpec:
    name: str
    command: str
    repeats: int = 1
    timeout_s: int = 600
    parser: str | None = None


def parse_checks(raw: object) -> list[CheckSpec]:
    """Read checks.json strictly. Every command is validated up front, so a bad file fails before any run."""
    if not isinstance(raw, dict) or set(raw) != {"checks"} or not isinstance(raw["checks"], list):
        raise CommandRefused('checks.json must be {"checks": [...]}.')
    if not 1 <= len(raw["checks"]) <= MAX_CHECKS:
        raise CommandRefused(f"checks.json needs between 1 and {MAX_CHECKS} checks.")
    out: list[CheckSpec] = []
    for c in raw["checks"]:
        if not isinstance(c, dict) or not {"name", "command"} <= set(c) or not set(c) <= {"name", "command", "repeats", "timeoutSeconds", "parser"}:
            raise CommandRefused("A check has name, command and optionally repeats, timeoutSeconds, parser.")
        name, command = c["name"], c["command"]
        repeats, timeout, parser = c.get("repeats", 1), c.get("timeoutSeconds", 600), c.get("parser")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,40}", name):
            raise CommandRefused("A check name is lower-case letters, digits and hyphens.")
        validate_command(command)
        if isinstance(repeats, bool) or not isinstance(repeats, int) or not 1 <= repeats <= MAX_REPEATS:
            raise CommandRefused(f"repeats must be 1 to {MAX_REPEATS}.")
        if isinstance(timeout, bool) or not isinstance(timeout, int) or not 1 <= timeout <= MAX_TIMEOUT_S:
            raise CommandRefused(f"timeoutSeconds must be 1 to {MAX_TIMEOUT_S}.")
        if parser not in (None, "vitest", "playwright"):
            raise CommandRefused("parser must be vitest, playwright or absent.")
        out.append(CheckSpec(name, command, repeats, timeout, parser))
    if len({c.name for c in out}) != len(out):
        raise CommandRefused("Two checks share a name.")
    return out


def git_state(repo: Path, execute: Executor = real_executor) -> tuple[str | None, bool | None]:
    """The commit and whether the tree is dirty, or (None, None) when git cannot say."""
    head = execute(["git", "rev-parse", "HEAD"], repo, 20)
    if head.exit_code != 0 or not re.fullmatch(r"[0-9a-f]{40}", head.output.strip()):
        return None, None
    status = execute(["git", "status", "--porcelain"], repo, 20)
    if status.exit_code != 0:
        return head.output.strip(), None
    return head.output.strip(), bool(status.output.strip())


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


Progress = Callable[[int, int, str], None]


def run_checks(
    specs: list[CheckSpec],
    repo: Path,
    previous: Run | None,
    *,
    trigger: str,
    repeats_override: int | None = None,
    execute: Executor = real_executor,
    on_progress: Progress | None = None,
    clock: Callable[[], str] = now_iso,
) -> Run:
    """Run every check, repeat it, and classify against the previous run."""
    started = clock()
    total = sum(max(1, repeats_override or s.repeats) for s in specs)
    done = 0
    results: list[CheckResult] = []
    for spec in specs:
        argv = validate_command(spec.command)  # again, at the point of use
        repeats: list[Repeat] = []
        for _ in range(max(1, repeats_override or spec.repeats)):
            if on_progress:
                on_progress(done, total, spec.name)
            res = execute(argv, repo, spec.timeout_s)
            outcome, tests = judge(res, spec.parser)
            repeats.append(Repeat(outcome, res.exit_code, res.duration_ms, tests, tail_of(res.output)))
            done += 1
        results.append(CheckResult(spec.name, spec.command, tuple(repeats)))
    commit, dirty = git_state(repo, execute)
    findings: tuple[Finding, ...] = classify(previous, results)
    if on_progress:
        on_progress(done, total, "")
    return Run(
        id=uuid.uuid4().hex[:16],
        started_at=started,
        finished_at=clock(),
        trigger=trigger,
        commit=commit,
        dirty=dirty,
        checks=tuple(results),
        findings=findings,
    )
