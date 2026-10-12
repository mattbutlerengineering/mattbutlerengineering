#!/usr/bin/env python3
"""conductor_plan: the Conductor's `plan` and `open` (PRD-0013), split
from conductor.py by capability (breakdown assumption 6). It imports
conductor.py's row grammar and ledger writes, which keep one owner;
conductor.py's main dispatches here.
"""
import fcntl
import json
import subprocess
from pathlib import Path

import assembler
import factory_config
import work_queue
from cli import CLI_FAILURES, detail, gh_read, label_names
from conductor import BATCH_NAME, LEDGER, ask, is_text, stamp
from cost_ledger import ISSUE_KEY
from knowledge_plane import ADR_TOKEN, PRD_TOKEN, WO_TOKEN

# The policy below was accepted by the Owner on 2026-10-10 (breakdown.md
# Notes): steps per item type, the step-to-charter table, the type labels,
# and the reserved block sizes.

ITEM_STEPS = {"feature": ("spec", "build", "verify", "review", "ship"),
              "fix": ("spec", "build", "verify", "review", "ship"),
              "order": ("build", "verify", "review", "ship")}
# step -> charter, fixed here as assembler.CHARTER_BY_TYPE fixes type ->
# charter; `build` runs whatever charter the issue's type: label selects.
STEP_CHARTERS = {"spec": "architect", "verify": "qa", "review": "reviewer",
                 "ship": "qa"}
TYPE_BY_LABEL = {"type:feature": "feature", "type:defect": "fix",
                 "type:chore": "fix"}
# lean: fixed block sizes per item type. The ceiling is an item that
# needs more numbers than its block; its Worker stops and says so. The
# trigger to size blocks per item is a scorecard showing that stop fire.
BLOCK_SIZES = {"feature": {"prd": 1, "adr": 3, "wo": 10},
               "fix": {"adr": 1, "wo": 5},
               "order": {}}
ID_TOKENS = (("prd", PRD_TOKEN), ("adr", ADR_TOKEN), ("wo", WO_TOKEN))
# docs/ only: tests and fixtures carry example ids in the nine-thousands
# that no run ever used, and a block above them would leave the 4-digit
# grammar.
ID_GREP = ["grep", "-h", "-o", "-E", "(PRD|ADR|WO)-[0-9]{4}", "origin/main",
           "--", "docs"]
ISSUE_FIELDS = "number,state,author,labels"
WORKTREES = ".claude/worktrees"
SPEND_OPTIONS = ["approve", "decline"]


def ids_on_main(git):
    """({kind: set of numbers}, problems) for the PRD, ADR and WO ids on
    origin/main, through knowledge_plane's token grammars. Over-counts
    any id merely cited, which is the safe direction. grep's exit 1 is
    "no match", so every kind is empty."""
    try:
        text = git(ID_GREP).stdout
    except subprocess.CalledProcessError as err:
        if err.returncode != 1:
            return None, [f"cd: git grep origin/main failed: {detail(err)}"]
        text = ""
    except CLI_FAILURES as err:
        return None, [f"cd: git grep origin/main failed: {detail(err)}"]
    return {kind: {int(match.group(0)[-4:])
                   for match in token.finditer(text)}
            for kind, token in ID_TOKENS}, []


def ids_in_use(git):
    """({kind: highest number}, problems): ids_on_main's maxima, 0 for a
    kind with none."""
    found, problems = ids_on_main(git)
    if problems:
        return None, problems
    return {kind: max(numbers, default=0)
            for kind, numbers in found.items()}, []


def repo_owner(run):
    """(the repo owner's login, problems), failing closed."""
    result = gh_read(["repo", "view", "--json", "owner"], "gh repo view",
                     "cd", run=run, expect=dict)
    if result.problems:
        return None, result.problems
    login = (result.value.get("owner") or {}).get("login")
    if not is_text(login):
        return None, ["cd: gh repo view names no owner"]
    return login, []


