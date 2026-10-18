#!/usr/bin/env python3
"""conductor_calibrate: `conductor.py calibrate` (#799), split from
conductor_close by capability (breakdown assumption 6) when the
scorecard's row shape (#814) and cause counts (#819) would have pushed
that file past the 800-line ceiling. It imports conductor.py's row
grammar and conductor_close's rounding, which keep one owner each.

`calibrate` joins every closed batch's ledger with costs.jsonl into one
actuals row per run (step, band, model, ceiling, cost, wall time,
attempt, outcome) and prints suggested step weights and size budgets
with their sample sizes. It reads the ledgers close already commits, so
it writes no file of its own, and never writes factory.json. It also
owns the ceiling warning `plan` repeats (#940): the one rule and the
one text, read here by both verbs.
"""
import json
import math

import conductor_flow as flow
import cost_ledger
import factory_config
from conductor import LEDGER, parsed_at, view
from conductor_close import PLACES, closed_batches

# Below the floor the counters still give a verdict (#940): a step whose
# attempts spent their ceiling WARN_SHARE of the time or more, at
# WARN_ATTEMPTS attempts or more, is underweighted. The suggestion only
# ever scales a weight DOWN from runs that stopped at their ceiling —
# what an uncapped run would have spent is not recorded — so this is
# the one signal that a weight is too low; it prints floor or no floor,
# and again from `plan` when it prices from the same weights. A lost
# runner's row is charged its ceiling (conductor_spend, #967), so it is
# a hit: the ceiling was spent, whoever spent it.
WARN_ATTEMPTS = 2
WARN_SHARE = 0.5
WARNING = ("{step}: {hits} of {attempts} attempts spent the ceiling; the"
           " weight is too low")
# The step whose sample unit is one breakdown row (its work order), not
# the item. A build row keyed by its item instead — an older tool wrote
# the item into `wo`, the row named no work order, or the runner was
# lost before it metered (#967) — is one attempt of the step, and a hit
# when it spent the ceiling, but no unit of the sample: keyed by item,
# every such row of a batch would collapse into one unit against one
# row's ceiling (#940).
PER_ROW_STEP = "build"
SET_ASIDE = ("{step}: {n} run(s) set aside from the sample: their spend row"
             " names the item, not a work order (older tools, or a runner"
             " lost before it metered); they still count as attempts")
# What `plan` prints when a closed batch does not join its spend rows:
# the warnings are advisory, so the read's problems never refuse a
# plan; `calibrate` names them.
UNREAD = ("cd: ceiling warnings unread: a closed batch does not join its"
          " spend rows (conductor.py calibrate names the problem)")


def actuals(rows, lines, shown, entries):
    """(one row per run, problems), PURE over the ledger's rows (each on
    its line in `lines`) and the cost ledger's entries: the join a
    recalibration needs, from the plan row (item type, size, the step's
    ceiling), the run row (band, model, effort, outcome), its spend rows
    (cost, and the work order it ran for: a build runs once per
    breakdown row, under that row's work order) and its launch state row
    (wall time; None for a run with none). `attempt` counts the runs of
    that step for that work order so far, so a retried row is one row's
    attempts, not another row. It fails with no rows where the scorecard
    does (no plan row, or a run with no spend row), and on a run the
    plan does not price: its item or its step missing from the plan."""
    plan = view(rows)["plan"]
    if plan is None:
        return None, [f"cd: {shown} has no plan row"]
    spent, work = {}, {}
    for entry in entries:
        spent[entry["run_id"]] = spent.get(entry["run_id"], 0) \
            + entry["cost"]
        work.setdefault(entry["run_id"], entry["wo"])
    runs = [(lineno, row) for lineno, row in zip(lines, rows)
            if row["kind"] == "run"]
    planned = {entry["item"]: entry for entry in plan["items"]}
    priced = {item: {step["step"]: step["ceiling_usd"]
                     for step in entry["steps"]}
              for item, entry in planned.items()}
    problems = []
    for lineno, row in runs:
        where = f"cd: {shown}:{lineno} run {row['run_id']}"
        if row["run_id"] not in spent:
            problems.append(f"{where} has no {cost_ledger.COST_LEDGER} row"
                            " with its run_id")
        elif row["item"] not in planned:
            problems.append(f"{where} is for {row['item']}, which the plan"
                            " does not hold")
        elif row["step"] not in priced[row["item"]]:
            problems.append(f"{where} is a {row['step']} run, a step the"
                            f" plan does not give {row['item']}")
    if problems:
        return None, problems
    launched = {row["run_id"]: row["at"] for row in rows
                if row["kind"] == "state" and row["reason"] == flow.LAUNCHED
                and "run_id" in row}
    found, seen = [], {}
    for _, row in runs:
        entry, wo = planned[row["item"]], work[row["run_id"]]
        key = (row["item"], row["step"], wo)
        seen[key] = seen.get(key, 0) + 1
        start = launched.get(row["run_id"])
        found.append({
            "batch": plan["batch"], "item": row["item"],
            "type": entry["type"], "size": entry["size"],
            "step": row["step"], "wo": wo, "attempt": seen[key],
            "run_id": row["run_id"], "band": row["band"],
            "model": row["model"], "effort": row["effort"],
            "ceiling_usd": priced[row["item"]][row["step"]],
            "cost_usd": round(spent[row["run_id"]], PLACES),
            "wall_s": (int((parsed_at(row["at"]) - parsed_at(start))
                           .total_seconds()) if start else None),
            "outcome": row["outcome"]})
    return found, []


