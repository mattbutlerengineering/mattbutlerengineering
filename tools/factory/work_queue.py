#!/usr/bin/env python3
"""work-queue: plan a batch of work orders to run in parallel.

The `work-queue` skill's compute half (ADR-0023 utility skill; ADR-0032
two planes). It COMPUTES and prices a batch; it never dispatches, never
labels, never merges — the skill runs the agents, and a human merges the
PRs (ADR-0033 gate 3). Same compute/mutate split as cost_report.py.

  python3 work_queue.py plan            the batch, as a report
  python3 work_queue.py plan --json     the same batch, machine-readable

A work order is eligible only when BOTH planes agree (ADR-0032: the
dispatch plane never runs ahead of the knowledge plane):

  knowledge plane  an unchecked breakdown row whose every `blocked by:`
                   edge is already checked off
  dispatch plane   its mirrored issue carrying wo:ready-for-agent — the
                   label the repo OWNER applies, which is what makes this
                   queue opt-in rather than "everything not done yet"

Batch size is factory.json's wip_cap, and the batch is priced from each
row's `size:` band against month-to-date ledger spend and monthly_cap_usd
(ADR-0034), so an over-cap batch is refused BEFORE any agent is paid for.

Conventions match lint.py/gates.py: functions return label-prefixed
problem strings; the CLI prints them and exits nonzero.
"""
import json
import sys
from datetime import datetime, timezone

import cost_ledger
import factory_config
from cli import gh_read, gh_runner, report
from knowledge_plane import (breakdown_files, repo_root, row_blockers,
                             row_unreadable_blockers,
                             row_done, row_size, row_tracker_issue,
                             row_work_order)

READY_LABEL = "wo:ready-for-agent"
LIST_ARGS = ["issue", "list", "--label", READY_LABEL, "--state", "open",
             "--json", "number"]
# How far back the ready listing can see. cli.gh_read owns the window —
# the limit it sends gh and the truncation it reports are the same
# number — so it can only be typed once, and the duplicate literal this
# constant used to disagree with has nowhere left to live.
LIST_WINDOW = 100
# Cheapest band first: a batch that spends its cap on one L order drains
# less queue than the same money across three S ones, and a cheap order
# that fails costs less to have tried.
SIZE_ORDER = {"S": 0, "M": 1, "L": 2}


def _utcnow():
    return datetime.now(timezone.utc)


def rows(root):
    """{work order: row facts} for every breakdown row.

    One pass, one grammar (knowledge_plane's) — nothing downstream re-reads
    or re-parses a row.
    """
    found = {}
    for path, lines in breakdown_files(root):
        for lineno, line in enumerate(lines, 1):
            wo = row_work_order(line)
            if not wo:
                continue
            found[wo] = {
                "wo": wo, "done": row_done(line), "size": row_size(line),
                "issue": row_tracker_issue(line),
                "blockers": row_blockers(line),
                "unreadable": row_unreadable_blockers(line),
                "where": f"{path.relative_to(root)}:{lineno}",
            }
    return found


def eligible(found, ready_issues):
    """PURE: ([candidate rows], [why each other open row is not one]).

    Reports the near-misses deliberately. A queue that just says "nothing
    to do" is indistinguishable from one that is mis-wired, and this queue
    has two planes to disagree about — saying WHICH plane holds a work
    order back is most of its value.
    """
    candidates, deferred = [], []
    for wo, row in sorted(found.items()):
        if row["done"]:
            continue
        unmet = sorted(b for b in row["blockers"]
                       if b not in found or not found[b]["done"])
        if row["unreadable"]:
            # Read as "no blockers" this row was a candidate: dispatching
            # work before a dependency nobody could check (beads wo-o3l).
            deferred.append(f"{wo}: blocked by {row['unreadable']!r}, which"
                            " names no work order, so its dependency cannot"
                            " be checked")
        elif unmet:
            deferred.append(f"{wo}: blocked by {', '.join(unmet)}")
        elif row["issue"] is None:
            deferred.append(f"{wo}: its row carries no (tracker: #N) mirror,"
                            " so no issue can carry the ready label")
        elif row["issue"] not in ready_issues:
            # Says only what the listing proves. It covers OPEN issues, so
            # a miss means "no open issue #N carries the label" — which is
            # ALSO how a closed issue looks, and telling someone to label a
            # closed issue is advice that cannot work. The reconcile sweep
            # owns diagnosing that drift; this line points at it instead of
            # fetching the whole tracker to duplicate it.
            deferred.append(f"{wo}: no open issue #{row['issue']} carries"
                            f" {READY_LABEL} — the owner applies that label,"
                            " and it does nothing on a closed issue; the"
                            " reconcile sweep reports a row whose issue was"
                            " closed")
        else:
            candidates.append(row)
    return candidates, deferred


