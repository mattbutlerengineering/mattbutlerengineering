#!/usr/bin/env python3
"""conductor_close: `conductor.py scorecard <batch>` and `conductor.py
close <batch>` (PRD-0013, WO-0162, WO-0163), split from conductor.py by
capability (breakdown assumption 6). It imports conductor.py's row
grammar, which keeps one owner.

The scorecard is computed from the batch ledger and docs/factory/
costs.jsonl alone. It fails loudly, never reporting a number, when a
ledger line does not parse or breaks its kind's rules, when a `run` row
has no spend row of the same run_id, or when the plan row is missing:
each a cd: problem naming the file (and line). The Conductor's own
session is outside every dollar figure, and the row says so.

`close` runs once every item is merged or blocked. It merges origin/main
into conductor/<batch> (so the merged items' spend rows are in its
costs.jsonl), carries the blocked items' spend rows over from their
branches, and appends the scorecard to docs/factory/scorecards.jsonl only
when it computes, append-only under the evals/results/ discipline. Then
it writes the close row and the closing merge ask, commits the ledger,
run evidence and scorecard, pushes (never forced), opens the closing PR,
and labels each blocked item's issue needs-human with its reason.
Last, it deletes from origin each blocked item's branch whose only
commits beyond origin/main are its own runs' spend commits, whose rows
it carried; a branch holding any other commit is kept, and named in the
closing PR body and on its item's needs-human comment (#728, #771).

`close <batch> --merge` merges the closing PR once the Owner answered
its ask `merge`, first committing and pushing that answer row (#726).

closed_batches is the one walk over closed ledgers that calibrate and
rejection_mining read (#854); `calibrate` lives in conductor_calibrate.
"""
import json
import math
import time
from pathlib import Path

import conductor_flow as flow
import conductor_merge
import conductor_run
import cost_ledger
import factory_config
import label_sync
from cli import CLI_FAILURES, detail
from conductor import LEDGER, TERMINAL, answers, append, ask_row, \
    batch_branch, batch_dir, current_state, is_text, item_view, load, \
    numbered, parse, parsed_at, read_text, run_item, stamp, view

SCORECARDS = "docs/factory/scorecards.jsonl"
# Asks the Conductor raises beyond the planned spend, gate and merge
# decisions.
ESCALATIONS = ("stall", "clarify")
PLACES = 4


def _ratio(numerator, denominator):
    return round(numerator / denominator, PLACES) if denominator else None


def _complies(run, policy):
    """True when the run's passed model and effort are the plan's policy
    snapshot for its band, and the harness reported the passed model."""
    model, _ = factory_config.resolve_model(run["band"], policy)
    effort, _ = factory_config.resolve_effort(run["band"], policy)
    return (run["model"] == model and run["effort"] == effort
            and run["model"] in run["models_reported"])


def _owner_wait_hours(rows):
    """The summed ask-to-answer wait of every answered ask, in hours."""
    asked = {row["id"]: row["at"] for row in rows if row["kind"] == "ask"}
    return sum((parsed_at(row["at"]) - parsed_at(asked[row["ask"]])).total_seconds()
               for row in rows if row["kind"] == "answer"
               and row["ask"] in asked) / 3600


def _error_pct(metered, estimate):
    return (round((metered - estimate) / estimate * 100, PLACES)
            if estimate and metered is not None else None)


def _by_cause(rows, to):
    """{cause: count} of the state rows into `to` (#819); a row written
    before causes existed counts as unrecorded."""
    causes = sorted(row.get("cause", "unrecorded") for row in rows
                    if row["kind"] == "state" and row["to"] == to)
    return {cause: causes.count(cause) for cause in causes}


