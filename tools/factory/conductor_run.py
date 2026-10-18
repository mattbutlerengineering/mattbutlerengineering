#!/usr/bin/env python3
"""conductor_run: the Worker runner, `conductor.py run <batch> <item>
<step>` (PRD-0013, WO-0158), split from conductor.py by capability
(breakdown assumption 6). One metered, policy-bound headless harness run
per step of one item, in that item's own worktree.

In order: launch (a state row carrying the run id and this runner's
pid), run factory.json's conductor.worktree_setup if set (#850),
compose the brief and every harness flag, run under cli.harness_run
with the size's wall-clock limit, keep the result event as
runs/<run_id>.json, meter it with cli.read_execution, commit one
spend row on the item branch, push it (never forced), open or update its
PR from the Worker's uncommitted pr-body.md, and append the run's one
`run` row. Any outcome but a completed run with its expected output
queues a stall ask; nothing retries. The Owner's 2026-10-10 answers
(breakdown.md Notes) fix the branch names, tool list and defaults used.
"""
import netrc as netrc_file
import os
import re
import shlex
import subprocess
import tempfile
from pathlib import Path

import conductor_flow as flow
import cost_ledger
import factory_config
from assembler import PR_BODY_FILE
from cli import CLI_FAILURES, child_env, detail, gh_read, harness_run, \
    prettier_json, read_execution, runner
from conductor import RUNS, WORKER_ENV, answers, append, ask_row, \
    current_state, item_view, load, stamp, view
from conductor import run_id as make_run_id
from conductor_plan import span
from conductor_next import deliver
from conductor_spend import CEILING_OUTCOME, record_spend, ref_rows, \
    run_commits, spend_run, worktree_path
from knowledge_plane import WO_TOKEN, work_orders
from orientation_pack import orientation_pack
from protocol import read_frontmatter

HARNESS = "claude"
# Fixed for every step (Owner, 2026-10-10): no git push, no gh at all.
# The one gate permission is exactly the repo's gate command (review
# major 3: `make check` here, never `make *`, whose other targets write
# gh labels; factory.json's conductor.gate_command in a consumer repo,
# #678). The list alone cannot hold "no push, no gh", since python3
# reaches both; worker_env below is what enforces it.
def allowed_tools(gate):
    """The Worker's --allowedTools for a gate command given as argv."""
    return ("Read", "Edit", "Write", "Glob", "Grep", "Bash(python3 *)",
            f"Bash({shlex.join(gate)})", "Bash(git add *)",
            "Bash(git commit *)", "Bash(git status*)", "Bash(git diff*)",
            "Bash(git log*)")


ALLOWED_TOOLS = allowed_tools(
    shlex.split(factory_config.DEFAULT_GATE_COMMAND))
# The Worker's environment (review major 3): no GitHub credential, no gh
# config, no askpass; git's ssh transport is `false`, so no ssh push (or
# fetch) reaches any host or alias; and the Owner's own GIT_CONFIG_*
# entries are replaced: an http(s) push URL is rewritten to a path that
# cannot exist (all but a remote's explicit pushurl, which push_gaps
# refuses), and no credential helper hands out a token. Local-path
# remotes still work, so the suite's own scratch-repo pushes pass.
WORKER_STRIPPED = re.compile(r"GH_.*|GITHUB_(?:ENTERPRISE_)?TOKEN|CLAUDECODE"
                             r"|GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)"
                             r"|GIT_SSH(?:_COMMAND)?|(?:GIT|SSH)_ASKPASS")
NO_PUSH = "/dev/null/conductor-worker-may-not-push/"
WORKER_GIT_CONFIG = ((f"url.{NO_PUSH}.pushInsteadOf", "https://"),
                     (f"url.{NO_PUSH}.pushInsteadOf", "http://"),
                     ("credential.helper", ""))
CAP_WHY = ("the monthly cap is ADR-0034's breaker; raise monthly_cap_usd in"
           " factory.json first, or a resumed launch asks again")
REFUSAL_WHY = ("a retry meets the same refusal until the setting it names"
               " changes; change it, then resume")
PRIOR_WORK = ("The previous {step} run, {run_id}, ended: {reason}. These"
              " commits it made are already on {branch}, the head this"
              " worktree is at:\n{commits}\nDo not repeat that work. Check"
              " it against the objective, finish only what is missing (at"
              " the least, write " + PR_BODY_FILE + "), and stop.")
