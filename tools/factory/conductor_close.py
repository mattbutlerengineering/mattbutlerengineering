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
commits beyond origin/main are spend commits, whose rows it carried; a
branch holding any other commit is kept, and named in the closing PR
body and on its item's needs-human comment (#728).

`close <batch> --merge` merges the closing PR once the Owner answered
its ask `merge`, first committing and pushing that answer row (#726).
"""
import json
import time
from pathlib import Path

import conductor_flow as flow
import conductor_merge
import conductor_run
import cost_ledger
import factory_config
import label_sync
from cli import CLI_FAILURES, detail, label_names
from conductor import TERMINAL, answers, append, ask_row, batch_branch, \
    batch_dir, current_state, item_view, load, numbered, parse, parsed_at, \
    read_text, run_item, stamp, view

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


def _review_changes(rows):
    """Requests for changes: a review sent back to build, and a second
    request that stalled the item."""
    return sum(1 for row in rows if row["kind"] == "state"
               and row["from"] == "review"
               and (row["to"] == "build" or row["reason"]
                    == flow.CHANGES_AGAIN))


def compute(rows, lines, shown, entries, now):
    """(scorecard row, problems), PURE over the ledger's rows (each on
    its line in `lines`) and the cost ledger's entries."""
    plan = view(rows)["plan"]
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
    estimate = plan["estimate_usd"]
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
        "estimate_usd": estimate,
        "estimate_error_pct": (round((metered - estimate) / estimate * 100,
                                     PLACES) if estimate else None),
        "collisions": sum(len(row.get("renumbered_from", []))
                          for row in rows if row["kind"] == "reserve"),
        "stalls": sum(1 for row in rows if row["kind"] == "state"
                      and row["to"] == "stalled"),
        "escalations": sum(1 for row in rows if row["kind"] == "ask"
                           and row["ask_kind"] in ESCALATIONS),
        "review_changes_per_item": _ratio(_review_changes(rows), len(items)),
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


# --- closing a batch (WO-0163) -----------------------------------------

NEEDS_HUMAN = "needs-human"
CLOSE_OPTIONS = ["merge", "hold"]
CLOSE_WHY = ("every item is merged or blocked, and the scorecard computed"
             " from the ledger")


def _final_items(rows, batch):
    """({final state: [items]}, problems): refused unless the batch is
    open and every item is merged or blocked."""
    if any(row["kind"] == "close" for row in rows):
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


def update_from_main(git, root, branch):
    """Merge origin/main into the batch branch, so the merged items'
    spend rows (which reached main on their own PRs) are in its
    costs.jsonl. Any failure aborts the merge and refuses the close."""
    _, problems = _git(git, root, ["fetch", "origin", "main"],
                       "fetching origin/main")
    if not problems:
        _, problems = _git(git, root, ["merge", "--no-edit", "origin/main"],
                           f"merging origin/main into {branch}")
        if problems:
            _git(git, root, ["merge", "--abort"], "aborting the merge")
    return [f"cd: close refused: {problem}" for problem in problems]


def carry_blocked_spend(git, root, batch, blocked):
    """Append to the batch branch's costs.jsonl every spend row a blocked
    item's branch holds for its runs and the batch branch lacks: so all
    spend reaches main, and a re-run never appends a row twice. Lacking
    is cost_ledger.row_key's identity (ADR-0049), and each row lands
    through cost_ledger.record, the one guarded write (#736)."""
    entries, problems = cost_ledger.read(root)
    if problems:
        return problems
    present = {cost_ledger.row_key(entry) for entry in entries}
    for item in blocked:
        branch = flow.item_branch(batch, item)
        text, problems = _git(git, root, ["show", f"{branch}:"
                                          f"{cost_ledger.COST_LEDGER}"],
                              f"reading {branch}'s spend rows")
        if problems:
            return [f"cd: close refused: {problem}" for problem in problems]
        for lineno, entry, suffixes in cost_ledger.parse(text):
            if suffixes:
                return [f"cd: {branch}:{cost_ledger.COST_LEDGER}:{lineno}"
                        f" {suffix}" for suffix in suffixes]
            if run_item(batch, entry["run_id"]) == item \
                    and cost_ledger.row_key(entry) not in present:
                refused = cost_ledger.record(root, entry)
                if refused:
                    return [f"cd: close refused: {problem}"
                            for problem in refused]
                present.add(cost_ledger.row_key(entry))
    return []