def _ran_estimate(read):
    """The plan's estimate of the steps that have a run row (#798): each
    such step's ceiling_usd once, however many runs it took, and a build
    at the build_usd of the gate ask its item's latest gate answer
    approved, which re-priced it at one run per breakdown row. A step
    never run is not in it: an item blocked after its spec step is
    judged on its spec alone."""
    total = 0
    for item in read["items"].values():
        gate = item["gate"]
        build_usd = next((ask.get("build_usd") for ask in item["asks"]
                          if gate is not None and ask["id"] == gate["ask"]),
                         None)
        for step in {row["step"] for row in item["runs"]}:
            total += (build_usd if step == "build" and build_usd is not None
                      else item["steps"][step]["ceiling_usd"])
    return round(total, PLACES)


def compute(rows, lines, shown, entries, now):
    """(scorecard row, problems), PURE over the ledger's rows (each on
    its line in `lines`) and the cost ledger's entries."""
    read = view(rows)
    plan = read["plan"]
    if plan is None:
        return None, [f"cd: {shown} has no plan row"]
    spent = {}
    for entry in entries:
        spent[entry["run_id"]] = spent.get(entry["run_id"], 0) \
            + entry["cost"]
    runs = [(lineno, row) for lineno, row in zip(lines, rows)
            if row["kind"] == "run"]
    problems = [f"cd: {shown}:{lineno} run {row['run_id']} has no"
                f" {cost_ledger.COST_LEDGER} row with its run_id"
                for lineno, row in runs if row["run_id"] not in spent]
    if problems:
        return None, problems
    items = [entry["item"] for entry in plan["items"]]
    finals = [current_state(rows, item) for item in items]
    merged = finals.count("merged")
    metered = round(sum(spent[row["run_id"]] for _, row in runs), PLACES)
    estimate = _ran_estimate(read)
    merges = [row["at"] for row in rows if row["kind"] == "state"
              and row["to"] == "merged"]
    wait = _owner_wait_hours(rows)
    return {
        "batch": plan["batch"], "at": stamp(now), "items": len(items),
        "merged": merged, "blocked": finals.count("blocked"),
        "owner_touches_per_merged": _ratio(
            sum(1 for row in rows if row["kind"] == "answer"), merged),
        "metered_usd": metered,
        "metered_usd_per_merged": _ratio(metered, merged),
        # #814: a changed meaning is a new key, never a reused one.
        "estimate_usd": plan["estimate_usd"],
        "estimate_error_pct": _error_pct(metered, plan["estimate_usd"]),
        "ran_estimate_usd": estimate,
        "ran_estimate_error_pct": _error_pct(metered, estimate),
        "collisions": sum(len(row.get("renumbered_from", []))
                          for row in rows if row["kind"] == "reserve"),
        "stalls": sum(1 for row in rows if row["kind"] == "state"
                      and row["to"] == "stalled"),
        "stalls_by_cause": _by_cause(rows, "stalled"),
        "blocked_by_cause": _by_cause(rows, "blocked"),
        "escalations": sum(1 for row in rows if row["kind"] == "ask"
                           and row["ask_kind"] in ESCALATIONS),
        "review_changes_per_item": _ratio(
            sum(map(flow.review_change, rows)), len(items)),
        "start_to_last_merge_s": (int((parsed_at(max(merges)) - parsed_at(plan["at"]))
                                      .total_seconds()) if merges else None),
        "merged_per_owner_wait_hour": _ratio(merged, wait),
        "policy_compliance": _ratio(
            sum(1 for _, row in runs if _complies(row, plan["policy"])),
            len(runs)),
        "conductor_session": "unmetered"}, []


def scorecard(root, batch, now):
    """(scorecard row, problems) for the batch, from its ledger and the
    cost ledger at `root`."""
    text, shown, problems = read_text(root, batch)
    if problems:
        return None, problems
    rows, problems = parse(text, shown)
    if problems:
        return None, problems
    entries, problems = cost_ledger.read(root)
    if problems:
        return None, problems
    return compute(rows, [lineno for lineno, _ in numbered(text)], shown,
                   entries, now)


def scorecard_cli(root, args, now):
    if len(args) != 1:
        return None
    card, problems = scorecard(root, args[0], now)
    if card is not None:
        print(json.dumps(card, indent=2))
    return problems