def read_issues(numbers, run):
    """(issues, problems): one read per issue. Any failed or incomplete
    read refuses the whole batch: "could not ask" never reads as
    "nothing to do"."""
    issues, problems = [], []
    for number in numbers:
        operation = f"gh issue view #{number}"
        result = gh_read(["issue", "view", str(number), "--json",
                          ISSUE_FIELDS], operation, "cd", run=run,
                         expect=dict)
        if result.problems:
            problems += result.problems
            continue
        value = result.value
        if not (all(field in value for field in ISSUE_FIELDS.split(","))
                and isinstance(value["labels"], list)
                and isinstance(value["author"], dict)):
            problems.append(f"cd: {operation} returned an incomplete issue")
            continue
        issues.append(value)
    return (None, problems) if problems else (issues, [])


def _item_type(labels, type_labels):
    """(item type, reason) from the issue's labels. Without a configured
    map, the first type: label decides through TYPE_BY_LABEL. With one
    (factory.json conductor.type_labels, #700), every label it maps
    counts, and labels mapping to two different types defer: guessing
    which the Owner meant would price and step the item wrongly."""
    if type_labels is None:
        typed = [name for name in labels if name.startswith("type:")]
        if not typed:
            return None, "no type: label"
        if typed[0] not in TYPE_BY_LABEL:
            return None, f"{typed[0]} is not plannable"
        return TYPE_BY_LABEL[typed[0]], None
    return _mapped(labels, type_labels, "an item type", "type_labels")


def _mapped(labels, table, what, key):
    """(the one value the issue's mapped labels name, reason). No mapped
    label, or labels mapping to two different values, is a reason."""
    mapped = [(name, table[name]) for name in labels if name in table]
    values = {value for _, value in mapped}
    if not values:
        return None, f"no label maps to {what} (conductor.{key})"
    if len(values) > 1:
        named = ", ".join(f"{name} -> {value}" for name, value in mapped)
        noun = what.split(" ", 1)[1]
        return None, f"its labels map to more than one {noun} ({named})"
    return values.pop(), None


def _size(labels, rules):
    """(size, reason). Without a size map the first size:S|M|L label
    decides; with one (conductor.size_labels) every label it maps counts,
    and two different sizes defer. conductor.default_size applies only to
    an issue with no size label at all, never to a conflict."""
    table, default = rules.get("size_labels"), rules.get("default_size")
    if table is None:
        size = next((name[len("size:"):] for name in labels
                     if name in ("size:S", "size:M", "size:L")), default)
        return (size, None) if size else (None, "no size: label")
    if default and not any(name in table for name in labels):
        return default, None
    return _mapped(labels, table, "a size", "size_labels")


def _deferral(issue, labels, owner, rules=None):
    """(item type, size, reason): reason is None for a plannable issue.
    `rules` holds the configured label maps and default size, each
    absent when factory.json does not set it."""
    rules = rules or {}
    if (issue["state"] or "").upper() != "OPEN":
        return None, None, "closed"
    author = issue["author"].get("login")
    if author != owner:
        return None, None, (f"authored by {author}, not the repo owner"
                            f" {owner}")
    if assembler.READY_LABEL in labels:
        item_type = "order"
    else:
        item_type, reason = _item_type(labels, rules.get("type_labels"))
        if reason is not None:
            return None, None, reason
    size, reason = _size(labels, rules)
    if reason is not None:
        return None, None, reason
    return item_type, size, None


def _steps(item_type, labels, config, agents_dir, ceiling):
    """(the item's priced steps, problems): step, charter, band, then
    (model, effort) from policy."""
    steps, problems = [], []
    for step in ITEM_STEPS[item_type]:
        charter = STEP_CHARTERS.get(step) or assembler.select_charter(labels)
        band, found = assembler.charter_band(agents_dir, charter)
        problems += found
        if band is None:
            continue
        model, found = factory_config.resolve_model(band, config)
        problems += found
        effort, found = factory_config.resolve_effort(band, config)
        problems += found
        steps.append({"step": step, "charter": charter, "band": band,
                      "model": model, "effort": effort,
                      "ceiling_usd": ceiling})
    return steps, problems


def _label_rules(config):
    """({type_labels, size_labels, default_size}, problems): the
    configured label rules, each None when factory.json omits it."""
    rules = {}
    for key, resolve in (
            ("type_labels", factory_config.resolve_type_labels),
            ("size_labels", factory_config.resolve_size_labels),
            ("default_size", factory_config.resolve_default_size)):
        rules[key], problems = resolve(config)
        if problems:
            return None, problems
    return rules, []


