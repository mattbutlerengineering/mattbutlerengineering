#!/usr/bin/env python3
"""conductor_plan: the Conductor's `plan` and `open` (PRD-0013), split
from conductor.py by capability (breakdown assumption 6). It imports
conductor.py's row grammar and ledger writes, which keep one owner;
conductor.py's main dispatches here.
"""
import fcntl
import json
import subprocess
from pathlib import Path, PurePosixPath

import assembler
import factory_config
import work_queue
from cli import CLI_FAILURES, detail, gh_read, label_names
from conductor import LEDGER, WORKTREES, ask, batch_branch, batch_dir, \
    batch_name_problems, batch_worktree, is_text, load, stamp
from cost_ledger import ISSUE_KEY
from knowledge_plane import PRD_TOKEN, WO_TOKEN, adr_file_number

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
SIZE_LABELS = ("size:S", "size:M", "size:L")
# The labels the default rules read; detector J checks the taxonomy
# carries them (gates.declared_labels reads every module's LABELS).
LABELS = (*TYPE_BY_LABEL, *SIZE_LABELS)
# lean: fixed block sizes per item type. The ceiling is an item that
# needs more numbers than its block; its Worker stops and says so. The
# trigger to size blocks per item is a scorecard showing that stop fire.
BLOCK_SIZES = {"feature": {"prd": 1, "adr": 3, "wo": 10},
               "fix": {"adr": 1, "wo": 5},
               "order": {}}
ID_TOKENS = (("prd", PRD_TOKEN), ("wo", WO_TOKEN))
# docs/ only: tests and fixtures carry example ids in the nine-thousands
# that no run ever used, and a block above them would leave the 4-digit
# grammar. The stamped payload (tools/factory/, factory/) lies outside it.
ID_GREP = ["grep", "-h", "-o", "-E", "(PRD|WO)-[0-9]{4}", "origin/main",
           "--", "docs"]
# An ADR is taken by its file, never by a citation (#821): a consumer's
# docs cite this plugin's ADRs, and its own files may be 3-digit
# (`ADR-020-*.md`), which ADR_TOKEN deliberately does not read (#774).
ADR_LIST = ["ls-tree", "--name-only", "origin/main", "--", "docs/adr/"]
BATCHES = str(PurePosixPath(batch_dir("b")).parent) + "/"
BATCH_LIST = ["ls-tree", "--name-only", "origin/main", "--", BATCHES]
ISSUE_FIELDS = "number,state,author,labels"
SPEND_OPTIONS = ["approve", "decline"]


def _listed(git, args):
    """(the names `git ls-tree --name-only` prints for ARGS, problems)."""
    try:
        out = git(args).stdout
    except CLI_FAILURES as err:
        return None, [f"cd: git ls-tree origin/main failed: {detail(err)}"]
    return [PurePosixPath(line).name for line in out.splitlines()], []


def ids_on_main(git):
    """({kind: set of numbers}, problems) for the PRD, ADR and WO ids on
    origin/main. PRD and WO are knowledge_plane's token grammars over
    docs/, over-counting any id merely cited, which is the safe
    direction; grep's exit 1 is "no match". ADR is the number of every
    ADR file in docs/adr, at any width, as knowledge_plane.adr_paths
    reads the same directory on disk."""
    try:
        text = git(ID_GREP).stdout
    except subprocess.CalledProcessError as err:
        if err.returncode != 1:
            return None, [f"cd: git grep origin/main failed: {detail(err)}"]
        text = ""
    except CLI_FAILURES as err:
        return None, [f"cd: git grep origin/main failed: {detail(err)}"]
    names, problems = _listed(git, ADR_LIST)
    if problems:
        return None, problems
    found = {kind: {int(match.group(0)[-4:])
                    for match in token.finditer(text)}
             for kind, token in ID_TOKENS}
    found["adr"] = {int(adr_file_number(name)[0]) for name in names
                    if name.endswith(".md") and adr_file_number(name)}
    return found, []


def ids_reserved(git):
    """({kind: set of numbers}, problems): every number a reserve row
    holds in a batch ledger not yet on origin/main, read from its batch
    worktree under the main checkout (#821). A merged ledger's used
    numbers are on main and the rest are free again. An item worktree's
    name ends in -<n>, so it names no batch and is passed over."""
    checkout, problems = main_checkout(git)
    if problems:
        return None, problems
    merged, problems = _listed(git, BATCH_LIST)
    if problems:
        return None, problems
    prefix = PurePosixPath(batch_worktree("")).name
    held = {kind: set() for kind in BLOCK_SIZES["feature"]}
    for worktree in sorted((checkout / WORKTREES).glob(f"{prefix}*")):
        batch = worktree.name[len(prefix):]
        if (batch_name_problems(batch) or batch in merged
                or not (worktree / LEDGER.format(batch=batch)).is_file()):
            continue
        rows, problems = load(worktree, batch)
        if problems:
            return None, problems
        for row in rows:
            if row["kind"] == "reserve" and row["what"] in held:
                held[row["what"]].update(row["values"])
    return held, []