OBJECTIVES = {
    "spec": ("Drive issue {item}'s run with the autorun skill, as a"
             " {scale}, writing `stop-after: decompose` into its"
             " autorun-brief.md so it stops at the blueprint gate."),
    "build": "Implement {wo} test-first under the implement skill and"
             " check its row off.",
    "verify": "Verify this item's run under the verify skill and write"
              " verification.md.",
    "review": "Review this item's run under the review skill and write"
              " review.md with `verdict: pass` or `verdict: changes` in"
              " its frontmatter. This brief overrides the reviewer"
              " charter's exit: post no comment, apply no label and merge"
              " nothing. Commit nothing but review.md: request changes"
              " rather than fixing anything, since the merge refuses any"
              " other change made after the review began.",
    "ship": "Prepare this item's release.md under the ship skill and"
            " execute no release step. Commit nothing but release.md:"
            " the merge refuses any other change made after the review."}


def worker_env(base, batch, gh_config_dir):
    """The Worker's environment: `base` (the runner's) minus every
    WORKER_STRIPPED name, plus the batch flag, an empty gh config dir,
    no bytecode written into its worktree (#726), no terminal prompt
    and WORKER_GIT_CONFIG. pushInsteadOf skips a
    remote's explicit pushurl, and git's https transport reads ~/.netrc;
    this env closes neither, so push_gaps refuses the launch while
    either is configured (re-review R3). What stays trust-based: it
    stops a confused Worker, not a hostile one (breakdown Notes,
    2026-10-11). A Worker can undo this env from python3, reach a key
    held outside it (a keychain entry, a key loaded in the SSH agent),
    or get a token back from a shell profile that exports one."""
    env = {name: value for name, value in base.items()
           if not WORKER_STRIPPED.fullmatch(name)}
    env.update({WORKER_ENV: batch, "GH_CONFIG_DIR": gh_config_dir,
                "PYTHONDONTWRITEBYTECODE": "1",
                "GIT_TERMINAL_PROMPT": "0", "GIT_SSH_COMMAND": "false",
                "GIT_CONFIG_COUNT": str(len(WORKER_GIT_CONFIG))})
    for index, (key, value) in enumerate(WORKER_GIT_CONFIG):
        env[f"GIT_CONFIG_KEY_{index}"] = key
        env[f"GIT_CONFIG_VALUE_{index}"] = value
    return env


GUARD = "cd: launch refused: "
PUSHURL_KEY = r"^remote\..*\.pushurl$"


def _pushurls(git, worktree):
    """(the configured remote.<name>.pushurl keys, problems). `git config
    --get-regexp` exits 1 when nothing matches."""
    try:
        out = git(["-C", str(worktree), "config", "--get-regexp",
                   PUSHURL_KEY]).stdout
    except subprocess.CalledProcessError as err:
        if err.returncode == 1:
            return [], []
        return None, [f"{GUARD}git config failed: {detail(err)}"]
    except CLI_FAILURES as err:
        return None, [f"{GUARD}git config failed: {detail(err)}"]
    return [line.split()[0] for line in out.splitlines() if line.strip()], []


def _netrc_hosts(path):
    """(the hosts a netrc file holds credentials for, "default" included,
    problems). An absent file holds none; one that does not parse is a
    problem, never read as empty."""
    if not path.exists():
        return [], []
    try:
        return sorted(netrc_file.netrc(str(path)).hosts), []
    except (OSError, UnicodeDecodeError, netrc_file.NetrcParseError) as err:
        return None, [f"{GUARD}cannot read {path}: {err}"]


def push_gaps(git, worktree, netrc):
    """(problems): the fail-closed launch guard for the two push gaps
    worker_env cannot close (re-review R3). A remote's explicit pushurl
    is not rewritten by pushInsteadOf, and git's https transport reads
    the netrc file (~/.netrc; `netrc` is injectable), so either could
    carry a credential to a Worker's push. Either refuses the launch."""
    keys, problems = _pushurls(git, worktree)
    problems += [f"{GUARD}remote {key[len('remote.'):-len('.pushurl')]}"
                 " has an explicit pushurl, which the Worker's push block"
                 f" does not rewrite; unset {key} while a batch runs"
                 for key in keys or []]
    hosts, found = _netrc_hosts(netrc)
    problems += found
    problems += [f"{GUARD}{netrc} has a {host} entry, which git's https"
                 " transport would hand a Worker's push; move it aside"
                 " while a batch runs"
                 for host in hosts or [] if host == "default"
                 or host == "github.com" or host.endswith(".github.com")]
    return problems