def plan_batch(issues, owner, config, spent, highest, agents_dir):
    """(plan, problems): PURE over already-read inputs. Each plannable
    issue becomes an item priced from budgets_usd by its size, split
    equally across its steps as their ceilings, with a reserved block
    above the highest id in use and above every earlier block. Every
    other issue is one deferral line. A config problem plans nothing."""
    cap, problems = factory_config.resolve_cap(config)
    if problems:
        return None, problems
    rules, problems = _label_rules(config)
    if problems:
        return None, problems
    next_free = {kind: highest[kind] + 1 for kind in highest}
    items, deferred, total = [], [], 0
    for issue in issues:
        key = f"#{issue['number']}"
        labels = label_names(issue)
        item_type, size, reason = _deferral(issue, labels, owner, rules)
        if reason is None:
            estimate, found = factory_config.resolve_budget(size, config)
            problems += found
            if found:
                continue
            left = cap - spent - total
            if estimate > left:
                reason = (f"its ${estimate:.2f} estimate is over the"
                          f" ${left:.2f} left of the ${cap:.2f} monthly cap")
        if reason is not None:
            deferred.append(f"{key} deferred: {reason}")
            continue
        steps, found = _steps(item_type, labels, config, agents_dir,
                              round(estimate / len(ITEM_STEPS[item_type]),
                                    2))
        for problem in found:
            if problem not in problems:
                problems.append(problem)
        block = {}
        for kind, count in BLOCK_SIZES[item_type].items():
            block[kind] = list(range(next_free[kind],
                                     next_free[kind] + count))
            next_free[kind] += count
        total += estimate
        items.append({"item": key, "type": item_type, "size": size,
                      "steps": steps, "estimate_usd": estimate, "after": [],
                      "block": block})
    if problems:
        return None, problems
    return {"items": items, "deferred": deferred, "estimate_usd": total,
            "month_to_date_usd": spent, "cap_usd": cap,
            "policy": {"routing": config.get("routing"),
                       "effort": config.get("effort")}}, []


def span(values):
    """A reserved block's sorted numbers as `n` or `first-last` per
    contiguous run, runs joined by commas: a renumbered live block need
    not be contiguous (#694)."""
    runs = []
    for value in values:
        if runs and value == runs[-1][1] + 1:
            runs[-1] = (runs[-1][0], value)
        else:
            runs.append((value, value))
    return ",".join(str(first) if first == last else f"{first}-{last}"
                    for first, last in runs)


def compose_plan(plan):
    """The plan as report lines: per item its steps and block, then the
    batch estimate against the cap, then one line per deferral."""
    lines = [f"cd: {len(plan['items'])} item(s) planned"]
    for item in plan["items"]:
        block = ", ".join(f"{kind} {span(values)}"
                          for kind, values in item["block"].items())
        lines.append(f"  {item['item']}  {item['type']}  size:{item['size']}"
                     f"  ${item['estimate_usd']:.2f}"
                     f"  reserves {block or 'nothing'}")
        lines += [f"    {s['step']:<6}  {s['charter']:<9}  {s['band']:<19}"
                  f"  {s['model']}  {s['effort']}  ${s['ceiling_usd']:.2f}"
                  for s in item["steps"]]
    left = plan["cap_usd"] - plan["month_to_date_usd"]
    lines.append(f"  batch estimate ${plan['estimate_usd']:.2f} against"
                 f" ${left:.2f} left of the ${plan['cap_usd']:.2f}"
                 " monthly cap")
    lines += [f"  {line}" for line in plan["deferred"]]
    return lines