def ids_in_use(git):
    """({kind: highest number}, problems): the maxima of ids_on_main and
    ids_reserved together, 0 for a kind with none."""
    found, problems = ids_on_main(git)
    if problems:
        return None, problems
    reserved, problems = ids_reserved(git)
    if problems:
        return None, problems
    return {kind: max(numbers | reserved[kind], default=0)
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
                     if name in SIZE_LABELS), default)
        return (size, None) if size else (None, "no size: label")
    if default and not any(name in table for name in labels):
        return default, None
    return _mapped(labels, table, "a size", "size_labels")


def _deferral(issue, labels, owner, rules=None):
    """(item type, size, reason): reason is None for a plannable issue.
    `rules` holds the configured label maps, default size and defer
    labels, each absent when factory.json does not set it."""
    rules = rules or {}
    if (issue["state"] or "").upper() != "OPEN":
        return None, None, "closed"
    author = issue["author"].get("login")
    if author != owner:
        return None, None, (f"authored by {author}, not the repo owner"
                            f" {owner}")
    blocking = [name for name in labels
                if name in (rules.get("defer_labels") or ())]
    if blocking:
        return None, None, (f"carries defer label {blocking[0]}"
                            " (conductor.defer_labels)")
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


def ceilings(estimate, steps, weights):
    """step -> ceiling: the estimate split across `steps` by weight, in
    cents. The first step takes the rounding remainder, so the ceilings
    sum to the estimate exactly (#724)."""
    total = sum(weights[step] for step in steps)
    rest = {step: round(estimate * weights[step] / total, 2)
            for step in steps[1:]}
    return {steps[0]: round(estimate - sum(rest.values()), 2), **rest}


def _steps(item_type, labels, config, agents_dir, ceiling):
    """(the item's priced steps, problems): step, charter, band, then
    (model, effort) from policy, and `ceiling[step]` as its ceiling."""
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
                      "ceiling_usd": ceiling[step]})
    return steps, problems


def _label_rules(config):
    """({type_labels, size_labels, default_size, defer_labels},
    problems): the configured label rules, each None when factory.json
    omits it."""
    rules = {}
    for key, resolve in (
            ("type_labels", factory_config.resolve_type_labels),
            ("size_labels", factory_config.resolve_size_labels),
            ("default_size", factory_config.resolve_default_size),
            ("defer_labels", factory_config.resolve_defer_labels)):
        rules[key], problems = resolve(config)
        if problems:
            return None, problems
    return rules, []


def plan_batch(issues, owner, config, spent, highest, agents_dir):
    """(plan, problems): PURE over already-read inputs. Each plannable
    issue becomes an item priced from budgets_usd by its size, split
    across its steps by step weight as their ceilings, with a reserved
    block above the highest id in use and above every earlier block.
    Every other issue is one deferral line. A config problem plans
    nothing."""
    cap, problems = factory_config.resolve_cap(config)
    if problems:
        return None, problems
    weights, problems = factory_config.resolve_step_weights(config)
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
                              ceilings(estimate, ITEM_STEPS[item_type],
                                       weights))
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


def main_checkout(git):
    """(the main checkout, problems): the parent of git's common dir, so
    a command run from a linked worktree still anchors the Conductor's
    worktrees at the main checkout, never nested inside itself (#710)."""
    try:
        out = git(["rev-parse", "--path-format=absolute",
                   "--git-common-dir"]).stdout
    except CLI_FAILURES as err:
        return None, [f"cd: git rev-parse failed: {detail(err)}"]
    return Path(out.strip()).parent, []


def open_batch(batch, plan, now, git):
    """(the batch worktree, problems): create conductor/<batch> and its
    worktree, under the main checkout, from origin/main, write the plan
    row and one reserve row per block, and queue the spend ask. Refuses
    an empty plan and a bad batch name before git runs, an existing
    worktree before any git write, and a name whose ledger is already on
    origin/main before any worktree is made."""
    problems = batch_name_problems(batch)
    if problems:
        return None, problems
    if not plan["items"]:
        return None, ["cd: nothing to open: every issue was deferred"]
    checkout, problems = main_checkout(git)
    if problems:
        return None, problems
    shown = batch_worktree(batch)
    worktree = checkout / shown
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
        git(["worktree", "add", "-b", batch_branch(batch), str(worktree),
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


def open_cli(root, args, now, run, git, netrc=None):
    """`open`, refused before the batch exists while conductor_run's
    preflight finds a launch refusal no retry fixes: the spend ask is the
    Owner's consent, and no refusal may first appear after it (#708).
    `netrc` is injectable, ~/.netrc unless named."""
    # Imported here: conductor_run imports this module (span).
    import conductor_run
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
    problems = conductor_run.preflight(
        root, git, Path.home() / ".netrc" if netrc is None else netrc)
    if problems:
        return problems
    worktree, problems = open_batch(args[0], plan, now, git)
    if worktree is not None:
        print(f"cd: opened {worktree}")
    return problems
