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
it writes no file of its own, and never writes factory.json.
"""
import json
import math

import conductor_flow as flow
import cost_ledger
import factory_config
from conductor import LEDGER, parsed_at, view
from conductor_close import PLACES, closed_batches

# The fewest samples calibrate suggests from. One real batch is all
# there is today, so below it the verb prints n and suggests nothing.
CALIBRATE_FLOOR = 5


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


def calibrate(rows, weights, floor=CALIBRATE_FLOOR):
    """Suggested step weights and size budgets, PURE over actuals rows
    and the step weights in force, with every figure's sample size. A
    step's sample is one unit of its work over every attempt: one item's
    run of the step, or for build one breakdown row's (its work order),
    which is what the step's ceiling caps (ceiling_hits counts the
    attempts that spent their ceiling); a size's is one item's whole
    spend. A suggested weight is the weight in force scaled by the
    step's mean spend over its ceiling, suggested only when every
    weighted step has `floor` samples; a size's budget is its dearest
    item, rounded up to the dollar, suggested only at `floor` items. It
    suggests and never writes factory.json: model and pricing choices
    stay the Owner's (PRD-0013, ADR-0034)."""
    units, by_item, sizes, attempts, hits = {}, {}, {}, {}, {}
    for row in rows:
        item, step, cost = (row["batch"], row["item"]), row["step"], \
            row["cost_usd"]
        unit = units.setdefault(step, {}).setdefault(
            (item, row["wo"]), [0, row["ceiling_usd"]])
        unit[0] += cost
        by_item[item] = by_item.get(item, 0) + cost
        sizes[item] = row["size"]
        attempts[step] = attempts.get(step, 0) + 1
        hits[step] = hits.get(step, 0) + (cost >= row["ceiling_usd"])
    samples = {step: [tuple(unit) for unit in found.values()]
               for step, found in units.items()}
    steps = {step: {**_spread([cost for cost, _ in found]),
                    "attempts": attempts[step], "ceiling_hits": hits[step]}
             for step, found in samples.items()}
    totals = {}
    for item, total in by_item.items():
        totals.setdefault(sizes[item], []).append(total)
    budgets = {size: _spread(spent) for size, spent in totals.items()}
    for figures in budgets.values():
        figures["budget_usd"] = (math.ceil(figures["max_usd"])
                                 if figures["n"] >= floor else None)
    if not rows:
        return {"floor": floor, "steps": {}, "step_weights": None,
                "sizes": {},
                "refused": ["no closed batch has a run to calibrate from"]}
    suggested, refused = _scaled(samples, weights)
    weights_short = _short(steps, "step_weights", floor)
    return {"floor": floor, "steps": steps,
            "step_weights": None if weights_short else suggested,
            "sizes": budgets,
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


def calibrate_cli(root, args):
    if args:
        return None
    config, problems = factory_config.load(root)
    weights, problems = (None, problems) if problems \
        else factory_config.resolve_step_weights(config)
    if problems:
        return problems
    rows, unreadable, problems = closed_actuals(root)
    if rows is not None:
        card = calibrate(rows, weights)
        refused = [f"ledgers: {name} does not load, so its runs are left"
                   " out" for name in unreadable]
        print(json.dumps({**card, "refused": refused + card["refused"]},
                         indent=2))
    return problems