def open_batch(root, batch, plan, now, git):
    """(the batch worktree, problems): create conductor/<batch> and its
    worktree from origin/main, write the plan row and one reserve row per
    block, and queue the spend ask. Refuses an empty plan, a bad batch
    name and an existing worktree before git runs, and a name whose
    ledger is already on origin/main before any worktree is made."""
    if not (isinstance(batch, str) and BATCH_NAME.fullmatch(batch)):
        return None, [f"cd: batch {batch!r} is not a batch name"
                      " (lowercase letters, digits and hyphens)"]
    if not plan["items"]:
        return None, ["cd: nothing to open: every issue was deferred"]
    shown = f"{WORKTREES}/conductor-{batch}"
    worktree = Path(root) / shown
    if worktree.exists():
        return None, [f"cd: {shown} already exists"]
    ledger_path = LEDGER.format(batch=batch)
    try:
        # A closed batch's ledger reaches main (review minor 5): its name
        # is taken even once its branch and worktree are gone.
        if git(["ls-tree", "--name-only", "origin/main", "--",
                ledger_path]).stdout.strip():
            return None, [f"cd: batch {batch} already has a ledger on"
                          f" origin/main ({ledger_path}); choose another"
                          " batch name"]
    except CLI_FAILURES as err:
        return None, [f"cd: git ls-tree origin/main failed: {detail(err)}"]
    try:
        git(["worktree", "add", "-b", f"conductor/{batch}", str(worktree),
             "origin/main"])
    except CLI_FAILURES as err:
        return None, [f"cd: git worktree add failed: {detail(err)}"]
    at = stamp(now)
    rows = [{"at": at, "kind": "plan", "item": None, "batch": batch,
             "items": [{key: value for key, value in item.items()
                        if key != "block"} for item in plan["items"]],
             "policy": plan["policy"], "estimate_usd": plan["estimate_usd"],
             "month_to_date_usd": plan["month_to_date_usd"],
             "cap_usd": plan["cap_usd"]}]
    rows += [{"at": at, "kind": "reserve", "item": item["item"],
              "what": kind, "values": values}
             for item in plan["items"]
             for kind, values in item["block"].items()]
    ledger = worktree / ledger_path
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with open(ledger, "x", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        handle.write("".join(json.dumps(row) + "\n" for row in rows))
    left = plan["cap_usd"] - plan["month_to_date_usd"]
    estimate = plan["estimate_usd"]
    _, problems = ask(
        worktree, batch, now, None, "spend",
        f"Spend up to ${estimate:.2f} on batch {batch}"
        f" ({len(plan['items'])} item(s))?", SPEND_OPTIONS, "approve",
        f"the ${estimate:.2f} estimate fits the ${left:.2f} left of the"
        f" ${plan['cap_usd']:.2f} monthly cap")
    return worktree, problems


def _plan(root, numbers, now, run, git, agents=None):
    """(plan, problems): read every input, then plan_batch. `agents` is
    the charter stub directory, the repo's own factory/agents/ unless
    named (a consumer repo has none, ADR-0055: #678)."""
    config, problems = factory_config.load(root)
    if problems:
        return None, problems
    owner, problems = repo_owner(run)
    if problems:
        return None, problems
    issues, problems = read_issues(numbers, run)
    if problems:
        return None, problems
    spent, problems = work_queue.month_to_date(root, now)
    if problems:
        return None, problems
    highest, problems = ids_in_use(git)
    if problems:
        return None, problems
    return plan_batch(issues, owner, config, spent, highest,
                      agents or Path(root) / "factory" / "agents")


def _issue_numbers(args):
    if not args or not all(ISSUE_KEY.fullmatch(arg) for arg in args):
        return None
    return [int(arg[1:]) for arg in args]


def _agents(args):
    """(the --agents directory or None, the remaining args)."""
    if args[:1] == ["--agents"] and len(args) >= 2:
        return Path(args[1]), args[2:]
    return None, args


def _repeated(numbers):
    """A problem per issue named more than once (review minor 2): each
    would become its own item, with its own block and estimate."""
    return [f"cd: #{number} is named more than once"
            for number in sorted({n for n in numbers
                                  if numbers.count(n) > 1})]


def plan_cli(root, args, now, run, git):
    agents, args = _agents(args)
    numbers = _issue_numbers(args)
    if numbers is None:
        return None
    repeated = _repeated(numbers)
    if repeated:
        return repeated
    plan, problems = _plan(root, numbers, now, run, git, agents)
    if plan is not None:
        print("\n".join(compose_plan(plan)))
    return problems


def open_cli(root, args, now, run, git):
    agents, rest = _agents(args[1:])
    numbers = _issue_numbers(rest)
    if numbers is None:
        return None
    repeated = _repeated(numbers)
    if repeated:
        return repeated
    plan, problems = _plan(root, numbers, now, run, git, agents)
    if plan is None:
        return problems
    print("\n".join(compose_plan(plan)))
    worktree, problems = open_batch(root, args[0], plan, now, git)
    if worktree is not None:
        print(f"cd: opened {worktree}")
    return problems
