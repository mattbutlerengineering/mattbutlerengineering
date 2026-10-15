#!/usr/bin/env python3
"""conductor_flow: the item state machine and the stall rule in `next`
(PRD-0013, WO-0157), split from conductor.py by capability (breakdown
assumption 6). It imports conductor.py's row grammar and ledger writes,
which keep one owner.

An item moves only along

  planned -> spec -> awaiting-gate -> build -> verify -> review
          -> reviewed -> ship -> merging -> merged

A fix may skip awaiting-gate when its branch changes no gate file; an
order starts at build; review returns to build once, for the reviewer's
first request for changes. `stalled` is reachable from any non-terminal
state and left only for the step it stalled in, after a retry answer.
`blocked` is written only by conductor.answer. The Owner's 2026-10-10
answers (breakdown.md Notes, rows 0157 and 0158) settle the launch
record, readiness, gate asks and verdicts used here.
"""
import json
import os
import re

import conductor_consent as consent
import factory_config
from cli import CLI_FAILURES, detail
from conductor import (BLOCK, COMPLETED, TERMINAL, answers, append,
                       ask_row, current_state, item_branch, item_view, load,
                       next_ask, parsed_at, stamp, view)

STEPS = ("spec", "build", "verify", "review", "ship")
SEQUENCE = ("planned", "spec", "awaiting-gate", "build", "verify",
            "review", "reviewed", "ship", "merging", "merged")
# lean: fixed wall-clock limits per size (architecture.md); the trigger
# to tune one is a scorecard showing it fire on a healthy run.
WALL_CLOCK_MINUTES = {"S": 45, "M": 90, "L": 180}
# Cheapest first, so retry-up takes the next band to the right.
BANDS = factory_config.BANDS
STALL_OPTIONS = ("retry", "retry-up", "block")
GATE_OPTIONS = ["approve", "block"]
PAUSE_OPTIONS = ["resume", "stop"]
# A batch-level answer with one of these choices holds all dispatch.
HOLD_CHOICES = ("decline", "stop")
FAILURE_PAUSE = 3
GATE_PATH = re.compile(r"docs/adr/.+|docs/design/.+|(?:.+/)?"
                       r"(?:prd|architecture)\.md")
UNCHECKED_ROW = re.compile(r"- \[ \] .*")
VERDICTS = ("pass", "changes")


def _shipped(rows):
    """The plan's items whose ship step completed, in plan order."""
    read = view(rows)
    return [entry["item"] for entry in (read["plan"] or {}).get("items", [])
            if read["items"][entry["item"]]["state"] == "ship"
            and read["items"][entry["item"]]["completed"]]


def merge_due(rows, facts, policy=None):
    """The shipped items that wait for a merge ask the Conductor words:
    conductor_consent.cover reads them OWED, and no ask is pending,
    whether the item's own or a train listing it. `facts` maps an item
    to its branch facts; a shipped item with no gate_blobs read yet is
    not judged. PURE."""
    given = answers(rows)
    pending = [row for row in rows if row["kind"] == "ask"
               and row["ask_kind"] == "merge" and row["id"] not in given]
    due = []
    for item in _shipped(rows):
        blobs = facts.get(item, {}).get("gate_blobs")
        if blobs is None or item_view(rows, item)["pending"] is not None \
                or any(item in row.get("covers", []) for row in pending):
            continue
        if consent.cover(rows, item, blobs, policy)[0] == consent.OWED:
            due.append(item)
    return due


def standing_due(rows, facts, policy=None):
    """The merge-due items no merge ask covers at all, answered or not:
    the ones the standing policy may cover (ADR-0086). Once the Owner
    has a merge ask on an item, the Owner's answer decides it. PURE."""
    asked = set()
    for row in rows:
        if row["kind"] == "ask" and row["ask_kind"] == "merge":
            asked.update([row["item"], *row.get("covers", [])])
    return [item for item in merge_due(rows, facts, policy)
            if item not in asked]


def _successors(item_type, state, rows, item):
    """The states the item may enter from `state` along its sequence."""
    if state == "planned":
        return ["build"] if item_type == "order" else ["spec"]
    if state == "spec":
        return (["awaiting-gate", "build"] if item_type == "fix"
                else ["awaiting-gate"])
    if state == "build":
        return ["build", "verify"]
    if state == "review":
        fixed = any(row["from"] == "review" and row["to"] == "build"
                    for row in item_view(rows, item)["states"])
        return ["reviewed"] if fixed else ["reviewed", "build"]
    following = SEQUENCE.index(state) + 1
    return list(SEQUENCE[following:following + 1])