def harness_command(brief, model, effort, ceiling_usd,
                    tools=ALLOWED_TOOLS):
    """Every harness flag, composed in this one function: the headless
    CLI is a volatile vendor surface."""
    return [HARNESS, "-p", brief, "--model", model, "--effort", effort,
            "--max-budget-usd", f"{ceiling_usd:.2f}", "--output-format",
            "json", "--allowedTools", *tools]


def compose_brief(step, item, item_type, worktree, branch, block, wo,
                  context, issue_body, ceiling, tools=ALLOWED_TOOLS,
                  prior=""):
    """The Worker's brief in its fixed shape. The issue body is an input
    only for a spec step (ADR-0032: owner-authored issues only). `prior`
    is a retry's note on the work its stalled run committed (#725)."""
    scale = ("maintenance run from capture" if item_type == "fix"
             else "feature run from idea")
    reserved = ", ".join(f"{kind} {span(values)}"
                         for kind, values in block.items()) or "none"
    inputs = [f"- {context}"] if context else []
    if step == "spec" and issue_body is not None:
        inputs.append(f"- Issue {item}, verbatim:\n\n{issue_body}")
    # #724: a spec run committed a whole blueprint, ran out of budget
    # before writing its PR body, and so opened no pull request.
    keep_body = ([f"Keep the pull request body in {PR_BODY_FILE} current"
                  " as each artifact is committed, and stop once the"
                  f" breakdown is committed: a run that reaches its"
                  f" ${ceiling:.2f} ceiling without {PR_BODY_FILE} opens"
                  " no pull request."] if step == "spec" else [])
    return "\n".join([
        "## Objective", "",
        OBJECTIVES[step].format(item=item, scale=scale, wo=wo), "",
        *(["## Prior work", "", prior, ""] if prior else []),
        "## Output", "",
        f"The stage artifact or code, as commits on {branch}. Write the"
        f" pull request body to {PR_BODY_FILE} at the worktree root and"
        " leave pr-body.md uncommitted.", *keep_body, "",
        "## Tools", "",
        f"Only these: {', '.join(tools)}. never git push, and"
        " never run any gh command: this environment carries no GitHub"
        " credential, and every push fails.", "",
        "## Boundaries", "",
        f"Work only in {worktree}. New PRD, ADR and WO ids come only from"
        f" this item's reserved block ({reserved}); if it runs out, stop"
        " and say so. never edit .claude-plugin/plugin.json's version.",
        "",
        "## Context budget", "",
        "The run directory on this branch, and:", *inputs,
        f"Your budget is ${ceiling:.2f}: the dollar ceiling is the whole"
        " context budget.", ""])


def _git(git, args, what):
    try:
        return git(args).stdout, []
    except CLI_FAILURES as err:
        return None, [f"{what} failed: {detail(err)}"]


def _issue(gh, item):
    result = gh_read(["issue", "view", item[1:], "--json", "title,body"],
                     f"gh issue view {item}", "cd", run=gh, expect=dict)
    return result.value, result.problems


def _work(rows, entry, step, git, gh, batch, worktree):
    """(wo, context, issue body, problems) for the step's inputs."""
    item = entry["item"]
    if step == "spec":
        issue, problems = _issue(gh, item)
        return item, "", (issue or {}).get("body"), problems
    if step != "build":
        return item, "", None, []
    index, _ = work_orders(worktree)
    if entry["type"] == "order":
        # The row, not the issue title, names the work order (ADR-0032,
        # issue #857): the same index the dispatcher resolves through.
        record = index["issue"].get(int(item[1:]))
        if record is None:
            return None, None, None, [f"cd: no breakdown row mirrors {item}"]
        if record["clashes"]:
            return None, None, None, [f"cd: {clash}"
                                      for clash in record["clashes"]]
        if not record["wo"]:
            return None, None, None, [f"cd: {item}'s breakdown row names no"
                                      " work order"]
        wo, row = record["wo"], record["block"]
    else:
        pending, problems = flow.unchecked_rows(
            git, flow.item_branch(batch, item))
        if problems:
            return None, None, None, problems
        if not pending:
            return None, None, None, [f"cd: {item} has no unchecked"
                                      " breakdown row to build"]
        row = pending[0]
        found = WO_TOKEN.search(row)
        wo = found.group(0) if found else item
    record = index["wo"].get(wo)
    block = record["block"] if record else row
    return wo, f"{row}\n\n{orientation_pack(worktree, wo, block)}", None, []


