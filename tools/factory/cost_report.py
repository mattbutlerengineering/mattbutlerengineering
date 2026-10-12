#!/usr/bin/env python3
"""cost_report: the ADR-0034 weekly rollup and monthly circuit breaker.
Recomputes spend numbers from docs/factory/costs.jsonl — read through
cost_ledger.read, the same line grammar detector G gates in CI (ADR-0037),
so the report's reader cannot diverge from the CI rule — and decides
whether the report month's spend (rows whose `at` date falls in it;
ADR-0034's monthly window) has crossed factory.json's monthly_cap_usd.
Conventions match budget_guard.py: functions return cr:-prefixed problem
strings (ledger problems keep cost_ledger's ledger: prefix, the same way
validator.py surfaces label_sync's L: strings); the CLI prints them and
exits nonzero.

This module COMPUTES ONLY: aggregate the ledger, decide PAUSE/CONTINUE
against the cap, and compose the report text. All IO is injected (the
ledger path, the clock) so it is unit-testable without touching real time
or a real repository, and it never shells out to gh. The workflow
(.github/workflows/cost-report.yml) is the one that MUTATES — it posts the
report issue and, on a PAUSE verdict, sets the FACTORY_PAUSED repo
variable (`gh variable set`, readable as `vars.FACTORY_PAUSED` by any
workflow's `if:`, the same vars.* convention sweeps.yml's Sentry job and
validator.yml's FACTORY_REVIEW_LOGIN already use) — both real gh
mutations, so they stay in the YAML, never here.

  python3 cost_report.py report
        Recompute spend from docs/factory/costs.jsonl, decide against
        factory.json's monthly_cap_usd, and write title/body/pause/reason
        to $GITHUB_OUTPUT for the workflow's gh steps. Exits nonzero only
        on a genuine misconfiguration (fails CLOSED: an unreadable ledger
        or unresolvable cap decides PAUSE and still exits nonzero, so a
        broken config can never silently wave spend through unpaused).
"""
import math
import os
import sys
from collections import namedtuple
from datetime import datetime, timezone

import cost_ledger
import factory_config
from cli import report, write_outputs
from knowledge_plane import repo_root

PAUSE = "PAUSE"
CONTINUE = "CONTINUE"

# guard's named result. Still a tuple (positional unpacking keeps
# working), but call sites name the field they want instead of unpacking
# six positions to use two. cap is None only on a failing-closed path.
GuardResult = namedtuple("GuardResult", (
    "verdict", "reason", "totals", "month_totals", "cap", "problems"))


def aggregate(entries, month=None):
    """PURE: recompute the weekly report's numbers from already-parsed
    ledger entries — total spend, total tokens, run count, and spend by
    work order. Which rows count is cost_ledger.dispatched's rule, shared
    with work_queue.month_to_date so the cap is compared against one
    definition: gate-latency observations (ADR-0041) are skipped, being
    wait records rather than runs, and counting them would inflate
    run_count and pad by_wo with $0.00 lines; and when `month`
    ("YYYY-MM") is given only rows cost_ledger.in_month places in that
    month are counted, rows without `at` being legacy (pre-timestamp) and
    belonging to closed months by construction. Every number below is
    then the SAME row set by construction. Trusts the full ledger shape
    cost_ledger.read already established (coding-style.md: no defensive
    re-validation of an invariant enforced one call up)."""
    total_cost = 0.0
    total_tokens = 0
    run_count = 0
    by_wo = {}
    for entry in cost_ledger.dispatched(entries, month):
        cost = entry["cost"]
        total_cost += cost
        total_tokens += entry["tokens"]
        run_count += 1
        by_wo[entry["wo"]] = by_wo.get(entry["wo"], 0.0) + cost
    return {
        "total_cost": round(total_cost, 2),
        "total_tokens": total_tokens,
        "run_count": run_count,
        "by_wo": {wo: round(cost, 2) for wo, cost in by_wo.items()},
    }


def decide(total_cost, cap):
    """(verdict, reason): PAUSE once total spend has reached or crossed the
    monthly cap — the same >= boundary as budget_guard.decide (a month that
    has just reached its ceiling has no more to spend), and the same
    input validation: a NaN, infinite, or negative spend would slip past
    the comparison and silently CONTINUE (fail open), so it PAUSEs with
    its own reason instead — failing closed, budget_guard's
    _validate_spend discipline on this twin's boundary."""
    if isinstance(total_cost, bool) \
            or not isinstance(total_cost, (int, float)) \
            or not math.isfinite(total_cost) or total_cost < 0:
        return PAUSE, (f"cr: spend {total_cost!r} is not a finite,"
                       " non-negative number — failing closed")
    if total_cost >= cap:
        return PAUSE, (f"cr: spend ${total_cost:.2f} has reached or"
                       f" exceeded the ${cap:.2f} monthly cap — pausing"
                       " dispatch (FACTORY_PAUSED)")
    return CONTINUE, (f"cr: spend ${total_cost:.2f} is within the"
                      f" ${cap:.2f} monthly cap")