def _stalled_problems(found, to):
    stalled = found["last"]
    if to != stalled["from"] or not found["retry"]:
        return [f"cd: {found['item']} leaves stalled only for"
                f" {stalled['from']}, after a retry answer"]
    return []


def transition_problems(rows, item, to, fields):
    """Problems with moving `item` to `to` (with these extra state-row
    fields) given the ledger's rows. Empty means the move is legal."""
    found = item_view(rows, item)
    entry, state = found["entry"], found["state"]
    if found["unknown"]:
        return [found["unknown"]]
    if state in TERMINAL:
        return [f"cd: {item} is {state}, and {state} is terminal"]
    if to == "blocked":
        return [f"cd: {item} is blocked only by a {BLOCK} answer to one of"
                " its asks"]
    waiting = found["pending"]
    if waiting is not None and to != "stalled":
        return [f"cd: {item} has an unanswered ask ({waiting['id']})"]
    if to == "stalled":
        return ([] if state != "stalled"
                else [f"cd: {item} cannot move from stalled to stalled"])
    if state == "stalled":
        return _stalled_problems(found, to)
    if to not in _successors(entry["type"], state, rows, item):
        return [f"cd: {item} cannot move from {state} to {to}"]
    if state == "awaiting-gate":
        opened = found["gate"]
        if opened is None or opened["choice"] != "approve":
            return [f"cd: {item} leaves awaiting-gate only after an"
                    " approve answer to its gate ask"]
    if to == "reviewed" and fields.get("verdict") == "pass" \
            and fields.get("reviewer_run") in fields.get("author_runs", []):
        return [f"cd: {item} reviewed pass refused: reviewer run"
                f" {fields['reviewer_run']} is among its author runs"]
    # A launched step leaves only once its finishing run row exists, so a
    # second runner from a stale `next` never shares its worktree.
    if found["in_flight"]:
        return [f"cd: {item}'s {state} run {found['last']['run_id']} is"
                " still in flight"]
    return []


# The reason a launch state row carries: its `to` is the step launched,
# and the row names the Worker's run_id (conductor_run._launch).
LAUNCHED = "launched"


def state_row(now, item, frm, to, reason, **fields):
    return {"at": stamp(now), "kind": "state", "item": item, "from": frm,
            "to": to, "reason": reason, **fields}


def move(root, batch, now, item, to, reason, **fields):
    """(row, problems): append one state row, refused unless the move is
    legal on the ledger's rows as they stand under the lock."""
    def build(rows):
        problems = transition_problems(rows, item, to, fields)
        if problems:
            return None, problems
        return state_row(now, item, current_state(rows, item), to, reason,
                         **fields), []
    return append(root, batch, build)


def stall_options(band):
    """The stall ask's options for a step run at `band`: retry-up only
    below the top band."""
    return [option for option in STALL_OPTIONS
            if option != "retry-up" or band != BANDS[-1]]


def _choices(options):
    """The question's closing choice, naming only `options` (#725)."""
    words = [OPTION_WORDS[option] for option in options]
    said = ", or ".join([", ".join(words[:-1]), words[-1]])
    return said[0].upper() + said[1:] + "?"


def stall_rows(rows, now, entry, reason, cause, recommended, why):
    """[state row, stall ask] for an item that stalls in its current
    state, for `reason` of class `cause` (conductor.CAUSES, #819).
    retry-up is offered only when the run leaving this state (if any — a
    dead runner leaves none) was not already at the top band: the
    planned band alone misses a prior retry-up bump (#732)."""
    item = entry["item"]
    found = item_view(rows, item)
    state, finishing = found["state"], found["finishing"]
    options = stall_options(finishing["band"] if finishing is not None
                            else found["steps"].get(state, {}).get("band"))
    moved = state_row(now, item, state, "stalled", reason, cause=cause)
    asked, problems = ask_row(
        rows + [moved], now, item, "stall",
        f"{item} stalled in {state}: {reason}. {_choices(options)}",
        options, recommended, why)
    return [moved, asked], problems