def _worktree(git, batch, item):
    """(the item worktree, problems), created from origin/main by the
    item's first runner."""
    path, problems = worktree_path(git, batch, item)
    if problems:
        return None, problems
    if not path.exists():
        _, problems = _git(git, ["worktree", "add", "-b",
                                 flow.item_branch(batch, item), str(path),
                                 "origin/main"], "cd: git worktree add")
    return path, problems


def _setup(setup, argv, worktree, minutes):
    """The stall reason when factory.json's conductor.worktree_setup
    fails in the item worktree under the step's limit (#850), else None.
    It is not git, so the Conductor's hook-skipping git port is not it."""
    try:
        setup(argv[0], timeout=minutes * 60)(argv[1:], cwd=str(worktree))
    except CLI_FAILURES as err:
        return f"worktree setup `{shlex.join(argv)}` failed: {detail(err)}"
    return None


def _harness(harness, cmd, worktree, minutes, batch):
    """(result event or None, how it ended): completed, timeout,
    missing (no process ever started) or unaccounted (no result)."""
    try:
        with tempfile.TemporaryDirectory(prefix="conductor-gh-") as gh_dir, \
                harness(cmd, cwd=str(worktree), timeout=minutes * 60,
                        env=worker_env(child_env(), batch, gh_dir)) \
                as events:
            results = [e for e in events
                       if isinstance(e, dict) and e.get("type") == "result"]
            timed_out = events.timed_out
    except OSError as err:
        return None, "missing", str(err)
    if timed_out:
        return None, "timeout", None
    return (results[-1], "completed", None) if results \
        else (None, "unaccounted", None)


def _meter(root, batch, run_id, event, ended, ceiling, model):
    """(tokens, cost, outcome, models reported, stall reason)."""
    if ended == "missing":
        return 0, 0.0, "agent-failed", [], "the harness could not start"
    if event is not None:
        runs = Path(root) / RUNS.format(batch=batch)
        runs.mkdir(parents=True, exist_ok=True)
        kept = runs / f"{run_id}.json"
        kept.write_text(prettier_json(event), encoding="utf-8")
        metered, error = read_execution(kept)
        if error is None:
            reported = sorted(event.get("modelUsage") or {})
            if event.get("subtype") == "success" \
                    and not event.get("is_error"):
                return (*metered, "completed", reported, None)
            return (*metered, "agent-failed", reported,
                    f"the Worker run ended {event.get('subtype')}")
        ended = "unaccounted"
    reason = ("the result event could not be metered"
              if ended == "unaccounted" else None)
    return 0, float(ceiling), CEILING_OUTCOME[ended], [], reason


def _prior_work(git, rows, item, step, branch):
    """(the brief's prior-work note, "" when there is none, problems): on
    a retry, the commits the stalled run of this step made, read from
    the item branch between its spend commit and the one before (#725).
    Without the note a retry repeats committed work from scratch."""
    earlier = flow.prior_stalls(rows, item, step)
    if not earlier or earlier[-1][0] is None:
        return "", []
    run, reason = earlier[-1]
    subjects, problems = run_commits(git, branch)
    if problems:
        return None, [f"cd: {problem}" for problem in problems]
    runs = [spend_run(subject) for subject in subjects]
    if run["run_id"] not in runs:
        return "", []
    commits = []
    start = runs.index(run["run_id"]) + 1
    for subject, spent in zip(subjects[start:], runs[start:]):
        if spent is not None:
            break
        commits.append(f"- {subject}")
    if not commits:
        return "", []
    return PRIOR_WORK.format(step=step, run_id=run["run_id"], reason=reason,
                             branch=branch, commits="\n".join(commits)), []


def _verdict(git, worktree, branch):
    """The review.md verdict on the item branch, or None."""
    changed, problems = flow.changed_files(git, branch)
    for path in [] if problems else changed:
        if path.endswith("/review.md") and (worktree / path).is_file():
            fields = read_frontmatter(worktree / path) or {}
            verdict = (fields.get("verdict") or "").strip()
            return verdict if verdict in flow.VERDICTS else None
    return None