# How many batches `scorecards` compares when no N is given.
TREND_BATCHES = 5


def _is_metric(value):
    return value is None or (isinstance(value, (int, float))
                             and not isinstance(value, bool))


def _shown(value):
    return "-" if value is None else str(value)


def trend(rows, total):
    """The report lines comparing scorecard `rows` (oldest first), the
    latest of `total` scored batches: each
    metric (a field that is a number or null in every row holding it)
    across the rows, then its change from the second-last row to the
    last, or n/a when either is missing."""
    keys = list(dict.fromkeys(key for row in rows[::-1] for key in row))
    lines = [f"scorecards: the last {len(rows)} of {total} batch(es):"
             f" {' -> '.join(row['batch'] for row in rows)}"]
    for key in keys:
        values = [row.get(key) for row in rows]
        if not all(map(_is_metric, values)):
            continue
        line = f"  {key}: {' -> '.join(map(_shown, values))}"
        if len(values) > 1:
            last, before = values[-1], values[-2]
            line += (" (n/a)" if None in (last, before)
                     else f" ({round(last - before, PLACES):+})")
        lines.append(line)
    return lines


def scorecards_cli(root, args):
    """`scorecards [N]`: print each metric across the last N scored
    batches (TREND_BATCHES by default) with its latest change."""
    if len(args) > 1 or (args and not args[0].isdigit()) \
            or (args and int(args[0]) < 1):
        return None
    rows, problems = history(root)
    if problems:
        return problems
    if not rows:
        print(f"scorecards: no batch scored yet in {SCORECARDS}")
        return []
    window = rows[-(int(args[0]) if args else TREND_BATCHES):]
    print("\n".join(trend(window, len(rows))))
    return []


# --- closing a batch (WO-0163) -----------------------------------------

NEEDS_HUMAN = "needs-human"
# The labels close writes; detector J checks the taxonomy carries
# them (gates.declared_labels reads every module's LABELS).
LABELS = (NEEDS_HUMAN,)
CLOSE_OPTIONS = ["merge", "hold"]
CLOSE_WHY = ("every item is merged or blocked, and the scorecard computed"
             " from the ledger")


def is_closed(rows):
    return any(row["kind"] == "close" for row in rows)


def closed_batches(root):
    """(closed, gaps): the one walk over every batch ledger under root,
    in name order, that calibrate and the miner read (#854). closed is
    [(batch, rows, line numbers)]; gaps is {"unreadable": [names],
    "unclosed": n}. A ledger that will not load (or whose directory is no
    batch name) and an unclosed one are gaps, never problems: ledgers on
    main are append-only evidence, so one bad line must not fail every
    reading after it (#837). It lives here, not beside conductor.LEDGER,
    because conductor.py sits at its 800-line ceiling."""
    closed, unreadable, unclosed = [], [], 0
    for path in sorted(Path(root).glob(LEDGER.format(batch="*"))):
        batch = path.parent.name
        text, shown, problems = read_text(root, batch)
        rows, _ = (None, problems) if problems else parse(text, shown)
        if rows is None:
            unreadable.append(batch)
        elif is_closed(rows):
            closed.append((batch, rows, [n for n, _ in numbered(text)]))
        else:
            unclosed += 1
    return closed, {"unreadable": unreadable, "unclosed": unclosed}


def _final_items(rows, batch):
    """({final state: [items]}, problems): refused unless the batch is
    open and every item is merged or blocked."""
    if is_closed(rows):
        return None, [f"cd: close refused: batch {batch} is already closed"]
    finals = {state: [] for state in TERMINAL}
    for entry in (view(rows)["plan"] or {}).get("items", []):
        state = current_state(rows, entry["item"])
        if state not in TERMINAL:
            return None, [f"cd: close refused: {entry['item']} is {state},"
                          " not merged or blocked"]
        finals[state].append(entry["item"])
    return {state: sorted(items, key=lambda item: int(item[1:]))
            for state, items in finals.items()}, []


