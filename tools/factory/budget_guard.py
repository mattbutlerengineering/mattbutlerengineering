#!/usr/bin/env python3
"""budget_guard: the ADR-0034 stop-or-continue check for a dispatched work
order — CONTINUE while spend is within its size class's dollar budget,
HARD-STOP at or over it. Conventions match assembler.py: functions return
bg:-prefixed problem strings; the CLI prints them and exits nonzero.

This is one of THREE uncorrelated stops ADR-0034 puts around every
dispatched run (token budget, max-turns cap, wall-clock timeout) — the
dollar-budget stop, checked against the run's own running spend. Exhaustion
is a HANDOFF, not a failure (ADR-0034): hard_stop pushes whatever is on
disk (push_wip), composes and posts a handoff naming the remaining
acceptance criteria (handoff.compose), and appends the run's line to the
append-only cost ledger (cost_ledger.entry / cost_ledger.append) —
RESILIENTLY, so a WIP-push failure (the normal no-upstream case) still
leaves the handoff and ledger behind. See
docs/adr/0034-work-order-budgets-and-routing.md.

  python3 budget_guard.py check <size> <spend_usd>
        Resolve <size>'s dollar budget from factory.json and print CONTINUE
        or HARD-STOP against <spend_usd>. Exits nonzero only on a genuine
        misconfiguration (fails CLOSED: an unresolvable budget prints
        HARD-STOP and still exits nonzero, so a broken config can never
        silently wave a run through).

  python3 budget_guard.py record <wo> <run_id> <model> <tokens> <cost>
                                 [outcome]
        Append ONE completed run's line to the ledger (outcome defaults to
        "completed"). The success-path counterpart to hard_stop: until this
        existed, hard_stop was the only in-repo writer of a dispatched-run
        row, so the ledger recorded exhausted runs and nothing else and the
        monthly circuit breaker summed a total that could only ever be
        $0.00 (issue #222). Refuses BEFORE writing on a malformed row or a
        (wo, run_id) already recorded.

  python3 budget_guard.py record-run <wo> <run_id> <model>
                                     <execution_file> [outcome]
        record, with tokens and cost read from the claude-code-action
        execution file the dispatched run left behind (cli.read_execution)
        — the assembler workflow's caller (issue #222), so the figures are
        the harness's own record, never hand-typed. Refuses BEFORE writing
        on any file it cannot account for.
"""
import math
import sys
from datetime import datetime, timezone

import cost_ledger
import factory_config
import handoff
from cli import CLI_FAILURES as GIT_FAILURES
from cli import detail as _git_detail
from cli import read_execution, report, runner
from knowledge_plane import repo_root

CONTINUE = "CONTINUE"
HARD_STOP = "HARD-STOP"


def _validate_spend(spend_usd):
    """Spend-so-far must be a finite, non-negative number — the boundary
    check coding-style.md demands (never trust the caller's input). A
    negative spend, NaN, or infinity is nonsense that would slip past
    decide's `>=` comparison and silently CONTINUE, so it is a problem
    here and guard fails CLOSED on it (ADR-0034: an unaccountable run is
    treated as out of budget, never waved through)."""
    if isinstance(spend_usd, bool) or not isinstance(spend_usd, (int, float)) \
            or not math.isfinite(spend_usd) or spend_usd < 0:
        return [f"bg: spend {spend_usd!r} is not a finite, non-negative"
                " number"]
    return []


def decide(spend_usd, budget_usd):
    """(verdict, reason): CONTINUE while spend is strictly under budget,
    HARD-STOP at or over it — a run that has just reached its ceiling has
    no more to spend. Pure: the comparison alone is the ADR-0034 stop rule;
    resolving the budget (and failing closed when that is not possible) is
    guard's concern."""
    if spend_usd >= budget_usd:
        return HARD_STOP, (f"bg: spend ${spend_usd:.2f} has reached or"
                           f" exceeded the ${budget_usd:.2f} budget")
    return CONTINUE, (f"bg: spend ${spend_usd:.2f} is within the"
                      f" ${budget_usd:.2f} budget")