def priced(candidates, config):
    """PURE: (candidates with a `budget`, problems), cheapest band first.

    A row whose size the budget table does not cover is dropped with its
    config: problem rather than run at an unknown price — ADR-0034's
    fail-closed rule, applied before the money is spent instead of after.
    """
    out, problems = [], []
    for row in candidates:
        budget, trouble = factory_config.resolve_budget(row["size"], config)
        if trouble:
            problems += [f"wq: {row['wo']} ({row['where']}) {t}"
                         for t in trouble]
            continue
        out.append(dict(row, budget=budget))
    return sorted(out, key=lambda r: (SIZE_ORDER.get(r["size"], 3),
                                      r["wo"])), problems


def plan_batch(found, ready_issues, config, spent_usd):
    """PURE: (batch, deferred, problems) — the whole planning decision.

    Every input is passed in, so planning is testable with no repo, no
    network and no clock.
    """
    candidates, deferred = eligible(found, ready_issues)
    ordered, problems = priced(candidates, config)
    cap, cap_problems = factory_config.resolve_cap(config)
    problems += cap_problems
    if cap is None:
        # Fail closed, the rule priced already applies one function up: a
        # cap that does not resolve is an UNKNOWN ceiling, not an absent
        # one, and skipping the comparison plans a batch against it. Same
        # answer the sibling tools give the same config — cost_report
        # PAUSEs, budget_guard hard-stops. resolve_cap reports None only
        # with a problem, so the cause is already in `problems`; this
        # line is the decision, the way the wip_cap refusal below is.
        return [], sorted(deferred), problems + [
            "wq: no monthly cap could be resolved — refusing to plan a"
            " batch it cannot price"]
    wip = config.get("wip_cap")
    if not isinstance(wip, int) or isinstance(wip, bool) or wip < 1:
        return [], sorted(deferred), problems + [
            "wq: factory.json wip_cap must be a positive integer —"
            " refusing to guess a batch size"]
    batch, projected = [], 0.0
    for row in ordered:
        if len(batch) >= wip:
            deferred.append(f"{row['wo']}: over the wip_cap of {wip}"
                            " this round")
        elif spent_usd + projected + row["budget"] > cap:
            deferred.append(
                f"{row['wo']}: would put the month over its ${cap:.2f} cap"
                f" (${spent_usd:.2f} spent, ${projected:.2f} already"
                f" planned, size:{row['size']} budgets"
                f" ${row['budget']:.2f})")
        else:
            batch.append(row)
            projected += row["budget"]
    return batch, sorted(deferred), problems