def _git(git, root, args, what):
    try:
        return git(["-C", str(root), *args]).stdout, []
    except CLI_FAILURES as err:
        return None, [f"{what} failed: {detail(err, every_line=True)}"]


def update_from_main(git, root, branch, refused="close refused"):
    """Merge origin/main into the batch branch, so the merged items'
    spend rows (which reached main on their own PRs) are in its
    costs.jsonl, and the closing merge's checks run on that main. Any
    failure aborts the merge and refuses the step `refused` names."""
    _, problems = _git(git, root, ["fetch", "origin", "main"],
                       "fetching origin/main")
    if not problems:
        _, problems = _git(git, root, ["merge", "--no-edit", "origin/main"],
                           f"merging origin/main into {branch}")
        if problems:
            _git(git, root, ["merge", "--abort"], "aborting the merge")
    return [f"cd: {refused}: {problem}" for problem in problems]


def _at(git, root):
    """The git port run inside root: conductor_run's readers take a port
    that needs no -C."""
    return lambda args: git(["-C", str(root), *args])


def _refused(problems):
    return [f"cd: close refused: {problem.removeprefix('cd: ')}"
            for problem in problems]


def carry_blocked_spend(git, root, batch, blocked):
    """Append to the batch branch's costs.jsonl every spend row a blocked
    item's branch holds for its runs: so all spend reaches main. The
    rows are read by conductor_run.ref_rows, where an absent ledger holds
    none (#708, #772), and land through cost_ledger.record_new, which
    skips a row the batch branch already holds (row_key, ADR-0049), so a
    re-run never appends a row twice."""
    rows = []
    for item in blocked:
        found, unread, malformed = conductor_run.ref_rows(
            _at(git, root), flow.item_branch(batch, item))
        if unread or malformed:
            return _refused(unread) + malformed
        rows += [entry for entry in found
                 if run_item(batch, entry["run_id"]) == item]
    _, problems = cost_ledger.record_new(root, rows)
    return problems


def sort_blocked_branches(git, root, batch, blocked):
    """({"delete": [(branch, sha)], "keep": [branches]}, problems): a
    blocked item's branch is deleted when its commits beyond origin/main
    are all spend commits of that item's own runs in this batch
    (conductor_run.spend_run, run_item), whose rows carry_blocked_spend
    put on the batch branch; it is kept when any commit is something
    else — a Worker's own `chore(cost): ...` commit, or another batch's
    run, included (#771). The sha is the local ref inspected, which the
    delete leases on. A branch with nothing beyond origin/main is in
    neither: it holds nothing to lose or to keep, and may not be on
    origin at all."""
    sorted_branches = {"delete": [], "keep": []}
    for item in blocked:
        branch = flow.item_branch(batch, item)
        sha, problems = _git(git, root, ["rev-parse", branch],
                             f"reading {branch}'s head")
        subjects, problems = (None, problems) if problems else \
            conductor_run.run_commits(_at(git, root), branch, sha.strip())
        if problems:
            return None, _refused(problems)
        if not subjects:
            continue
        if all(run_item(batch, conductor_run.spend_run(subject) or "")
               == item for subject in subjects):
            sorted_branches["delete"].append((branch, sha.strip()))
        else:
            sorted_branches["keep"].append(branch)
    return sorted_branches, []


# A scorecard row's text fields and its cause tables (#814, #819); every
# other field is a metric: a finite number, or null where it has none.
SCORECARD_TEXT = ("batch", "at", "conductor_session")
SCORECARD_COUNTS = ("stalls_by_cause", "blocked_by_cause")