def guard(root, size, spend_usd, config=None):
    """(verdict, reason, problems): resolve <size>'s budget (from the repo's
    factory.json, or an injected `config` for tests/callers that already
    have it) and decide against spend_usd. FAILS CLOSED: any resolution
    problem hard-stops rather than letting an unaccountable run continue —
    an agent that cannot prove it is in budget is treated as out of it."""
    problems = _validate_spend(spend_usd)
    if problems:
        return HARD_STOP, "bg: invalid spend — failing closed", problems
    if config is None:
        config, problems = factory_config.load(root)
        if problems:
            return (HARD_STOP, "bg: no budget could be resolved — failing"
                    " closed", problems)
    budget_usd, problems = factory_config.resolve_budget(size, config)
    if problems:
        return (HARD_STOP, "bg: no budget could be resolved — failing"
                " closed", problems)
    verdict, reason = decide(spend_usd, budget_usd)
    return verdict, reason, []


# The real git CLI (cli.runner): a failed or missing git raises
# GIT_FAILURES, and push_wip turns that into a bg: problem string rather
# than a traceback.
# ADR-0037 has callers alias the seam to their own names "so their
# problem strings read unchanged" — recorded deliberate, not folded:
# one-owner: dashboard.git_runner (ADR-0061) — ADR-0037 sanctions the alias
git_runner = runner("git")


def push_wip(wo, run=git_runner):
    """Commit and push whatever is on disk under `wo`'s name, returning a
    list of bg: problems (empty on success) — ADR-0034: a run that hits its
    budget preserves its work-in-progress, it never discards it. `run` is an
    injected command runner (same shape as cli.gh_runner) so tests
    never touch a real repository. --allow-empty: a run that hard-stops
    before changing a file still needs a commit to push.

    A push failure NEVER raises. The normal hard-stop state is a fresh WO
    branch with no upstream, where `git push` exits 128; because push_wip
    runs BEFORE the handoff and ledger (hard_stop), an uncaught crash here
    would swallow the accountability record ADR-0034 promises ("a handoff
    comment to read", not "a bill to dispute"). So the failure is caught
    and surfaced as a problem, and hard_stop still completes."""
    try:
        run(["add", "-A"])
        run(["commit", "-m", f"wip({wo}): budget exhausted", "--allow-empty"])
        run(["push"])
    except GIT_FAILURES as err:
        return [f"bg: pushing {wo} WIP failed: {_git_detail(err)}"]
    return []


def hard_stop(root, wo, reason, done, remaining, resume, *, run_id, model,
              tokens, cost, at, outcome="budget-exhausted", run=git_runner,
              post=print):
    """The ADR-0034 hard-stop sequence, made RESILIENT: append the ledger
    line, push WIP, post the handoff — the append comes FIRST so the row
    is on disk when push_wip's `add -A` stages the tree, and the pushed
    WIP commit carries it off the ephemeral runner (WO-0032; a row
    appended after the push exists only until the job ends). The order
    costs no resilience: the append is local file IO a push failure
    cannot touch, so the handoff and ledger — the accountability record
    ADR-0034 promises — still exist when the WIP push fails (a fresh WO
    branch with no upstream, git exit 128, is the normal case). Returns
    any bg: problems (a failed push), having still completed the handoff
    + ledger. Pure orchestration over the tested pieces; all IO is
    injected (run/post) so tests need touch neither git nor the network.

    done/remaining are short acceptance-criterion strings the run tracked,
    never a raw issue body — handoff.compose draws that ADR-0032 boundary.
    `at` is the UTC date the caller stamps on the ledger row (injected,
    not computed here, to keep the function's IO injected)."""
    cost_ledger.append(root, cost_ledger.entry(
        wo, run_id, model, tokens, cost, outcome, at))
    problems = push_wip(wo, run=run)
    post(handoff.compose(wo, reason, done, remaining, resume))
    return problems