def prior_stalls(rows, item, step):
    """[(run row or None, stall reason)], oldest first: the item's latest
    consecutive runs of `step` that each ended in a stall. A run of the
    step that did not stall ends the streak."""
    found = item_view(rows, item)
    by_id = {row["run_id"]: row for row in found["runs"]}
    launches = []
    for row in found["states"]:
        if row["to"] == step and "run_id" in row:
            launches.append([by_id.get(row["run_id"]), None])
        elif row["to"] == "stalled" and row["from"] == step and launches:
            launches[-1][1] = row["reason"]
    streak = []
    for run, reason in launches:
        streak = streak + [(run, reason)] if reason is not None else []
    return streak


def worker_advice(rows, entry, step, band, reason):
    """(recommended, why) for the stall ask of a failed Worker run of
    `step` at `band`, from the item's rows before that run launched
    (#725). A first failure recommends retry; a second consecutive
    budget stop at the same band recommends retry-up while it is offered
    and the run was not already one band up, else block, since the
    ceiling is the same and so is the outcome."""
    earlier = prior_stalls(rows, entry["item"], step)
    if not earlier:
        return "retry", WORKER_WHY
    run, last = earlier[-1]
    if reason == BUDGET_REASON and last == BUDGET_REASON \
            and (run or {}).get("band") == band:
        policy = item_view(rows, entry["item"])["steps"][step]
        up = "retry-up" in stall_options(band) \
            and band == policy["band"] and not policy["bumped"]
        return ("retry-up" if up else BLOCK), REPEAT_BUDGET_WHY.format(
            step=step, ceiling=policy["ceiling_usd"],
            remedy=("retry it one band up, on a stronger model" if up
                    else "block it"))
    return "retry", ATTEMPT_WHY.format(n=len(earlier) + 1, step=step)


def queue_stall(root, batch, now, item, reason, cause, recommended, why):
    """(rows written, problems): stall the item and queue its ask."""
    def build(rows):
        found = item_view(rows, item)
        if found["unknown"]:
            return None, [found["unknown"]]
        return stall_rows(rows, now, found["entry"], reason, cause,
                          recommended, why)
    return append(root, batch, build)


OPTION_WORDS = {"retry": "retry", "retry-up": "retry one band up",
                "block": "block"}
WORKER_WHY = ("a first failure is evidence about the item as often as about"
              " the agent, so nothing retries without your answer")
ATTEMPT_WHY = ("attempt {n} at {step} failed after an earlier one did, so"
               " the item is as likely a cause as the agent; nothing"
               " retries without your answer")
# The stall reason conductor_run gives a run the harness stopped at its
# --max-budget-usd ceiling.
BUDGET_STOP = "error_max_budget_usd"
BUDGET_REASON = f"the Worker run ended {BUDGET_STOP}"
REPEAT_BUDGET_WHY = ("a second consecutive budget stop on {step} at the same"
                     " ${ceiling:.2f} ceiling: the outcome repeats at that"
                     " ceiling, so a plain retry spends it again; {remedy}")
IDLE_WHY = ("a dead runner or an idle step is evidence about the run more"
            " than about the item")
CHANGES_WHY = "a second request for changes is evidence about the item"
# The stall reason of a second request for changes: the scorecard counts
# it as a review change.
CHANGES_AGAIN = "the reviewer requested changes a second time"


def review_change(row):
    """True for a ledger row recording a request for changes: a review
    sent back to build, or a second request that stalled the item. The
    rule rejection_mining reads Conductor rework by (#800)."""
    return (row["kind"] == "state" and row["from"] == "review"
            and (row["to"] == "build" or row["reason"] == CHANGES_AGAIN))


def record_verdict(root, batch, now, item, verdict, reviewer_run, head):
    """(rows written, problems): the review step's verdict. pass writes
    `reviewed` with the item's author runs (every run but a review) and
    `head`, the item branch head the review run was launched on, which
    the merge holds the merged tree to; the first `changes` returns the
    item to build for one fix step; the second stalls it."""
    if verdict not in VERDICTS:
        return None, [f"cd: verdict {verdict!r} is not pass or changes"]

    def build(rows):
        found = item_view(rows, item)
        entry = found["entry"]
        if found["unknown"]:
            return None, [found["unknown"]]
        if verdict == "pass":
            fields = {"verdict": "pass",
                      "author_runs": list(found["author_runs"]),
                      "reviewer_run": reviewer_run, "reviewed_head": head}
            to, reason = "reviewed", "the reviewer passed it"
        else:
            fields, to = {}, "build"
            reason = "the reviewer requested changes; one fix step"
            if "build" not in _successors(entry["type"], "review", rows,
                                          item):
                return stall_rows(rows, now, entry, CHANGES_AGAIN,
                                  "changes-again", BLOCK, CHANGES_WHY)
        problems = transition_problems(rows, item, to, fields)
        if problems:
            return None, problems
        return [state_row(now, item, current_state(rows, item), to, reason,
                          **fields)], []
    return append(root, batch, build)