def scorecard_problems(row):
    """Unlocated problems for one scorecard row (#814): the one shape its
    writer (append_scorecard) and its reader (history) both check."""
    if not isinstance(row, dict) or "batch" not in row:
        return ["is not a scorecard row (a JSON object with a batch)"]
    problems = []
    for key, value in row.items():
        if key in SCORECARD_TEXT:
            valid, shape = is_text(value), "a non-empty string"
        elif key in SCORECARD_COUNTS:
            valid = isinstance(value, dict) and all(
                type(n) is int and n >= 0 for n in value.values())
            shape = "a map of cause to count"
        else:
            valid = _is_metric(value) and math.isfinite(value or 0)
            shape = "a finite number or null"
        if not valid:
            problems.append(f"{key} {value!r} is not {shape}")
    return problems


def _by_meaning(row):
    """A row written between #808 and #814 holds the ran steps' error
    under estimate_error_pct: it reads as ran_estimate_error_pct, beside
    the whole plan's from its own figures. Other rows read as written."""
    if "ran_estimate_usd" not in row or "ran_estimate_error_pct" in row:
        return row
    return {**row, "estimate_error_pct": _error_pct(
        row.get("metered_usd"), row.get("estimate_usd")),
        "ran_estimate_error_pct": row.get("estimate_error_pct")}


def history(root):
    """(scorecard rows in file order, problems): the reader of
    docs/factory/scorecards.jsonl (#797), beside its writer. No file is
    no history. A line that does not parse or breaks scorecard_problems
    fails the read naming its line: never a partial history. A row reads
    as written, every key in one meaning (_by_meaning)."""
    path = Path(root) / SCORECARDS
    if not path.is_file():
        return [], []
    rows = []
    for lineno, line in numbered(path.read_text(encoding="utf-8")):
        try:
            row = json.loads(line)
        except ValueError as err:
            return None, [f"cd: {SCORECARDS}:{lineno} is not valid JSON:"
                          f" {err}"]
        problems = scorecard_problems(row)
        if problems:
            return None, [f"cd: {SCORECARDS}:{lineno} {problem}"
                          for problem in problems]
        rows.append(_by_meaning(row))
    return rows, []


def append_scorecard(root, card):
    """(problems): append the batch's one scorecard row, unless a row
    for the batch is already there, or one breaking scorecard_problems.
    APPEND ONLY: never rewrites. The read makes a close retried after a
    failed close-row write score the batch once, not twice (review minor
    6); batch names are never reused, since `open` refuses one whose
    ledger is on main."""
    problems = [f"cd: not appended to {SCORECARDS}: {problem}"
                for problem in scorecard_problems(card)]
    rows, problems = (None, problems) if problems else history(root)
    if problems:
        return problems
    if any(row["batch"] == card["batch"] for row in rows):
        return []
    path = Path(root) / SCORECARDS
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(card) + "\n")
    return []


def pr_body(batch, finals, kept=()):
    blocked = ", ".join(finals["blocked"]) or "none"
    closes = "".join(f"Closes {item}\n" for item in finals["merged"])
    keeps = (f"Kept on origin, holding work beyond spend rows:"
             f" {', '.join(kept)}.\n\n" if kept else "")
    return (f"Conductor batch {batch}'s closing PR: its batch ledger, run"
            " evidence, scorecard, and the spend rows of its blocked items"
            f" ({blocked}).\n\n{keeps}{closes}\nNo work order: the"
            f" Conductor's closing PR for batch {batch}.")


def blocked_comment(batch, item, reason, kept):
    branch = flow.item_branch(batch, item)
    keeps = (f". Its branch {branch} is kept on origin: it holds work"
             " beyond its spend rows." if branch in kept else "")
    return f"Blocked in conductor batch {batch}: {reason}{keeps}"


def _record_close(root, batch, now, finals):
    """(the closing merge ask's id, problems): the close row and the
    closing merge ask, written together under one lock."""
    branch = batch_branch(batch)

    def build(rows):
        closed = {"at": stamp(now), "kind": "close", "item": None,
                  "merged": finals["merged"], "blocked": finals["blocked"]}
        asked, problems = ask_row(
            rows + [closed], now, None, "merge",
            f"Merge batch {batch}'s closing PR ({branch}): its ledger, run"
            " evidence and scorecard?", CLOSE_OPTIONS, "merge", CLOSE_WHY)
        return [closed, asked], problems
    written, problems = append(root, batch, build)
    return (written[1]["id"] if written else None), problems