def ready_issue_numbers(run=None):
    """(issue numbers carrying the ready label, problems), or (None,
    problems) when the listing cannot be trusted — the caller must then
    hold back every row rather than explain it. NETWORK.

    An unreachable tracker is a problem, never an empty queue: "nothing is
    ready" and "I could not ask" must not look the same to the caller, or
    a broken token reads as a drained backlog.

    A truncated window REFUSES here rather than warning, the same rule as
    sweeps.live_issues: past the window an issue is simply absent, and
    absence is exactly what `eligible` reads as a finding — it would
    defer a ready order with "no open issue #N carries the label" and
    send the owner to apply a label the issue may already carry.
    """
    # The full-window RULE is cli.gh_read's; the message stays this
    # caller's own (ADR-0066). gh_read's default note tells whoever
    # reads it to "raise the window or narrow the query" as if either
    # were reachable right now — but LIST_WINDOW is a module constant,
    # and in a stamped repo this tool is a mirrored payload copy, so
    # neither remedy exists at runtime. The remedy is real, it is just a
    # code edit in the tool's own source, not something this message
    # should imply is one flag away.
    read = gh_read(list(LIST_ARGS), "gh issue list", label="wq",
                   run=run or gh_runner, window=LIST_WINDOW,
                   full_note=(
                       f"returned a full {LIST_WINDOW}-entry window —"
                       " older ready orders are invisible; LIST_WINDOW is"
                       " a code constant in work_queue.py, not a runtime"
                       " option, so the fix is raising it there (or"
                       " narrowing LIST_ARGS) and redeploying"))
    if read.value is None or read.truncated:
        return None, read.problems
    return {item["number"] for item in read.value if isinstance(item, dict)
            and isinstance(item.get("number"), int)}, []


def month_to_date(root, now):
    """(dollars recorded for `now`'s month, problems) — ADR-0034. What
    counts as spend is cost_ledger.dispatched's rule, the same row set the
    weekly cost report's month total is built from: a gate-latency
    observation is a wait record, not a run, and never counts (ADR-0041).
    The breaker's input and the report's figure therefore cannot drift
    apart."""
    entries, problems = cost_ledger.read(root)
    month = now.strftime("%Y-%m")
    total = sum(entry["cost"] for entry
                in cost_ledger.dispatched(entries, month))
    return total, problems


def compose_plan(batch, deferred, spent, wip):
    """The batch as report lines — the human half of `plan`, next to the
    `--json` payload's machine half. Named for what it renders: `report`
    belongs to the cli seam's epilogue (ADR-0051), which this tool's main
    also ends with."""
    lines = [f"wq: {len(batch)} work order(s) ready to run in parallel"
             f" (wip_cap {wip})"]
    lines += [f"  {row['wo']}  size:{row['size']}  ${row['budget']:.2f}"
              f"  issue #{row['issue']}  {row['where']}" for row in batch]
    if batch:
        lines.append(f"  projected ${sum(r['budget'] for r in batch):.2f}"
                     f" on top of ${spent:.2f} spent this month")
    lines += [f"  deferred {line}" for line in deferred]
    return lines


def main(argv, run=None, clock=None):
    if not argv or argv[0] != "plan":
        print(__doc__.strip())
        return 2
    root = repo_root()
    config, problems = factory_config.load(root)
    if problems:
        return report("wq", problems)
    ready, problems = ready_issue_numbers(run)
    spent, ledger_problems = month_to_date(root, (clock or _utcnow)())
    problems += ledger_problems
    trusted = ready is not None
    if not trusted:
        # An untrusted listing plans nothing and explains nothing: every
        # per-row deferral would be a claim about a listing that does not
        # cover the row. The problems already say why.
        batch, deferred = [], []
    else:
        batch, deferred, plan_problems = plan_batch(rows(root), ready,
                                                    config, spent)
        problems += plan_problems
    if "--json" in argv:
        # The one leg cli.report does not fit: the problems already ride
        # inside the payload, so printing them again would both duplicate
        # them and put prose above the object a reader parses. Carved out
        # the way ADR-0051 carved out the usage epilogue — the seam does
        # not grow a "summary only" parameter for one caller. The summary
        # line stays in lockstep with the seam's grammar by test, since
        # nothing else bridges the two.
        print(json.dumps({"batch": batch, "deferred": deferred,
                          "problems": problems}, indent=2))
        print(f"wq: {len(problems)} problem(s)")
        return 1 if problems else 0
    if trusted:
        # No plan is rendered over an untrusted listing either: "0 work
        # order(s) ready" is a count of the queue, and this run is the one
        # that decided a broken listing must not be able to produce that
        # sentence. Refusing the rows and then announcing the batch size
        # would put the claim back in the first line a reader skims.
        for line in compose_plan(batch, deferred, spent,
                                 config.get("wip_cap")):
            print(line)
    return report("wq", problems)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