def record(root, wo, run_id, model, tokens, cost, outcome, at):
    """Append one COMPLETED run's line to the append-only cost ledger —
    the success-path counterpart to hard_stop, and the reason the ledger
    can account for spend at all (issue #222). hard_stop fires only on
    budget exhaustion, so before this existed a run that finished inside
    its budget wrote nothing and was free as far as ADR-0034's monthly
    circuit breaker could tell.

    Both refusals happen BEFORE the write, because the ledger is
    append-only and a bad line is permanent — there is no edit to undo it
    with, only a second line explaining the first:

      - a row cost_ledger.line_problems rejects (the same rule detector G
        and the weekly report read with, never a second copy);
      - a (wo, run_id) already in the ledger. A re-recorded run would
        double-count against the monthly cap, and bounding that cap is the
        entire reason the row is written.

    Fails CLOSED on an unreadable or unparseable ledger: appending spend
    to a ledger that cannot be summed would undercount silently, which is
    the failure this whole path exists to end. Returns bg: problems; an
    empty list means the line landed."""
    row = cost_ledger.entry(wo, run_id, model, tokens, cost, outcome, at)
    shape = cost_ledger.line_problems(row)
    if shape:
        return [f"bg: refusing to record {wo}: {problem}"
                for problem in shape]
    entries, problems = cost_ledger.read(root)
    if problems:
        return [f"bg: refusing to record {wo}: {problem}"
                for problem in problems]
    # Through the seam, never a second copy: cost_ledger.row_key owns
    # ADR-0041's identity, and gate_digest's dedup already reads it this
    # way. Subscripting is safe here because read() returns validated rows
    # and the problem branch above already returned.
    recorded = {cost_ledger.row_key(existing) for existing in entries}
    if cost_ledger.row_key(row) in recorded:
        return [f"bg: refusing to record {wo}: run_id {run_id!r} is already"
                " in the ledger — recording it twice would double-count the"
                " run against the monthly cap"]
    cost_ledger.append(root, row)
    return []


def record_run(root, wo, run_id, model, execution_path, outcome, at):
    """record(), with tokens and cost read from the harness's own
    execution file (cli.read_execution) rather than typed by a caller —
    the assembler workflow's success-path writer (issue #222). A file
    that cannot be accounted for is a refusal BEFORE the write, never a
    zeroed or invented row; every record() refusal (shape, double-count)
    then applies unchanged."""
    spend, error = read_execution(execution_path)
    if error:
        return [f"bg: refusing to record {wo}: {error}"]
    tokens, cost = spend
    return record(root, wo, run_id, model, tokens, cost, outcome, at)


def _record_args(argv):
    """(kwargs, problems) for the record CLI leg. tokens and cost are the
    only parsed values, and a bad one is a problem rather than a
    traceback — the leg is called from a workflow step and an unhandled
    ValueError there reads as a broken tool."""
    wo, run_id, model, tokens_raw, cost_raw = argv[:5]
    outcome = argv[5] if len(argv) == 6 else "completed"
    problems = []
    try:
        tokens = int(tokens_raw)
    except ValueError:
        tokens, _ = 0, problems.append(
            f"bg: tokens {tokens_raw!r} is not an integer")
    try:
        cost = float(cost_raw)
    except ValueError:
        cost, _ = 0.0, problems.append(
            f"bg: cost {cost_raw!r} is not a number")
    return dict(wo=wo, run_id=run_id, model=model, tokens=tokens,
                cost=cost, outcome=outcome), problems


def main(argv, clock=None, root=None):
    """`root` is injected, never derived from the cwd: repo_root() resolves
    from __file__, so a test that only chdir'd into a temp tree would write
    its fabricated row into the REAL ledger — an append-only file the
    honesty rules say may never carry invented runs."""
    if len(argv) in (6, 7) and argv[0] == "record":
        fields, problems = _record_args(argv[1:])
        if not problems:
            at = (clock or (lambda: datetime.now(timezone.utc)))()
            problems = record(root or repo_root(),
                              at=at.date().isoformat(), **fields)
        return report("budget_guard", problems)
    if len(argv) in (5, 6) and argv[0] == "record-run":
        wo, run_id, model, execution_path = argv[1:5]
        outcome = argv[5] if len(argv) == 6 else "completed"
        at = (clock or (lambda: datetime.now(timezone.utc)))()
        problems = record_run(root or repo_root(), wo, run_id, model,
                              execution_path, outcome,
                              at.date().isoformat())
        return report("budget_guard", problems)
    if len(argv) == 3 and argv[0] == "check":
        _, size, spend_raw = argv
        try:
            spend_usd = float(spend_raw)
        except ValueError:
            return report("budget_guard",
                          [f"bg: {spend_raw!r} is not a number"])
        root = repo_root()
        verdict, reason, problems = guard(root, size, spend_usd)
        print(reason)
        print(verdict)
        return report("budget_guard", problems)
    print(__doc__.strip())
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
