#!/usr/bin/env python3
"""conductor: the Conductor's batch tool (PRD-0013) and the batch
ledger's one owner.

The `conduct` skill's compute half, in work_queue.py's conventions: pure
functions with every input passed in, a thin main, cd:-prefixed problem
strings, cli.report for the exit. Mirrored into the factory payload with
its siblings (factory_init.MIRRORS, #678). Capabilities that would push this
file past the 800-line ceiling live in sibling modules that import its
row grammar (breakdown assumption 6): conductor_plan (plan, open),
conductor_flow (the item state machine and the stall rule in next),
conductor_run (the Worker runner), conductor_merge (the merge
precondition and the merge turn), conductor_close (the scorecard and
closing a batch) and conductor_calibrate (calibrate).

  python3 conductor.py plan [--agents DIR] <#N>...
        Price and order a batch of issues and show each item's reserved
        number block. Writes nothing. --agents names the charter stub
        directory (default factory/agents/, which a consumer repo lacks).
  python3 conductor.py open <batch> [--agents DIR] <#N>...
        Plan, check what every `run` will need (factory.json, the cost
        ledger on origin/main, no push gap), then create the
        conductor/<batch> branch and worktree from origin/main, write the
        plan and reserve rows, and queue the spend ask.
  python3 conductor.py next <batch>
        Record any new stall and gate asks, then print as JSON the oldest
        unanswered ask, the steps ready to launch under wip_cap (a
        `merge` step once an answer covers a shipped item), the ids of
        the asks just recorded, and the shipped items waiting for a
        merge ask ({"ask", "ready", "recorded", "merge_due"}).
  python3 conductor.py run <batch> <#N> <step>
        One metered headless Worker run of the item's step in its own
        worktree (conductor/<batch>-<n>): launch row, brief, harness, spend
        row, push, PR, run row; any failure queues a stall ask, and a
        launch refusal no retry fixes pauses dispatch behind an ask.
  python3 conductor.py merge <batch> <#N>
        One merge turn, refused unless the item is reviewed with a pass
        from a distinct reviewer and an answer covers it: merge
        origin/main in, resolve only the manifest (a conflict in
        docs/factory/costs.jsonl aborts; item spend is a per-run file),
        bump the plugin patch version for a skills/ change (both in this
        plugin's repo only), confirm the item's reserved numbers, run
        the gate command, push (never forced), wait
        for the head's checks, then squash-merge or enqueue. Any other
        outcome queues a stall ask.
  python3 conductor.py scorecard <batch>
        Print the batch's scorecard row as JSON, computed from its ledger
        and the cost ledger (the aggregate plus each per-run file);
        appends nothing. A malformed
        ledger line, a run with no spend row or a missing plan row fails
        with a problem and no number.
  python3 conductor.py calibrate
        Join every closed batch's ledger with docs/factory/costs.jsonl
        into one actuals row per run, and print as JSON the suggested
        step weights and size budgets with their sample sizes; below
        the floor it suggests nothing. Writes nothing (#799).
  python3 conductor.py scorecards [N]
        Print each metric of the last N (default 5) scorecards in
        docs/factory/scorecards.jsonl, oldest first, with its change
        from the batch before; appends nothing.
  python3 conductor.py close <batch>
        Once every item is merged or blocked: merge origin/main into
        conductor/<batch>, carry blocked items' spend rows over, append
        the scorecard to docs/factory/scorecards.jsonl only when it
        computes, write the close row and the closing merge ask, commit,
        push (never forced), open the closing PR, and label each blocked
        item's issue needs-human with its reason, creating the label
        when the repo lacks it.
  python3 conductor.py close <batch> --merge
        Once the Owner answered the closing ask `merge`: commit and push
        the answer row to conductor/<batch>, so the merged ledger holds
        it, wait for that head's checks, then squash-merge or enqueue
        the closing PR.
  python3 conductor.py ask <batch> --kind K --question Q --option O
                           [--option O ...] --recommended O --why W
                           [--item #N] [--covers #N ...]
        Append an ask row with a fresh id and print the id.
  python3 conductor.py answer <batch> <ask-id> <choice> [--note TEXT]
        Append the Owner's answer row. Written only straight after the
        Owner picks that option in this session; refused for any call
        with CONDUCTOR_WORKER set.

The batch ledger (docs/factory/batches/<batch>/ledger.jsonl) is
append-only JSONL. Every row has `at`, `kind` and `item`; ROW_FIELDS
holds each kind's own fields. A line that does not parse, or breaks its
kind's rules, fails the reader with its file and line: it is never
skipped, because "could not read" must not read as "nothing to do". A
`consent` row is standing consent (ADR-0086): written only by `next`,
under factory.json's opt-in policy, and never an answer.

In a stamped consumer repo the same tools run from tools/factory/
(factory-init's payload, #678): the gate is factory.json's
conductor.gate_command (default `make check`), and the plugin-version
bump and the manifest regeneration happen only in this plugin's repo.
"""
import fcntl
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Before any sibling import (#726): a run must never dirty its own
# worktree with bytecode. A repo that once tracked tools/factory/
# __pycache__ saw every run rewrite it, and close's merge of main
# refused. The .gitignore the payload ships covers the untracked case.
sys.dont_write_bytecode = True

import factory_config  # noqa: E402
from cli import gh_runner, report, runner  # noqa: E402
from cost_ledger import ISSUE_KEY
from knowledge_plane import repo_root

# The Batch's names (#735): every ref, path and run id a batch makes is
# formed here and nowhere else. An item's name is its batch's name plus
# -<n>, and a batch name never ends in -<digits>, so no item's branch or
# worktree is ever another batch's (item #2 of `oct` is not batch
# `oct-2`). A run id is parsed from the right, so a batch whose name
# extends another's (`oct-2-x`) never claims that batch's runs.
BATCH_NAME = re.compile(r"(?![a-z0-9-]*-\d+$)[a-z0-9][a-z0-9-]*")
WORKTREES = ".claude/worktrees"
BATCH_DIR = "docs/factory/batches/{batch}"
LEDGER = BATCH_DIR + "/ledger.jsonl"
RUNS = BATCH_DIR + "/runs"
RUN_ID = re.compile(r"conductor-(?P<batch>.+)-(?P<n>\d+)-[a-z]+-\d+")
AT = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")
AT_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
WORKER_ENV = "CONDUCTOR_WORKER"

# kind -> (required fields, optional fields), beyond at/kind/item: the
# architecture's batch-ledger table. An ask's own kind is `ask_kind`,
# since the row's `kind` is already "ask".
ROW_FIELDS = {
    "plan": (("batch", "items", "policy", "estimate_usd",
              "month_to_date_usd", "cap_usd"), ()),
    "reserve": (("what", "values"), ("renumbered_from",)),
    "state": (("from", "to", "reason"),
              ("verdict", "author_runs", "reviewer_run", "reviewed_head",
               "pr", "sha", "checks", "run_id", "pid", "cause")),
    "run": (("step", "charter", "band", "model", "models_reported",
             "effort", "run_id", "pid", "outcome"), ()),
    "ask": (("id", "ask_kind", "question", "options", "recommended",
             "why"), ("covers", "gate_blobs", "build_usd")),
    "answer": (("ask", "choice", "note"), ()),
    # Standing consent (ADR-0086): the merge consent factory.json's
    # policy grants an item `next` found it covers. Not an answer: the
    # scorecard's Owner-touch figures never count it.
    "consent": (("policy", "reason"), ()),
    "close": (("merged", "blocked"), ()),
}
COMMON_FIELDS = ("at", "kind", "item")
# A state row into these states carries the fields that prove it.
STATE_FIELDS = {"reviewed": ("author_runs", "reviewer_run", "verdict"),
                "merged": ("checks", "pr", "sha")}
ASK_KINDS = ("spend", "gate", "merge", "stall", "clarify")
# Why an item stalled or blocked (#819): a state row into either may
# carry one, so the scorecard counts causes, not reasons. A block that
# ends a stall carries the stall's; owner-block blocks an unstalled item.
CAUSES = ("ceiling", "timeout", "agent-failed", "delivery-failed",
          "runner-lost", "changes-again", "merge-drift", "merge-failed",
          "owner-block", "setup-failed")
TERMINAL = ("merged", "blocked")
# An answer with this choice blocks the ask's item (Owner, 2026-10-10):
# the one path into `blocked`.
BLOCK = "block"
# The one consent policy a `consent` row may name (ADR-0086).
STANDING = "standing"
# A run row's outcome when its step finished cleanly.
COMPLETED = "completed"
# The stall answers that resume an item's stalled step.
RETRIES = ("retry", "retry-up")


def batch_name_problems(batch):
    """The batch name lands in refs and paths: anything but a slug that
    no item name can equal is refused before it is used."""
    if isinstance(batch, str) and BATCH_NAME.fullmatch(batch):
        return []
    return [f"cd: batch {batch!r} is not a batch name (lowercase letters,"
            " digits and hyphens, never ending in -<digits>, which names"
            " an item)"]


def _item_name(batch, item):
    return f"{batch}-{item[1:]}"


def batch_dir(batch):
    return BATCH_DIR.format(batch=batch)


def batch_branch(batch):
    return f"conductor/{batch}"


def item_branch(batch, item):
    """The item's branch (Owner, 2026-10-10): conductor/<batch>-<n>."""
    return f"conductor/{_item_name(batch, item)}"


def batch_worktree(batch):
    """Relative to the main checkout."""
    return f"{WORKTREES}/conductor-{batch}"


def item_worktree(batch, item):
    """Relative to the main checkout."""
    return f"{WORKTREES}/conductor-{_item_name(batch, item)}"


def run_id(batch, item, step, seq):
    return f"conductor-{_item_name(batch, item)}-{step}-{seq}"


def run_item(batch, run):
    """The item key of one of this batch's run ids, else None."""
    found = RUN_ID.fullmatch(run)
    if found is None or found["batch"] != batch:
        return None
    return f"#{found['n']}"


def is_text(value):
    return isinstance(value, str) and bool(value.strip())


def _ask_problems(row):
    problems = []
    if row.get("ask_kind") not in ASK_KINDS:
        problems.append(f"ask_kind {row.get('ask_kind')!r} is not one of"
                        f" {', '.join(ASK_KINDS)}")
    options = row.get("options")
    if not (isinstance(options, list) and options
            and all(is_text(option) for option in options)
            and len(set(options)) == len(options)):
        problems.append("options must be a non-empty list of distinct"
                        " non-empty strings")
    elif row.get("recommended") not in options:
        problems.append(f"recommended {row.get('recommended')!r} is not"
                        " among the options")
    problems += [f"{field} must be a non-empty string"
                 for field in ("question", "why") if not is_text(row[field])]
    return problems + _consent_problems(row)


def _consent_problems(row):
    """The optional fields that grant consent (review minor 3): a train's
    `covers` is matched with `in`, so a string there would cover every
    key it contains; read fail-closed, never coerced."""
    problems = []
    covers = row.get("covers")
    if "covers" in row and not (
            isinstance(covers, list) and covers
            and all(isinstance(key, str) and ISSUE_KEY.fullmatch(key)
                    for key in covers)
            and len(set(covers)) == len(covers)):
        problems.append("covers must be a non-empty list of distinct issue"
                        " keys")
    blobs = row.get("gate_blobs", {})
    if not (isinstance(blobs, dict) and all(
            is_text(path) and is_text(blob)
            for path, blob in blobs.items())):
        problems.append("gate_blobs must map file paths to blob ids")
    return problems


def _answer_problems(row):
    problems = [f"{field} must be a non-empty string"
                for field in ("ask", "choice") if not is_text(row[field])]
    if not isinstance(row["note"], str):
        problems.append("note must be a string")
    return problems


def _consent_row_problems(row):
    problems = []
    if row["item"] is None:
        problems.append("a consent row names its item")
    if row["policy"] != STANDING:
        problems.append(f"consent policy {row['policy']!r} is not"
                        f" {STANDING}")
    if not is_text(row["reason"]):
        problems.append("reason must be a non-empty string")
    return problems


def _cause_problems(row):
    if row["to"] not in ("stalled", "blocked"):
        return ["cause is only for a state row to stalled or blocked"]
    if row["cause"] not in CAUSES:
        return [f"cause {row['cause']!r} is not one of {', '.join(CAUSES)}"]
    return []


def _at_problems(value):
    valid = isinstance(value, str) and AT.fullmatch(value)
    if valid:
        try:
            datetime.strptime(value, AT_FORMAT)
        except ValueError:
            valid = False
    if valid:
        return []
    return [f"at {value!r} is not a UTC timestamp (YYYY-MM-DDTHH:MM:SSZ)"]


def row_problems(row):
    """Unlocated problems for one parsed ledger row: its kind, its field
    set, then its kind's value rules. The one rule every reader and
    writer of the ledger applies."""
    kind = row.get("kind")
    if kind not in ROW_FIELDS:
        return [f"kind {kind!r} is not a batch ledger row kind"]
    required, optional = ROW_FIELDS[kind]
    problems = []
    missing = sorted(set(COMMON_FIELDS + required) - set(row))
    if missing:
        problems.append(f"{kind} row is missing field(s):"
                        f" {', '.join(missing)}")
    unknown = sorted(set(row) - set(COMMON_FIELDS + required + optional))
    if unknown:
        problems.append(f"{kind} row has unknown field(s):"
                        f" {', '.join(unknown)}")
    if missing:
        return problems
    problems += _at_problems(row["at"])
    item = row["item"]
    if item is not None and not (isinstance(item, str)
                                 and ISSUE_KEY.fullmatch(item)):
        problems.append(f"item {item!r} is not an issue key (#<n>) or null")
    if kind == "state" and row["to"] in STATE_FIELDS:
        absent = [field for field in STATE_FIELDS[row["to"]]
                  if field not in row]
        if absent:
            problems.append(f"state row to {row['to']} is missing"
                            f" field(s): {', '.join(absent)}")
    if kind == "state" and "cause" in row:
        problems += _cause_problems(row)
    if kind == "ask":
        problems += _ask_problems(row)
    if kind == "answer":
        problems += _answer_problems(row)
    if kind == "consent":
        problems += _consent_row_problems(row)
    return problems


def numbered(text):
    """[(lineno, line)] for every non-blank line: the lines parse reads,
    so the nth row parse returns sits on the nth lineno here."""
    return [(lineno, line) for lineno, line in
            enumerate(text.splitlines(), 1) if line.strip()]


def parse(text, shown):
    """(rows, problems) for a ledger's text: every non-blank line parsed
    and checked, problems located as `cd: <shown>:<lineno> <suffix>`.
    Rows are None when any line has a problem: the reader fails, it never
    skips a line."""
    rows, problems = [], []
    for lineno, line in numbered(text):
        try:
            row = json.loads(line)
        except (ValueError, RecursionError) as err:
            problems.append(f"cd: {shown}:{lineno} is not valid JSON: {err}")
            continue
        if not isinstance(row, dict):
            problems.append(f"cd: {shown}:{lineno} is not a JSON object")
            continue
        problems += [f"cd: {shown}:{lineno} {suffix}"
                     for suffix in row_problems(row)]
        rows.append(row)
    return (None, problems) if problems else (rows, [])


def _ledger(root, batch):
    """(path, shown, problems) for a batch's ledger. The batch name lands
    in a path, so anything but a slug is refused before it is used."""
    problems = batch_name_problems(batch)
    if problems:
        return None, None, problems
    shown = LEDGER.format(batch=batch)
    path = Path(root) / shown
    if not path.is_file():
        return None, shown, [f"cd: no batch ledger at {shown}"]
    return path, shown, []


def _read_locked(handle, shown):
    handle.seek(0)
    try:
        text = handle.read()
    except UnicodeDecodeError as err:
        return None, [f"cd: cannot read {shown}: {err}"]
    return parse(text, shown)


def read_text(root, batch):
    """(text, shown, problems): the batch ledger's text, read under a
    shared lock so a concurrent append is never seen half written."""
    path, shown, problems = _ledger(root, batch)
    if problems:
        return None, shown, problems
    try:
        with open(path, encoding="utf-8") as handle:
            fcntl.flock(handle, fcntl.LOCK_SH)
            return handle.read(), shown, []
    except (OSError, UnicodeDecodeError) as err:
        return None, shown, [f"cd: cannot read {shown}: {err}"]


def load(root, batch):
    """(rows, problems): every row of the batch's ledger, in order. rows
    is None on any problem."""
    text, shown, problems = read_text(root, batch)
    if problems:
        return None, problems
    return parse(text, shown)


def append(root, batch, build):
    """(row, problems): build the next row from the ledger's current rows
    and append it, holding an exclusive lock across the read and the
    write so concurrent runners serialise. build(rows) returns (row,
    problems), where row may be a list of rows written together under
    the one lock; a row that breaks the grammar is refused, and nothing
    is written on any problem. Never creates a ledger: `open` does."""
    path, shown, problems = _ledger(root, batch)
    if problems:
        return None, problems
    try:
        with open(path, "a+", encoding="utf-8") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            rows, problems = _read_locked(handle, shown)
            if problems:
                return None, problems
            row, problems = build(rows)
            if problems:
                return None, problems
            handle.seek(0, os.SEEK_END)
            written = row if isinstance(row, list) else [row]
            handle.write("".join(json.dumps(one) + "\n"
                                 for one in written))
            return row, []
    except OSError as err:
        return None, [f"cd: cannot write {shown}: {err}"]


def stamp(now):
    return now.astimezone(timezone.utc).strftime(AT_FORMAT)


def parsed_at(value):
    """stamp's inverse: a row's `at` as an aware UTC datetime."""
    return datetime.strptime(value, AT_FORMAT).replace(tzinfo=timezone.utc)


# --- the item view: the ledger's one reading interface (#694) ------------

# The item kinds an item view groups, each a tuple in ledger order.
_ITEM_KINDS = {"state": "states", "run": "runs", "ask": "asks",
               "reserve": "reserves"}


def _latest(answered, asks, ask_kind, after):
    """The latest-placed answer to one of `asks` of this kind written
    after ledger position `after`, or None. `answered` maps an ask id to
    (position, answer row)."""
    found = [answered[ask["id"]] for ask in asks
             if ask["ask_kind"] == ask_kind and ask["id"] in answered
             and answered[ask["id"]][0] > after]
    return max(found, key=lambda pair: pair[0])[1] if found else None


def _live_block(reserves):
    """{what: sorted numbers}: every reserve row's values unioned, less
    the ones a renumber row moved away (renumbered_from)."""
    held, moved = {}, {}
    for row in reserves:
        held.setdefault(row["what"], set()).update(row["values"])
        moved.setdefault(row["what"], set()).update(
            row.get("renumbered_from", []))
    live = {what: tuple(sorted(values - moved[what]))
            for what, values in held.items()}
    return {what: values for what, values in live.items() if values}


def _steps(entry, policy, last, resumed):
    """{step: {charter, band, model, effort, ceiling_usd, bumped}}: the
    policy each of the plan entry's steps runs under — the plan row's
    snapshot, and the step a retry-up answer resumed one band up, its
    model and effort re-resolved through the plan row's `policy` (the
    top band has none above it)."""
    bands = factory_config.BANDS
    up = last["from"] if resumed is not None \
        and resumed["choice"] == "retry-up" else None
    steps = {}
    for planned in entry["steps"] if entry is not None else ():
        band = planned["band"]
        bumped = planned["step"] == up and band in bands[:-1]
        if bumped:
            band = bands[bands.index(band) + 1]
        steps[planned["step"]] = {
            "charter": planned["charter"], "band": band,
            "model": (factory_config.resolve_model(band, policy)[0]
                      if bumped else planned["model"]),
            "effort": (factory_config.resolve_effort(band, policy)[0]
                       if bumped else planned["effort"]),
            "ceiling_usd": planned["ceiling_usd"], "bumped": bumped}
    return steps


def _item(item, entry, grouped, answered, policy):
    """One item's read-only view from its rows, grouped as
    {field: ((position, row), ...)}, under the plan row's `policy`."""
    states = grouped.get("states", ())
    rows_of = {field: tuple(row for _, row in grouped.get(field, ()))
               for field in _ITEM_KINDS.values()}
    position, last = states[-1] if states else (-1, None)
    asks, runs = rows_of["asks"], rows_of["runs"]
    pending = next((ask for ask in asks if ask["id"] not in answered),
                   None)
    run_id = (last or {}).get("run_id")
    finishing = next((row for row in runs if row["run_id"] == run_id),
                     None) if run_id else None
    stalled = last is not None and last["to"] == "stalled"
    resumed = _latest(answered, asks, "stall", position) if stalled \
        else None
    return {
        "item": item, "entry": entry,
        "unknown": (None if entry is not None
                    else f"cd: {item} is not an item of this batch's plan"),
        "state": last["to"] if last else "planned", "last": last,
        "states": rows_of["states"], "runs": runs, "asks": asks,
        "pending": pending, "finishing": finishing,
        "in_flight": run_id is not None and finishing is None,
        "completed": finishing is not None
        and finishing["outcome"] == COMPLETED,
        "resumed": resumed,
        "retry": pending is None and resumed is not None
        and resumed["choice"] in RETRIES,
        "gate": _latest(answered, asks, "gate", -1),
        "author_runs": tuple(row["run_id"] for row in runs
                             if row["step"] != "review"),
        "reserved": _live_block(rows_of["reserves"]),
        "steps": _steps(entry, policy, last, resumed)}


def view(rows):
    """The batch ledger read once, as plain read-only data: {"plan" (the
    plan row or None), "answers" ({ask id: its answer row}), "next_ask"
    (the oldest unanswered ask row or None), "items" ({item: its item
    view})}. Ordering is by ledger position, recorded here once; `rows`
    is never changed. An item view holds the item's plan `entry` (None,
    with the ready-made `unknown` problem, off the plan), its `state`,
    `last` state row and `states`, `runs`, `asks`, `pending` ask, the
    `finishing` run of its last launch, `in_flight`, `completed`, the
    stall answer that `resumed` it, `retry`, its latest `gate` answer,
    its `author_runs`, its live `reserved` block and the policy each of
    its `steps` runs under ({step: {charter, band, model, effort,
    ceiling_usd, bumped}}, retry-up's one-band bump applied; a step off
    the plan is absent)."""
    plan, answered, grouped = None, {}, {}
    for position, row in enumerate(rows):
        kind = row["kind"]
        if kind == "plan" and plan is None:
            plan = row
        elif kind == "answer":
            answered[row["ask"]] = (position, row)
        if row["item"] is not None and kind in _ITEM_KINDS:
            grouped.setdefault(row["item"], {}).setdefault(
                _ITEM_KINDS[kind], []).append((position, row))
    entries = {entry["item"]: entry for entry in (plan or {}).get("items",
                                                                   [])}
    policy = (plan or {}).get("policy", {})
    items = {item: _item(item, entries.get(item), grouped.get(item, {}),
                         answered, policy)
             for item in [*entries, *(i for i in grouped
                                      if i not in entries)]}
    asks = (row for row in rows if row["kind"] == "ask")
    return {"plan": plan,
            "answers": {ask: row for ask, (_, row) in answered.items()},
            "next_ask": next((row for row in asks
                              if row["id"] not in answered), None),
            "items": items}


def item_view(rows, item):
    """One item's view (see view): an item with no rows and off the plan
    reads as `planned`, with `unknown` set."""
    found = view(rows)["items"].get(item)
    return found if found is not None else _item(item, None, {}, {}, {})


def answers(rows):
    """{ask id: its answer row}."""
    return view(rows)["answers"]


def current_state(rows, item):
    """The item's state: its last state row's `to`, else `planned`."""
    return item_view(rows, item)["state"]


def next_ask(rows):
    """The oldest unanswered ask row, or None: the decision queue shows
    one question at a time."""
    return view(rows)["next_ask"]


def ask_row(rows, now, item, ask_kind, question, options, recommended,
            why, covers=None, gate_blobs=None, build_usd=None):
    """(row, problems): an ask row with a fresh id (ask-<n>, one past the
    ask count of `rows`, which include any rows about to be written with
    it), checked against the grammar."""
    count = sum(1 for row in rows if row["kind"] == "ask")
    row = {"at": stamp(now), "kind": "ask", "item": item,
           "id": f"ask-{count + 1}", "ask_kind": ask_kind,
           "question": question, "options": list(options),
           "recommended": recommended, "why": why}
    if covers:
        row["covers"] = list(covers)
    if gate_blobs is not None:
        row["gate_blobs"] = dict(gate_blobs)
    if build_usd is not None:
        row["build_usd"] = build_usd
    return row, [f"cd: ask refused: {problem}"
                 for problem in row_problems(row)]


def ask(root, batch, now, item, ask_kind, question, options, recommended,
        why, covers=None):
    """(row, problems): append an ask row with a fresh id."""
    return append(root, batch, lambda rows: ask_row(
        rows, now, item, ask_kind, question, options, recommended, why,
        covers=covers))


def answer(root, batch, now, ask_id, choice, note, env):
    """(row, problems): append the Owner's answer to one ask. Refused for
    an unknown ask, an answered ask, a choice outside its options, and
    any call made with CONDUCTOR_WORKER set. That flag stops a confused
    Worker, not a hostile one; the trigger to harden it is an answer row
    whose timing matches no Owner turn. A `block` answer to an item's
    ask also writes the item's `blocked` state row under the same lock:
    the only way into `blocked`."""
    if env.get(WORKER_ENV):
        return None, [f"cd: answer refused: {WORKER_ENV} is set, and a"
                      " Worker never answers an ask"]

    def build(rows):
        asked = next((row for row in rows if row["kind"] == "ask"
                      and row["id"] == ask_id), None)
        if asked is None:
            return None, [f"cd: no ask {ask_id} in this batch"]
        given = answers(rows).get(ask_id)
        if given is not None:
            return None, [f"cd: ask {ask_id} is already answered"
                          f" ({given['choice']!r})"]
        if choice not in asked["options"]:
            return None, [f"cd: {choice!r} is not an option of ask"
                          f" {ask_id} ({', '.join(asked['options'])})"]
        row = {"at": stamp(now), "kind": "answer", "item": asked["item"],
               "ask": ask_id, "choice": choice, "note": note}
        state = current_state(rows, asked["item"])
        if choice != BLOCK or asked["item"] is None or state in TERMINAL:
            return row, []
        reason = f"answer to {ask_id}: {BLOCK}" + (f" ({note})" if note
                                                    else "")
        last = item_view(rows, asked["item"])["last"]
        cause = ({"cause": "owner-block"} if state != "stalled"
                 else {"cause": last["cause"]} if "cause" in last else {})
        return [row, {"at": row["at"], "kind": "state",
                      "item": asked["item"], "from": state,
                      "to": "blocked", "reason": reason, **cause}], []
    written, problems = append(root, batch, build)
    if isinstance(written, list):
        written = written[0]
    return written, problems


def _flags(args, repeatable):
    """{flag: value or [values]} for `--flag value` pairs, or None when
    the args are not such pairs."""
    if len(args) % 2:
        return None
    flags = {}
    for flag, value in zip(args[::2], args[1::2]):
        if not flag.startswith("--"):
            return None
        if flag in repeatable:
            flags.setdefault(flag, []).append(value)
        elif flag in flags:
            return None
        else:
            flags[flag] = value
    return flags


def _ask_cli(root, batch, args, now):
    flags = _flags(args, ("--option", "--covers"))
    needed = ("--kind", "--question", "--option", "--recommended", "--why")
    if flags is None or any(flag not in flags for flag in needed) or set(
            flags) - set(needed) - {"--item", "--covers"}:
        return None
    row, problems = ask(root, batch, now, flags.get("--item"),
                        flags["--kind"], flags["--question"],
                        flags["--option"], flags["--recommended"],
                        flags["--why"], covers=flags.get("--covers"))
    if row is not None:
        print(row["id"])
    return problems


def _answer_cli(root, batch, args, now, env):
    if len(args) < 2:
        return None
    flags = _flags(args[2:], ())
    if flags is None or set(flags) - {"--note"}:
        return None
    _, problems = answer(root, batch, now, args[0], args[1],
                         flags.get("--note", ""), env)
    return problems


# Every git call the Conductor makes itself skips the repo's hooks (#833):
# it commits only generated evidence (ledger, spend rows, scorecards, a
# merge of a checked main, a mechanical renumber), and land_branch waits
# for green CI on the pushed head. The Worker's item commits run in its
# harness, a separate process, and still meet the hooks.
NO_HOOKS = ("-c", f"core.hooksPath={os.devnull}")


def _skip_hooks(run):
    return lambda args, **kwargs: run([*NO_HOOKS, *args], **kwargs)


def main(argv, env=None, clock=None, root=None, run=gh_runner, git=None,
         alive=None, harness=None, tool=None, sleep=None, netrc=None):
    env = os.environ if env is None else env
    clock = clock or (lambda: datetime.now(timezone.utc))
    now = clock()
    root = root or repo_root()
    git = git or _skip_hooks(runner("git"))
    # The capability siblings import this module's row grammar, so they
    # are imported here, not at the top: one owner, no import cycle.
    import conductor_calibrate
    import conductor_close
    import conductor_flow
    import conductor_merge
    import conductor_plan
    import conductor_run
    problems = None
    if argv[:1] == ["plan"]:
        problems = conductor_plan.plan_cli(root, argv[1:], now, run, git)
    elif argv[:1] == ["calibrate"]:
        problems = conductor_calibrate.calibrate_cli(root, argv[1:])
    elif argv[:1] == ["scorecards"]:
        problems = conductor_close.scorecards_cli(root, argv[1:])
    elif argv[:1] == ["open"] and len(argv) >= 3:
        problems = conductor_plan.open_cli(root, argv[1:], now, run, git,
                                           netrc)
    elif len(argv) >= 2:
        command, batch, args = argv[0], argv[1], argv[2:]
        if command == "next" and env.get(WORKER_ENV):
            # `next` writes standing consent (ADR-0086): the same guard
            # as `answer`, which stops a confused Worker.
            problems = [f"cd: next refused: {WORKER_ENV} is set, and a"
                        " Worker never advances a batch"]
        elif command == "next":
            problems = conductor_flow.next_cli(root, batch, args, now,
                                               git, alive, run)
        elif command == "ask":
            problems = _ask_cli(root, batch, args, now)
        elif command == "answer":
            problems = _answer_cli(root, batch, args, now, env)
        elif command == "run":
            problems = conductor_run.run_cli(root, [batch, *args], clock,
                                             git, run, harness)
        elif command == "scorecard":
            problems = conductor_close.scorecard_cli(root, [batch, *args],
                                                     now)
        elif command == "close":
            problems = conductor_close.close_cli(root, [batch, *args],
                                                 clock, git, run, sleep)
        elif command == "merge":
            problems = conductor_merge.merge_cli(root, [batch, *args], clock,
                                                 git, run, tool, sleep)
    if problems is None:
        print(__doc__.strip())
        return 2
    return report("cd", problems)


if __name__ == "__main__":
    # Its children too: the gate command a merge turn runs, and the
    # Worker harness (whose env worker_env also pins).
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    sys.exit(main(sys.argv[1:]))