def _stall_cause(stall, ended, failed):
    """The class of a run's stall (conductor.CAUSES, #819): a wall-clock
    kill, a budget stop, a failed spend commit, push or PR (`failed`),
    else the Worker's own failure."""
    if ended == "timeout":
        return "timeout"
    if stall == flow.BUDGET_REASON:
        return "ceiling"
    return "delivery-failed" if stall == failed else "agent-failed"


def _left_unchecked(git, branch, briefed, wo):
    """A stall reason when a completed build run left the breakdown row
    it was briefed with unchecked on the branch, else None: without it,
    `next` would offer the same build again, every run spending up to
    its ceiling (stall rule 1, a completed run without its output)."""
    pending, problems = flow.unchecked_rows(git, branch)
    if problems:
        return problems[0][len("cd: "):]
    if briefed in pending:
        return f"the build run completed but left {wo} unchecked"
    return None


def month_spend(git, rows, batch, now):
    """(dollars spent this month, problems a retry may fix, problems it
    cannot) as the run-time cap check sees it: origin/main's spend rows
    and every launched item branch's, each row once
    (cost_ledger.row_key), selected by cost_ledger.dispatched, the
    breaker's one row rule. The batch worktree's own costs.jsonl is a
    snapshot from the batch's open, and item spend stays on item
    branches until it merges."""
    read = view(rows)
    launched = [entry["item"] for entry in read["plan"]["items"]
                if any("run_id" in row
                       for row in read["items"][entry["item"]]["states"])]
    entries = {}
    for ref in ["origin/main"] + [flow.item_branch(batch, item)
                                  for item in launched]:
        found, problems, malformed = ref_rows(git, ref)
        if problems or malformed:
            return None, problems, malformed
        entries.update((cost_ledger.row_key(entry), entry)
                       for entry in found)
    month = now.strftime("%Y-%m")
    return sum(entry["cost"] for entry in cost_ledger.dispatched(
        list(entries.values()), month)), [], []


def preflight(root, git, netrc):
    """(problems): the launch refusals no retry fixes that `run` would
    meet whatever the item: an unusable factory.json, a malformed cost
    ledger on origin/main, and a push gap. `open` checks them before it
    queues the spend ask, so none first appears after spend consent
    (#708)."""
    config, problems = factory_config.load(root)
    if not problems:
        problems = factory_config.resolve_cap(config)[1] \
            + factory_config.resolve_gate_command(config)[1]
    _, unread, malformed = ref_rows(git, "origin/main")
    return problems + unread + malformed + push_gaps(git, root, netrc)


def _in_flight_usd(rows):
    """The ceilings of every launched run with no finishing run row: each
    may still spend up to its ceiling."""
    read = view(rows)
    total = 0.0
    for entry in read["plan"]["items"]:
        found = read["items"][entry["item"]]
        if found["in_flight"]:
            total += found["steps"][found["state"]]["ceiling_usd"]
    return total


def _pause(rows, now, ask_kind, question, recommended, why):
    """(the batch-level ask dispatch waits behind, rows to write,
    problems): a pending batch-level ask is reused, never repeated."""
    given = answers(rows)
    pending = next((row for row in rows if row["kind"] == "ask"
                    and row["item"] is None and row["ask_kind"] != "merge"
                    and row["id"] not in given), None)
    if pending is not None:
        return pending, [], []
    asked, problems = ask_row(rows, now, None, ask_kind, question,
                              flow.PAUSE_OPTIONS, recommended, why)
    return asked, ([] if problems else [asked]), problems


def hold_dispatch(root, batch, now, item, step, refusals):
    """(problems): the refusals of a launch no retry fixes, then the
    batch-wide pause ask they put dispatch behind (#709). A refused
    launch writes no run row, so without it `next` would re-offer the
    step on every tick and nothing would reach the Owner."""
    held_by = []

    def build(rows):
        pending, written, problems = _pause(
            rows, now, "stall", f"Launching {item} {step} was refused:"
            f" {'; '.join(refusals)}. Resume dispatch, or stop?", "resume",
            REFUSAL_WHY)
        held_by.append(pending)
        return (None, problems) if problems else (written, [])
    _, problems = append(root, batch, build)
    if problems:
        return refusals + problems
    return refusals + [f"cd: launching {item} {step} was refused; dispatch"
                       f" is paused behind {held_by[-1]['id']}"]