def held(rows):
    """True when a batch-level ask is unanswered or was answered with a
    choice that holds dispatch (a declined spend, a stopped pause). A
    train or closing merge ask holds no Worker step."""
    given = answers(rows)
    for row in rows:
        if row["kind"] == "ask" and row["item"] is None \
                and row["ask_kind"] != "merge":
            answer = given.get(row["id"])
            if answer is None or answer["choice"] in HOLD_CHOICES:
                return True
    return False


def _failure_streak(rows):
    """Consecutive failed runs since the last batch pause ask."""
    start = max((index for index, row in enumerate(rows)
                 if row["kind"] == "ask" and row["item"] is None
                 and row["ask_kind"] == "stall"
                 and row["options"] == PAUSE_OPTIONS), default=-1)
    streak = 0
    for row in rows[start + 1:]:
        if row["kind"] == "run":
            streak = streak + 1 if row["outcome"] != COMPLETED else 0
    return streak


def needs_facts(rows):
    """The items whose finished spec or build step needs branch facts
    (gate blobs, unchecked rows) before `survey` can say what follows."""
    read = view(rows)
    found = [read["items"][entry["item"]]
             for entry in (read["plan"] or {}).get("items", [])]
    return [one["item"] for one in found
            if one["state"] in ("spec", "build") and one["completed"]]


def _build_usd(ceiling, rows):
    """The build's price: one run per breakdown row, each up to the
    build step's `ceiling` (the --max-budget-usd it runs under)."""
    return round(rows * ceiling, 2)


def _gate_question(entry, ceiling, rows):
    """The gate ask, which doubles as the build-spend question
    (architecture.md, `plan`): the plan priced one build run, so the
    item is re-priced with one per breakdown row."""
    item = entry["item"]
    build = _build_usd(ceiling, rows)
    repriced = entry["estimate_usd"] - ceiling + build
    return (f"{item}'s spec is ready for its gate: approve these gate files"
            f" and its build of {rows} breakdown row(s) at up to"
            f" ${ceiling:.2f} each (${build:.2f}), re-pricing {item} at"
            f" ${repriced:.2f} against its ${entry['estimate_usd']:.2f}"
            " plan estimate?")


def _after_step(rows, now, entry, launched, facts, policy):
    """(ready step or None, rows to write) once the item's launched step
    has finished with a completed run."""
    item, state = entry["item"], launched["to"]
    if state == "spec":
        if item not in facts:
            return None, []
        blobs = facts[item]["gate_blobs"]
        if entry["type"] != "feature" and not blobs:
            return "build", []
        moved = state_row(now, item, "spec", "awaiting-gate",
                          f"spec run {launched['run_id']} completed")
        files = (f"the gate files are {', '.join(sorted(blobs))}" if blobs
                 else "the item branch changes no gate file")
        ceiling = item_view(rows, item)["steps"]["build"]["ceiling_usd"]
        unchecked = facts[item]["unchecked"]
        asked, problems = ask_row(
            rows + [moved], now, item, "gate", _gate_question(
                entry, ceiling, unchecked), GATE_OPTIONS, "approve",
            f"the spec step completed; {files}", gate_blobs=blobs,
            build_usd=_build_usd(ceiling, unchecked))
        return None, ([moved, asked] if not problems else [])
    if state == "build":
        if entry["type"] == "order":
            return "verify", []
        if item not in facts:
            return None, []
        return ("build" if facts[item]["unchecked"] else "verify"), []
    if state == "ship":
        if "gate_blobs" not in facts.get(item, {}):
            return None, []
        reading, _ = consent.cover(rows, item, facts[item]["gate_blobs"],
                                   policy)
        if reading != consent.OWED:
            return ("merge" if reading == consent.COVERED else None), []
        standing = facts[item].get("standing")
        if standing is not None and not standing["problems"]:
            return "merge", [consent.consent_row(
                now, item, standing["labels"], standing["policy"])]
        return None, []
    return {"verify": "review"}.get(state), []