def _publish(root, batch, git, gh, finals, reasons, branches):
    """Commit, push (never forced), open the closing PR, label each
    blocked item, then delete its spend-only branches from origin: only
    once the push carried their spend rows. A problem names the step
    that failed; the close is already recorded, so what remains is
    finished by hand."""
    # lean: no resume after a failed publish step; the close row is
    # written, so a re-run is refused and the step is finished by hand.
    # The trigger to resume mechanically is a real batch hitting it.
    branch = batch_branch(batch)
    for args, what in (
            (["add", "--", batch_dir(batch),
              cost_ledger.COST_LEDGER, SCORECARDS], "staging the close"),
            (["commit", "-m", f"chore(conductor): close batch {batch}"],
             "committing the close"),
            (["push", "-u", "origin", branch], f"pushing {branch}")):
        _, problems = _git(git, root, args, what)
        if problems:
            return [f"cd: close: {problems[0]}; finish the push, the PR and"
                    " the needs-human labels by hand"]
    # A tools-only stamp never syncs labels.json, so the one label close
    # writes may not exist (#726). Ensured here, where it is written,
    # rather than at `open`: a label deleted mid-batch, and a batch
    # opened before this check, are caught too.
    if finals["blocked"]:
        problems = label_sync.ensure(root, LABELS, gh)
        if problems:
            return [f"cd: close: {problems[0]}; finish the PR and the"
                    " needs-human labels by hand"]
    calls = [["pr", "create", "--head", branch, "--base", "main", "--title",
              f"conductor batch {batch}: ledger and scorecard", "--body",
              pr_body(batch, finals, branches["keep"])]]
    for item in finals["blocked"]:
        calls += [["issue", "edit", item[1:], "--add-label", NEEDS_HUMAN],
                  ["issue", "comment", item[1:], "--body",
                   blocked_comment(batch, item, reasons[item],
                                   branches["keep"])]]
    for call in calls:
        try:
            gh(call)
        except CLI_FAILURES as err:
            return [f"cd: close: gh {' '.join(call[:2])} failed:"
                    f" {detail(err)}; finish the PR and the needs-human"
                    " labels by hand"]
    # Leased on the sha inspected: git refuses the delete when origin's
    # branch moved past it, so no commit close never read is removed.
    for branch, sha in branches["delete"]:
        ref = f"refs/heads/{branch}"
        _, problems = _git(git, root, ["push", f"--force-with-lease={ref}:"
                                       f"{sha}", "origin", f":{ref}"],
                           f"deleting origin's {branch}")
        if problems:
            return [f"cd: close: {problems[0]}; delete it by hand"]
    return []


def close_batch(root, batch, clock, git, gh):
    """(summary, problems): close the batch. Nothing is appended to
    scorecards.jsonl, and no close row is written, unless the scorecard
    computes."""
    rows, problems = load(root, batch)
    if problems:
        return None, problems
    finals, problems = _final_items(rows, batch)
    if problems:
        return None, problems
    problems = (update_from_main(git, root, batch_branch(batch))
                or carry_blocked_spend(git, root, batch, finals["blocked"]))
    if problems:
        return None, problems
    branches, problems = sort_blocked_branches(git, root, batch,
                                               finals["blocked"])
    if problems:
        return None, problems
    now = clock()
    card, problems = scorecard(root, batch, now)
    if problems:
        return None, problems
    problems = append_scorecard(root, card)
    if problems:
        return None, problems
    ask_id, problems = _record_close(root, batch, now, finals)
    if problems:
        return None, problems
    reasons = {item: item_view(rows, item)["last"]["reason"]
               for item in finals["blocked"]}
    return {"batch": batch, **finals, "ask": ask_id}, _publish(
        root, batch, git, gh, finals, reasons, branches)