def _launch(root, batch, now, launch, spent, cap):
    """(problems): the launch state row, written under the ledger lock
    only while the month's spend, every in-flight ceiling and this run's
    ceiling fit the monthly cap (review major 2). Otherwise dispatch is
    paused behind a batch-level spend ask, reusing a pending one, and
    nothing is launched."""
    item, step, ceiling = launch["item"], launch["step"], launch["ceiling"]
    refused = []

    def build(rows):
        problems = flow.transition_problems(rows, item, step,
                                            launch["fields"])
        if problems:
            return None, problems
        month = spent + _in_flight_usd(rows) + ceiling
        if month <= cap:
            return flow.state_row(now, item, current_state(rows, item),
                                  step, flow.LAUNCHED, **launch["fields"]), []
        what = (f"{item} {step} (${ceiling:.2f} ceiling) would put the"
                f" month at ${month:.2f} against its ${cap:.2f} cap")
        pending, written, problems = _pause(
            rows, now, "spend", f"Launching {what}. Resume dispatch, or"
            " stop?", "stop", CAP_WHY)
        if problems:
            return None, problems
        refused.append(f"cd: launching {what}; dispatch is paused behind"
                       f" {pending['id']}")
        return written, []
    _, problems = append(root, batch, build)
    return problems or refused


def _prepare(root, batch, item, step, git, gh, netrc, now):
    """(context dict, problems): everything decided before launch."""
    rows, problems = load(root, batch)
    if problems:
        return None, problems
    found = item_view(rows, item)
    entry = found["entry"]
    if found["unknown"]:
        return None, [found["unknown"]]
    if step not in found["steps"]:
        return None, [f"cd: {item} has no {step} step"]
    problems = flow.transition_problems(rows, item, step, {})
    if problems:
        return None, problems
    worktree, problems = _worktree(git, batch, item)
    if problems:
        return None, problems
    problems = push_gaps(git, worktree, netrc)
    if problems:
        return None, hold_dispatch(root, batch, now, item, step, problems)
    wo, context, body, problems = _work(rows, entry, step, git, gh, batch,
                                        worktree)
    if problems:
        return None, problems
    prior, problems = _prior_work(git, rows, item, step,
                                  flow.item_branch(batch, item))
    if problems:
        return None, problems
    # The breakdown row a feature or fix build is briefed with: its
    # expected output is that row checked off on the branch.
    briefed = context.split("\n", 1)[0] if step == "build" \
        and entry["type"] != "order" else None
    # The tree a review run is given: the merge holds the merged tree to
    # it (review major 1).
    head = None
    if step == "review":
        out, problems = _git(git, ["rev-parse", flow.item_branch(batch,
                                                                 item)],
                             "cd: git rev-parse")
        if problems:
            return None, problems
        head = out.strip()
    # A launch carries its runner's pid; `next`'s bookkeeping resume
    # carries only the completed run's id and is no launch (#939).
    seq = 1 + sum(1 for r in found["states"]
                  if r["to"] == step and "pid" in r)
    return {"rows": rows, "entry": entry, "wo": wo,
            "context": context, "body": body, "worktree": worktree,
            "block": found["reserved"], "briefed": briefed, "head": head,
            "prior": prior, "policy": found["steps"][step],
            "run_id": make_run_id(batch, item, step, seq)}, []