def _in_flight(rows, now, entry, launched, alive):
    """(True when the launched step's runner is still running, stall
    rows when it has died or idled)."""
    pid = launched["pid"]
    if not alive(pid):
        reason = f"its runner (pid {pid}) is gone with no finishing run row"
    else:
        limit = 2 * WALL_CLOCK_MINUTES[entry["size"]]
        idle = (now - parsed_at(launched["at"])).total_seconds() / 60
        if idle <= limit:
            return True, []
        reason = f"no state change for over {limit} minutes"
    written, _ = stall_rows(rows, now, entry, reason, "runner-lost",
                            "retry", IDLE_WHY)
    return False, written


def _merge_gone(rows, now, entry, merging, alive):
    """Stall rows for a merge turn whose process is gone with no merged
    row (an interrupted turn), else []. A stall from `merging` resumes
    as a merge after a retry answer."""
    pid = merging.get("pid")
    if pid is None or alive(pid):
        return []
    written, _ = stall_rows(
        rows, now, entry, f"its merge turn (pid {pid}) is gone with no"
        " merged row", "runner-lost", "retry", IDLE_WHY)
    return written


def _candidate(rows, now, entry, alive, facts, policy):
    """(ready step or None, in flight?, rows to write) for one item."""
    found = item_view(rows, entry["item"])
    state, launched = found["state"], found["last"]
    if state in TERMINAL:
        return None, False, []
    if state == "merging":
        return None, False, _merge_gone(rows, now, entry, launched, alive)
    if state == "stalled":
        if found["retry"]:
            # A merge turn that stalled resumes as a merge, not a step.
            resume = launched["from"]
            return ("merge" if resume == "merging" else resume), False, []
        return None, False, []
    if found["pending"] is not None:
        return None, False, []
    if state == "planned":
        return entry["steps"][0]["step"], False, []
    if state == "reviewed":
        return "ship", False, []
    if state == "awaiting-gate":
        opened = found["gate"]
        return ("build" if opened and opened["choice"] == "approve"
                else None), False, []
    if "run_id" not in launched:
        return state, False, []
    if found["in_flight"]:
        flying, written = _in_flight(rows, now, entry, launched, alive)
        return None, flying, written
    if not found["completed"]:
        return None, False, []
    ready, written = _after_step(rows, now, entry, launched, facts,
                                 policy)
    return ready, False, written


def survey(rows, now, wip_cap, alive, facts, policy=None):
    """(ready steps, rows to write, problems): PURE over the ledger's
    rows. Ready steps are [{"item", "step"}] in plan order, at most
    wip_cap minus the runs in flight, and none while dispatch is held.
    Rows to write are new stall and gate asks with their state moves,
    and the batch pause after FAILURE_PAUSE consecutive failed runs.
    `facts` maps an item to its branch facts (gate_blobs, unchecked);
    `policy` is the resolved standing-consent policy (None: off)."""
    plan = view(rows)["plan"]
    if plan is None:
        return None, None, ["cd: the batch ledger has no plan row"]
    writes, candidates, flying = [], [], 0
    for entry in plan["items"]:
        ready, in_flight, written = _candidate(rows + writes, now, entry,
                                               alive, facts, policy)
        writes += written
        flying += in_flight
        if ready is not None:
            candidates.append({"item": entry["item"], "step": ready})
    if _failure_streak(rows) >= FAILURE_PAUSE and not held(rows):
        asked, _ = ask_row(
            rows + writes, now, None, "stall",
            f"Three consecutive Worker runs failed in batch {plan['batch']}."
            " Resume dispatch, or stop?", PAUSE_OPTIONS, "stop",
            "three failures in a row point at the batch or the harness more"
            " than at any one item")
        writes.append(asked)
    if held(rows + writes):
        return [], writes, []
    return candidates[:max(0, wip_cap - flying)], writes, []


# --- branch facts, read through the git port ---------------------------

def _git(git, args, what):
    try:
        return git(args).stdout, []
    except CLI_FAILURES as err:
        return None, [f"cd: git {what} failed: {detail(err)}"]


def changed_files(git, branch):
    out, problems = _git(git, ["diff", "--name-only",
                               f"origin/main...{branch}"],
                         f"diff for {branch}")
    return (None, problems) if problems else (out.split(), [])


def gate_blobs(git, branch):
    """({gate path: blob id}, problems) for the gate files the item
    branch changes against origin/main."""
    changed, problems = changed_files(git, branch)
    if problems:
        return None, problems
    gates = [path for path in changed if GATE_PATH.fullmatch(path)]
    if not gates:
        return {}, []
    out, problems = _git(git, ["ls-tree", branch, "--", *gates],
                         f"ls-tree for {branch}")
    if problems:
        return None, problems
    blobs = {}
    for line in out.splitlines():
        meta, _, path = line.partition("\t")
        blobs[path] = meta.split()[2]
    return blobs, []