def _closing_answer(rows, batch):
    """(problems): refused unless the batch is closed and the Owner
    answered its closing merge ask `merge`."""
    closed = [index for index, row in enumerate(rows)
              if row["kind"] == "close"]
    if not closed:
        return [f"cd: closing merge refused: batch {batch} is not closed"]
    asked = next(row for row in rows[closed[0]:] if row["kind"] == "ask")
    answered = answers(rows).get(asked["id"])
    if answered is None:
        return [f"cd: closing merge refused: {asked['id']} is unanswered"]
    if answered["choice"] != "merge":
        return [f"cd: closing merge refused: {asked['id']} was answered"
                f" {answered['choice']}, not merge"]
    return []


def merge_closing(root, batch, clock, git, gh, sleep):
    """(summary, problems): merge the closing PR once the Owner answered
    its ask `merge`. The answer row is written after close pushed, so it
    is committed and pushed first (#726): the ledger that merges holds
    the answer that authorised its merge. Then origin/main is merged in
    and conductor_merge.land_branch lands it, as the merge turn does
    (#770): checks on that head, main held unless queued. A landing that
    stalls because the repo's own auto-merge already merged the PR with
    the pushed head succeeds as merged `by` the repo (#807)."""
    rows, problems = load(root, batch)
    problems = problems or _closing_answer(rows, batch)
    if problems:
        return None, problems
    branch, ledger_dir = batch_branch(batch), batch_dir(batch)
    dirty, problems = _git(git, root, ["status", "--porcelain", "--",
                                       ledger_dir], "reading the ledger")
    steps = ([(["add", "--", ledger_dir], "staging the answer"),
              (["commit", "-m", f"chore(conductor): record batch {batch}'s"
                " closing answer"], "committing the answer")]
             if dirty and dirty.strip() else [])
    for args, what in steps:
        if problems:
            break
        _, problems = _git(git, root, args, what)
    if problems:
        return None, [f"cd: closing merge: {problems[0]}"]
    problems = update_from_main(git, root, branch, refused="closing merge")
    if problems:
        return None, problems
    try:
        base = conductor_merge.main_head(git, root)
        pr, sha, _ = conductor_merge.land_branch(git, gh, root, branch, base,
                                                 clock, sleep)
    except conductor_merge.Stall as stall:
        return _landed_by_repo(git, gh, root, batch, stall)
    return {"batch": batch, "pr": pr, "sha": sha}, []


def _landed_by_repo(git, gh, root, batch, stall):
    """(summary, problems) for a closing merge whose landing stalled: a
    success when the repo already merged the PR with the pushed head, a
    gap named when it merged without it, else the stall itself."""
    try:
        landed = conductor_merge.landed_by_repo(git, gh, root,
                                                batch_branch(batch))
    except conductor_merge.Stall as gap:
        return None, [f"cd: closing merge: {gap.reason}"]
    if landed is None:
        return None, [f"cd: closing merge: {stall.reason}"]
    pr, sha = landed
    return {"batch": batch, "pr": pr, "sha": sha, "by": "repo"}, []


def close_cli(root, args, clock, git, gh, sleep=None):
    if args[1:] == ["--merge"]:
        summary, problems = merge_closing(root, args[0], clock, git, gh,
                                          sleep or time.sleep)
        if summary is not None and summary.get("by") == "repo":
            print(f"cd: batch {summary['batch']}'s closing PR"
                  f" #{summary['pr']} was already merged by the repo as"
                  f" {summary['sha']}")
        elif summary is not None:
            print(f"cd: merged batch {summary['batch']}'s closing PR"
                  f" #{summary['pr']} as {summary['sha']}")
        return problems
    if len(args) != 1:
        return None
    summary, problems = close_batch(root, args[0], clock, git, gh)
    if summary is not None:
        print(f"cd: closed batch {summary['batch']}: merged"
              f" {', '.join(summary['merged']) or 'none'}; blocked"
              f" {', '.join(summary['blocked']) or 'none'}; merge ask"
              f" {summary['ask']}")
    return problems