def sort_blocked_branches(git, root, batch, blocked):
    """({"delete": [(branch, sha)], "keep": [branches]}, problems): a
    blocked item's branch is deleted when its commits beyond origin/main
    are all spend commits, whose rows carry_blocked_spend put on the
    batch branch; it is kept when any commit is something else. The sha
    is the local ref inspected, which the delete leases on. A branch
    with nothing beyond origin/main is in neither: it holds nothing to
    lose or to keep, and may not be on origin at all."""
    sorted_branches = {"delete": [], "keep": []}
    for item in blocked:
        branch = flow.item_branch(batch, item)
        sha, problems = _git(git, root, ["rev-parse", branch],
                             f"reading {branch}'s head")
        out, problems = (None, problems) if problems else _git(
            git, root, ["log", "--format=%s", f"origin/main..{sha.strip()}"],
            f"reading {branch}'s commits")
        if problems:
            return None, [f"cd: close refused: {problem}"
                          for problem in problems]
        subjects = out.splitlines()
        if not subjects:
            continue
        if all(subject.startswith(conductor_run.SPEND_SUBJECT)
               for subject in subjects):
            sorted_branches["delete"].append((branch, sha.strip()))
        else:
            sorted_branches["keep"].append(branch)
    return sorted_branches, []


def append_scorecard(root, card):
    """(problems): append the batch's one scorecard row, unless a row
    for the batch is already there. APPEND ONLY: never rewrites. The
    read makes a close retried after a failed close-row write score the
    batch once, not twice (review minor 6); batch names are never
    reused, since `open` refuses one whose ledger is on main."""
    path = Path(root) / SCORECARDS
    if path.is_file():
        for lineno, line in numbered(path.read_text(encoding="utf-8")):
            try:
                row = json.loads(line)
            except ValueError as err:
                return [f"cd: {SCORECARDS}:{lineno} is not valid JSON:"
                        f" {err}"]
            if isinstance(row, dict) and row.get("batch") == card["batch"]:
                return []
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


def _missing_label(gh):
    """(True when the repo lacks needs-human, problems). A tools-only
    stamp never syncs labels.json, so the one label close writes may not
    exist (#726). Checked here, where it is written, rather than at
    `open`: a label deleted mid-batch, and a batch opened before this
    check, are caught too. A missing label is created bare; label_sync
    --apply gives it the taxonomy's colour where labels.json exists."""
    listing, problems = label_sync.live_labels(gh)
    if listing is None:
        return None, problems
    return NEEDS_HUMAN not in label_names(listing), []


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
    calls = [["pr", "create", "--head", branch, "--base", "main", "--title",
              f"conductor batch {batch}: ledger and scorecard", "--body",
              pr_body(batch, finals, branches["keep"])]]
    if finals["blocked"]:
        missing, problems = _missing_label(gh)
        if problems:
            return [f"cd: close: {problems[0]}; finish the PR and the"
                    " needs-human labels by hand"]
        calls += [["label", "create", NEEDS_HUMAN]] if missing else []
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
    the answer that authorised its merge. Then the checks on that head,
    and a squash-merge or enqueue pinned to it."""
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
    for args, what in steps + [(["push", "-u", "origin", branch],
                                f"pushing {branch}"),
                               (["rev-parse", "HEAD"], "reading the head")]:
        if problems:
            break
        head, problems = _git(git, root, args, what)
    if problems:
        return None, [f"cd: closing merge: {problems[0]}"]
    try:
        pr = conductor_merge.pr_number(gh, branch)
        conductor_merge.wait_checks(gh, head.strip(), clock, sleep)
        sha = conductor_merge.land(gh, pr, head.strip(),
                                   conductor_merge.has_queue(gh), clock,
                                   sleep)
    except conductor_merge.Stall as stall:
        return None, [f"cd: closing merge: {stall.reason}"]
    return {"batch": batch, "pr": pr, "sha": sha}, []


def close_cli(root, args, clock, git, gh, sleep=None):
    if args[1:] == ["--merge"]:
        summary, problems = merge_closing(root, args[0], clock, git, gh,
                                          sleep or time.sleep)
        if summary is not None:
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