def unchecked_rows(git, branch):
    """(unchecked top-level breakdown rows, problems) from the
    breakdown.md or defect.md the item branch changes."""
    changed, problems = changed_files(git, branch)
    if problems:
        return None, problems
    rows = []
    for path in changed:
        if not path.endswith(("/breakdown.md", "/defect.md")):
            continue
        out, problems = _git(git, ["show", f"{branch}:{path}"],
                             f"show {branch}:{path}")
        if problems:
            return None, problems
        rows += [line for line in out.splitlines()
                 if UNCHECKED_ROW.fullmatch(line)]
    return rows, []


def branch_facts(git, batch, items):
    """({item: {"gate_blobs", "unchecked"}}, problems) for these items."""
    facts = {}
    for item in items:
        branch = item_branch(batch, item)
        blobs, problems = gate_blobs(git, branch)
        if problems:
            return None, problems
        rows, problems = unchecked_rows(git, branch)
        if problems:
            return None, problems
        facts[item] = {"gate_blobs": blobs, "unchecked": len(rows)}
    return facts, []


def pid_alive(pid):
    """True while a process with this pid exists (signal 0 probes)."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def shipped_facts(git, batch, rows):
    """({item: {"gate_blobs"}}, problems) for the shipped items, which
    conductor_consent.cover reads (issue #734)."""
    facts = {}
    for item in _shipped(rows):
        blobs, problems = gate_blobs(git, item_branch(batch, item))
        if problems:
            return None, problems
        facts[item] = {"gate_blobs": blobs}
    return facts, []


def standing_facts(gh, rows, facts, policy):
    """({item: {"problems", "labels", "policy"}}, problems): the standing
    policy's verdict on each item it may cover (ADR-0086), from the item
    branch's gate files in `facts` and, under a tier list, its issue's
    labels. Empty while the policy is off."""
    verdicts = {}
    for item in standing_due(rows, facts, policy) if policy["enabled"] \
            else []:
        labels, problems = consent.issue_labels(gh, item, policy)
        if problems:
            return None, problems
        verdicts[item] = {"problems": consent.standing_problems(
            item, facts[item]["gate_blobs"], labels, policy),
            "labels": labels, "policy": policy}
    return verdicts, []


def advance(root, batch, now, wip_cap, alive, git, gh=None, policy=None):
    """(result, problems): `next`. Reads branch facts for finished steps
    and the standing policy's facts for shipped items, then surveys and
    writes new asks and consent rows under the ledger lock."""
    rows, problems = load(root, batch)
    if problems:
        return None, problems
    policy = policy or {"enabled": False}
    facts, problems = branch_facts(git, batch, needs_facts(rows))
    if problems:
        return None, problems
    shipped, problems = shipped_facts(git, batch, rows)
    if problems:
        return None, problems
    facts.update(shipped)
    standing, problems = standing_facts(gh, rows, facts, policy)
    if problems:
        return None, problems
    for item, verdict in standing.items():
        facts.setdefault(item, {})["standing"] = verdict
    outcome = {}

    def build(rows):
        ready, writes, problems = survey(rows, now, wip_cap, alive, facts,
                                         policy)
        outcome.update(ready=ready, writes=writes or [], rows=rows)
        return writes, problems
    _, problems = append(root, batch, build)
    if problems:
        return None, problems
    recorded = [row["id"] for row in outcome["writes"]
                if row["kind"] == "ask"]
    after = outcome["rows"] + outcome["writes"]
    return {"ask": next_ask(after), "ready": outcome["ready"],
            "recorded": recorded,
            "merge_due": merge_due(after, facts, policy)}, []


def next_cli(root, batch, args, now, git, alive, gh=None):
    if args:
        return None
    config, problems = factory_config.load(root)
    if problems:
        return problems
    wip = config.get("wip_cap")
    if isinstance(wip, bool) or not isinstance(wip, int) or wip < 1:
        return ["cd: factory.json wip_cap must be a positive integer"]
    policy, problems = factory_config.resolve_standing_consent(config)
    if problems:
        return problems
    result, problems = advance(root, batch, now, wip, alive or pid_alive,
                               git, gh, policy)
    if result is not None:
        print(json.dumps(result, indent=2))
    return problems