def run_step(root, batch, item, step, clock, git, gh, harness=harness_run,
             pid=None, netrc=None, setup=runner):
    """(summary, problems): one Worker run. problems only when nothing
    was launched or a ledger write failed; a failed run is a stall, and
    a launch refusal no retry fixes pauses dispatch (hold_dispatch). The
    launch row carries the launch time, and every row written after the
    run its end time (review minor 1): a stall ask stamped at launch
    would count the whole run as Owner wait."""
    pid = os.getpid() if pid is None else pid
    now = clock()
    netrc = Path.home() / ".netrc" if netrc is None else netrc
    ctx, problems = _prepare(root, batch, item, step, git, gh, netrc,
                             now)
    if problems:
        return None, problems
    entry, run_id, worktree = ctx["entry"], ctx["run_id"], ctx["worktree"]
    branch = flow.item_branch(batch, item)
    policy = ctx["policy"]
    band, model, effort, ceiling = (policy[field] for field in (
        "band", "model", "effort", "ceiling_usd"))
    config, problems = factory_config.load(root)
    cap, found = factory_config.resolve_cap(config or {})
    gate, unusable = factory_config.resolve_gate_command(config or {})
    setup_argv, _ = factory_config.resolve_worktree_setup(config or {})
    refusals = problems or found or unusable
    if not refusals:
        spent, problems, refusals = month_spend(git, ctx["rows"], batch,
                                                now)
    if refusals:
        return None, hold_dispatch(root, batch, now, item, step, refusals)
    if not problems:
        problems = _launch(root, batch, now, {
            "item": item, "step": step, "ceiling": ceiling,
            "fields": {"run_id": run_id, "pid": pid}}, spent, cap)
    if problems:
        return None, problems
    # pr-body.md is this step's output only (review minor 7): one left by
    # an earlier step would satisfy the expected-output check.
    (worktree / PR_BODY_FILE).unlink(missing_ok=True)
    minutes = flow.WALL_CLOCK_MINUTES[entry["size"]]
    stall = setup_argv and _setup(setup, setup_argv, worktree, minutes)
    if stall:
        recommended, why = flow.worker_advice(ctx["rows"], entry, step,
                                              band, stall)
        _, problems = flow.queue_stall(root, batch, clock(), item, stall,
                                       "setup-failed", recommended, why)
        return {"run_id": run_id, "outcome": "setup-failed",
                "stall": stall}, problems
    tools = allowed_tools(gate)
    brief = compose_brief(step, item, entry["type"], worktree, branch,
                          ctx["block"], ctx["wo"], ctx["context"],
                          ctx["body"], ceiling, tools, ctx["prior"])
    event, ended, _ = _harness(
        harness, harness_command(brief, model, effort, ceiling, tools),
        worktree, minutes, batch)
    done = clock()
    tokens, cost, outcome, reported, stall = _meter(
        root, batch, run_id, event, ended, ceiling, model)
    if ended == "timeout":
        stall = f"killed at its {minutes}-minute wall-clock limit"
    spent_model = model if model in reported or not reported \
        else reported[0]
    failed = record_spend(git, worktree, ctx["wo"], run_id, spent_model,
                          tokens, cost, outcome, done)
    if stall is None and not (worktree / PR_BODY_FILE).is_file():
        stall = "the run completed but left no pr-body.md"
    failed = failed or deliver(git, gh, worktree, branch, item, batch)
    if failed is None:
        # Kept on a delivery failure: `next` redoes the push and PR from
        # it (#939). The pre-launch unlink above keeps it one step's.
        (worktree / PR_BODY_FILE).unlink(missing_ok=True)
    stall = stall or failed
    if stall is None and ctx["briefed"] is not None:
        stall = _left_unchecked(git, branch, ctx["briefed"], ctx["wo"])
    _, problems = append(root, batch, lambda rows: ({
        "at": stamp(done), "kind": "run",
        "item": item, "step": step, "charter": policy["charter"],
        "band": band,
        "model": model, "models_reported": reported, "effort": effort,
        "run_id": run_id, "pid": pid, "outcome": outcome}, []))
    if problems:
        return None, problems
    if stall is None and step == "review":
        verdict = _verdict(git, worktree, branch)
        if verdict is None:
            stall = "review.md carries no verdict: pass|changes line"
        else:
            _, problems = flow.record_verdict(root, batch, done, item,
                                              verdict, run_id, ctx["head"])
    if stall is not None:
        cause = _stall_cause(stall, ended, failed)
        recommended, why = flow.worker_advice(ctx["rows"], entry, step,
                                              band, stall, event, cause)
        _, problems = flow.queue_stall(root, batch, done, item, stall,
                                       cause, recommended, why)
    return {"run_id": run_id, "outcome": outcome, "stall": stall}, problems


def run_cli(root, args, clock, git, gh, harness):
    if len(args) != 3 or not cost_ledger.ISSUE_KEY.fullmatch(args[1]):
        return None
    batch, item, step = args
    if step not in flow.STEPS:
        return None
    summary, problems = run_step(root, batch, item, step, clock, git, gh,
                                 harness=harness or harness_run)
    if summary is not None:
        line = f"cd: run {summary['run_id']} {summary['outcome']}"
        print(line + (f"; stalled: {summary['stall']}"
                      if summary["stall"] else ""))
    return problems