def _spread(samples):
    """n, mean and max of `samples`; None figures for an empty sample (a
    step every row of which was set aside)."""
    if not samples:
        return {"n": 0, "mean_usd": None, "max_usd": None}
    return {"n": len(samples),
            "mean_usd": round(sum(samples) / len(samples), 2),
            "max_usd": round(max(samples), 2)}


def _short(table, what, floor):
    """[] when every entry of `table` has `floor` samples, else the one
    refusal naming each n below it and what has it."""
    under = {}
    for name, figures in table.items():
        if figures["n"] < floor:
            under.setdefault(figures["n"], []).append(name)
    if not under:
        return []
    return [f"{what}: " + "; ".join(f"n={n} for {', '.join(names)}"
                                    for n, names in sorted(under.items()))
            + f", below the floor of {floor}"]


def _scaled(samples, weights):
    """(step -> suggested weight, refusals): each step's weight in force
    scaled by its samples' mean spend over their ceiling, so a step that
    spent exactly its ceiling keeps its weight and the suggestion is on
    the plan's own scale (#830). Every weighted step needs a sample and
    a nonzero ceiling; a refusal names each one that lacks either."""
    refused = [f"step_weights: no run of {step} to scale its weight from"
               for step in weights if step not in samples]
    refused += [f"step_weights: {step} has a $0 ceiling to scale its"
                " weight from" for step in weights if step in samples
                and any(ceiling <= 0 for _, ceiling in samples[step])]
    if refused:
        return None, refused
    return {step: round(weight * sum(cost / ceiling for cost, ceiling
                                     in samples[step])
                        / len(samples[step]), 1)
            for step, weight in weights.items()}, []


def _figures(rows):
    """(step -> [(unit spend, ceiling)], step -> figures, set-aside
    lines), PURE over actuals rows. A step's sample is one unit of its
    work over every attempt: one item's run of the step, or for build
    one breakdown row's (its work order), which is what the step's
    ceiling caps. attempts and ceiling_hits count every run of the step,
    the build rows SET_ASIDE from its sample included."""
    units, attempts, hits, aside = {}, {}, {}, {}
    for row in rows:
        step, cost = row["step"], row["cost_usd"]
        attempts[step] = attempts.get(step, 0) + 1
        hits[step] = hits.get(step, 0) + (cost >= row["ceiling_usd"])
        if (step == PER_ROW_STEP
                and cost_ledger.ISSUE_KEY.fullmatch(row["wo"])):
            aside[step] = aside.get(step, 0) + 1
            continue
        unit = units.setdefault(step, {}).setdefault(
            ((row["batch"], row["item"]), row["wo"]),
            [0, row["ceiling_usd"]])
        unit[0] += cost
    samples = {step: [tuple(unit) for unit in found.values()]
               for step, found in units.items()}
    steps = {step: {**_spread([cost for cost, _ in samples.get(step, [])]),
                    "attempts": attempts[step], "ceiling_hits": hits[step]}
             for step in attempts}
    return samples, steps, [SET_ASIDE.format(step=step, n=n)
                            for step, n in aside.items()]