def guard(root, config=None, ledger_path=None, month=None):
    """GuardResult: recompute spend from the ledger and decide against
    factory.json's monthly cap. The verdict decides on `month_totals` —
    the aggregate windowed to `month` ("YYYY-MM", the report month),
    which IS the lifetime aggregate when no month is given — while
    `totals` stays lifetime for the report body. FAILS CLOSED: any read
    or resolution problem decides PAUSE rather than letting
    unaccountable spend continue — a report that cannot prove it is
    under the cap is treated as over it (same discipline as
    budget_guard.guard). Both aggregates are always the best-effort
    rollup of what WAS readable, even on a failing path, so a human
    reading the report still sees something."""
    entries, problems = cost_ledger.read(root, ledger_path=ledger_path)
    totals = aggregate(entries)
    month_totals = aggregate(entries, month)
    if problems:
        return GuardResult(PAUSE, "cr: unreadable ledger — failing closed",
                           totals, month_totals, None, problems)
    if config is None:
        config, problems = factory_config.load(root)
        if problems:
            return GuardResult(
                PAUSE, "cr: no monthly cap could be resolved — failing"
                " closed", totals, month_totals, None, problems)
    cap, problems = factory_config.resolve_cap(config)
    if problems:
        return GuardResult(
            PAUSE, "cr: no monthly cap could be resolved — failing"
            " closed", totals, month_totals, None, problems)
    verdict, reason = decide(month_totals["total_cost"], cap)
    return GuardResult(verdict, reason, totals, month_totals, cap, [])


def report_title(as_of):
    """The weekly report issue's title, date-stamped by the injected
    clock."""
    return f"Factory cost report — {as_of}"


def compose_report(totals, verdict, reason, cap, as_of, month,
                   month_totals):
    """The weekly report issue body: the report month's spend against the
    monthly cap (with the lifetime figure alongside — the spend line is
    the number the verdict decided on, ADR-0034's monthly window), a
    by-work-order breakdown over the LIFETIME totals (an ADR-0084 issue
    key labelled as an issue), and the pause verdict. Deterministic text,
    easy to assert on and easy to skim (same discipline as
    handoff.compose). cap is None only on a failing-closed
    guard() path (no cap could be resolved); shown honestly rather than
    faked."""
    cap_text = f"${cap:.2f}" if cap is not None else "unknown"
    lines = [f"## {report_title(as_of)}", "",
             f"**Spend this month ({month}):**"
             f" ${month_totals['total_cost']:.2f} of {cap_text} monthly cap"
             f" (lifetime: ${totals['total_cost']:.2f})",
             f"**Runs recorded:** {totals['run_count']}",
             f"**Total tokens:** {totals['total_tokens']}", "",
             "### By work order (lifetime)"]
    if totals["by_wo"]:
        for wo in sorted(totals["by_wo"]):
            label = (f"issue {wo} (no work order)"
                     if cost_ledger.ISSUE_KEY.fullmatch(wo) else wo)
            lines.append(f"- {label}: ${totals['by_wo'][wo]:.2f}")
    else:
        lines.append("- (no runs recorded)")
    lines += ["", "### Verdict", reason.strip()]
    return "\n".join(lines) + "\n"


def _utcnow():
    return datetime.now(timezone.utc)


def run_report(root, clock=None, ledger_path=None):
    """(outputs, problems) for the `report` command: recompute spend,
    decide PAUSE/CONTINUE, and compose everything the workflow's gh steps
    need — title, body, pause ('true'/'false'), reason — as $GITHUB_OUTPUT
    values. The workflow, never this module, runs `gh issue create` and
    `gh variable set FACTORY_PAUSED` (the compute/mutate boundary)."""
    clock = clock or _utcnow
    as_of = clock().date().isoformat()
    month = as_of[:7]
    result = guard(root, ledger_path=ledger_path, month=month)
    outputs = {
        "pause": "true" if result.verdict == PAUSE else "false",
        "title": report_title(as_of),
        "body": compose_report(result.totals, result.verdict, result.reason,
                               result.cap, as_of, month,
                               result.month_totals),
        "reason": result.reason,
    }
    return outputs, result.problems


def main(argv, env=None, clock=None, root=None):
    env = os.environ if env is None else env
    root = root or repo_root()
    if argv == ["report"]:
        outputs, problems = run_report(root, clock=clock)
        write_outputs(env, outputs)
        if outputs.get("reason"):
            print(outputs["reason"])
    else:
        print(__doc__.strip())
        return 2
    return report("cost_report", problems)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