def _budgets(rows, floor):
    """size -> the spread of its items' whole spend, with budget_usd the
    dearest item rounded up to the dollar at `floor` items, else None.
    A set-aside build row is still the item's spend."""
    by_item, sizes = {}, {}
    for row in rows:
        item = (row["batch"], row["item"])
        by_item[item] = by_item.get(item, 0) + row["cost_usd"]
        sizes[item] = row["size"]
    totals = {}
    for item, total in by_item.items():
        totals.setdefault(sizes[item], []).append(total)
    budgets = {}
    for size, spent in totals.items():
        spread = _spread(spent)
        budgets[size] = {**spread, "budget_usd": (
            math.ceil(spread["max_usd"]) if spread["n"] >= floor else None)}
    return budgets


def ceiling_warnings(steps):
    """One advisory line per step whose attempts spent their ceiling
    WARN_SHARE of the time or more, at WARN_ATTEMPTS attempts or more,
    in step order (#940): never a problem, never a suggested weight."""
    return [WARNING.format(step=step, hits=figures["ceiling_hits"],
                           attempts=figures["attempts"])
            for step, figures in steps.items()
            if figures["attempts"] >= WARN_ATTEMPTS
            and figures["ceiling_hits"] >= WARN_SHARE * figures["attempts"]]


def calibrate(rows, weights, floor=factory_config.DEFAULT_CALIBRATE_FLOOR):
    """Suggested step weights and size budgets, PURE over actuals rows
    and the step weights in force, with every figure's sample size
    (_figures says what a sample is). A suggested weight is the weight
    in force scaled by the step's mean spend over its ceiling, suggested
    only when every weighted step has `floor` samples; a size's budget
    is its dearest item, rounded up to the dollar, suggested only at
    `floor` items. `warnings` are the ceiling warnings, floor or no
    floor, and `set_aside` says which rows left a sample and why. It
    suggests and never writes factory.json: model and pricing choices
    stay the Owner's (PRD-0013, ADR-0034)."""
    if not rows:
        return {"floor": floor, "steps": {}, "step_weights": None,
                "sizes": {}, "warnings": [], "set_aside": [],
                "refused": ["no closed batch has a run to calibrate from"]}
    samples, steps, set_aside = _figures(rows)
    budgets = _budgets(rows, floor)
    suggested, refused = _scaled(samples, weights)
    weights_short = _short(steps, "step_weights", floor)
    return {"floor": floor, "steps": steps,
            "step_weights": None if weights_short else suggested,
            "sizes": budgets, "warnings": ceiling_warnings(steps),
            "set_aside": set_aside,
            "refused": refused + weights_short
            + _short(budgets, "budgets_usd", floor)}


def closed_actuals(root):
    """(actuals rows of every closed batch's ledger at `root`, the names
    of the ledgers that do not load, problems), over
    conductor_close.closed_batches, the walk the miner reads (#854). A batch with no close row is skipped: its blocked items'
    spend rows reach costs.jsonl only at close. A ledger that does not
    load is a gap the caller names, never a problem: ledgers on main are
    append-only evidence, so one bad line must not refuse every reading
    after it (#837)."""
    entries, problems = cost_ledger.read(root)
    if problems:
        return None, [], problems
    closed, gaps = closed_batches(root)
    found = []
    for batch, rows, lines in closed:
        rows, problems = actuals(rows, lines, LEDGER.format(batch=batch),
                                 entries)
        if problems:
            return None, [], problems
        found += rows
    return found, gaps["unreadable"], []


def warning_lines(root):
    """The ceiling warnings over every closed batch at `root` as plan
    output lines, each `cd: `-labelled (#940): what `plan` and `open`
    print after the plan they priced from the same weights. Advisory: a
    join the ledgers refuse is UNREAD, one line and never a problem, so
    a bad closed ledger cannot refuse the next batch."""
    rows, _, problems = closed_actuals(root)
    if problems:
        return [UNREAD]
    return [f"cd: {line}" for line in ceiling_warnings(_figures(rows)[1])]


def _settings(root):
    """((the step weights in force, the floor), problems) from
    factory.json."""
    config, problems = factory_config.load(root)
    if problems:
        return None, problems
    weights, problems = factory_config.resolve_step_weights(config)
    if problems:
        return None, problems
    floor, problems = factory_config.resolve_calibrate_floor(config)
    return (None, problems) if problems else ((weights, floor), [])


def calibrate_cli(root, args):
    if args:
        return None
    settings, problems = _settings(root)
    if problems:
        return problems
    rows, unreadable, problems = closed_actuals(root)
    if rows is not None:
        card = calibrate(rows, *settings)
        refused = [f"ledgers: {name} does not load, so its runs are left"
                   " out" for name in unreadable]
        print(json.dumps({**card, "refused": refused + card["refused"]},
                         indent=2))
    return problems
