#!/usr/bin/env python3
"""conductor_next: `next`'s impure side (PRD-0013), split from
conductor_flow by capability (breakdown assumption 6) when `next` took
on the work a runner could not finish (#939). It imports conductor.py's
row grammar and conductor_flow's state machine, which keep one owner
each; conductor_flow stays pure.

In order, under the ledger lock: the issue-state read that holds a
closed item behind a clarify ask before anything spends on it; the
bookkeeping turn that redoes a finished run's spend commit, push and
PR instead of relaunching its Worker (one consumer spec completed three
times for $12.53 before this); the survey; the lost-run charge (#937);
and the same issue read for every step about to launch. Before the
lock, one `gh pr list --state merged` per due item (#938): a PR the
repo merged outside the batch is a fact the survey stalls on. It also
owns the delivery a runner ends with (push, PR; #954's refusals), which
the bookkeeping turn shares and which names such a PR.
"""
import json
import os
from pathlib import Path

import conductor_consent as consent
import conductor_flow as flow
import conductor_landed as landed
import cost_ledger
import factory_config
from assembler import PR_BODY_FILE
from cli import CLI_FAILURES, detail, gh_read, read_execution
from conductor import (BLOCK, RUNS, append, ask_row, is_text, item_branch,
                       load, next_ask, view)
from conductor_spend import (commit_spend, git_call, record_lost,
                             record_spend, run_commits, spend_run,
                             worktree_path)

# The clarify ask `next` writes itself (#939): an item whose issue is
# closed on GitHub, or whose state cannot be read, launches nothing
# until the Owner answers.
CLARIFY_OPTIONS = ["block", "proceed"]
CLOSED_QUESTION = ("{item}'s issue is closed on GitHub, so a run would spend"
                   " on finished work. Block it, or reopen the issue and"
                   " proceed?")
UNREAD_QUESTION = ("{item}'s issue state could not be read ({problem}), so"
                   " nothing launches until it can. Block it, or proceed"
                   " once gh reads it?")
CLOSED_WHY = ("an issue closed by other work is the likeliest reading, and"
              " a run of it spends on nothing; reopen the issue first if"
              " the work is still wanted")
UNREAD_WHY = ("a read that fails once is usually transient; proceed re-reads"
              " the state before any launch, and nothing launches until it"
              " reads open")
# The resume row a bookkeeping turn writes: not a launch (no pid; the
# completed run's own id), so calibrate's wall-time join and the run
# sequence pass over it.
RESUMED = ("bookkeeping retried for {run_id}: the Worker's run completed;"
           " its spend row, push and PR were redone")
# A PR merged outside the batch (#938), as a fresh PR's body and a
# refused PR's stall name it.
MERGED_FIELDS = "number,mergeCommit"
CONTINUED = ("Continues after PR #{pr}, which merged outside conductor batch"
             " {batch} with this item's earlier work.")
LANDED_NOTE = " (PR #{pr} merged outside the batch)"


def merged_pr(gh, branch):
    """({"pr", "sha"} of the latest merged PR of `branch`, or None,
    problems): one `gh pr list --state merged` (#938), the read `next`
    makes of each due item, deliver of a head with no open PR, and
    close of each blocked item."""
    operation = f"gh pr list --head {branch} --state merged"
    listed = gh_read(["pr", "list", "--head", branch, "--state", "merged",
                      "--json", MERGED_FIELDS], operation, run=gh,
                     expect=list)
    if listed.problems:
        return None, listed.problems
    if not listed.value:
        return None, []
    found = listed.value[0] if isinstance(listed.value[0], dict) else {}
    commit = found.get("mergeCommit")
    pr = found.get("number")
    sha = commit.get("oid") if isinstance(commit, dict) else None
    if type(pr) is not int or not is_text(sha):
        return None, [f"{operation} named an unreadable merged PR"]
    return {"pr": pr, "sha": sha}, []


def issue_state(gh, item):
    """(the item's issue state lowercased — open or closed — or None
    when gh reports none, problems): one `gh issue view --json state`,
    the read the PR refusal (#954) and the launch check (#939) share."""
    viewed = gh_read(["issue", "view", item[1:], "--json", "state"],
                     f"gh issue view {item}", "cd", run=gh, expect=dict)
    if viewed.problems:
        return None, viewed.problems
    state = (viewed.value.get("state")
             if isinstance(viewed.value, dict) else None)
    if not isinstance(state, str) or not state.strip():
        return None, []
    return state.strip().lower(), []


def feature_slugs(paths):
    """docs/features/<slug> directories a change touches, in order."""
    slugs = []
    for path in paths:
        parts = path.split("/")
        if (len(parts) >= 3 and parts[0] == "docs" and parts[1] == "features"
                and parts[2] and parts[2] not in slugs):
            slugs.append(parts[2])
    return slugs


def pr_create_refusal(git, gh, branch, item):
    """A reason not to open a new PR, else None. An already-open PR is
    updated and never reaches here. A `#N` item whose issue is closed, or
    whose state cannot be read, is refused: re-opening a finished issue
    is how duplicate feature directories landed on main. A branch that
    touches docs/features/<slug> when that directory already exists on
    origin/main is refused the same way. Anything that is not `#N` skips
    the issue check and still gets the directory check."""
    if cost_ledger.ISSUE_KEY.fullmatch(item):
        state, problems = issue_state(gh, item)
        if problems:
            return f"refusing to open a PR for {item}: {problems[0]}"
        if state is None:
            return (f"refusing to open a PR for {item}: its issue state"
                    " could not be read")
        if state == "closed":
            return (f"refusing to open a PR for {item}: the issue is"
                    " already closed")
    changed, problems = flow.changed_files(git, branch)
    if problems:
        return problems[0]
    for slug in feature_slugs(changed):
        path = f"docs/features/{slug}"
        listed, problems = git_call(
            git, ["ls-tree", "--name-only", "origin/main", "--", path],
            f"listing {path} on origin/main")
        if problems:
            return problems[0]
        if listed.strip():
            return (f"refusing to open a PR for {item}: {path} already"
                    " exists on origin/main")
    return None


def _body_args(body, landed, batch):
    """The new PR's body: the file as written, or, after a PR merged
    outside the batch (#938), that PR named above it."""
    if landed is None:
        return ["--body-file", str(body)]
    return ["--body", CONTINUED.format(pr=landed["pr"], batch=batch)
            + "\n\n" + body.read_text(encoding="utf-8")]


def deliver(git, gh, worktree, branch, item, batch):
    """Push the item branch (never forced) and open or update its PR from
    pr-body.md. A stall reason on failure, else None. A new PR is refused
    when the issue is already closed or its feature directory is already
    on main; an open PR is still updated. With no open PR, a merged one
    on the head (#938) is named: in the refusal, or in the new PR's
    body, so a second PR never repeats the first's title unexplained."""
    _, problems = git_call(git, ["-C", str(worktree), "push", "-u",
                                 "origin", branch], f"pushing {branch}")
    if problems:
        return problems[0]
    body = worktree / PR_BODY_FILE
    if not body.is_file():
        return None
    listed = gh_read(["pr", "list", "--head", branch, "--state", "open",
                      "--json", "number"], "gh pr list", run=gh)
    try:
        if listed.problems:
            raise OSError(listed.problems[0])
        if listed.value:
            gh(["api", "-X", "PATCH", "repos/{owner}/{repo}/pulls/"
                f"{listed.value[0]['number']}", "-F", f"body=@{body}"])
        else:
            landed, problems = merged_pr(gh, branch)
            if problems:
                raise OSError(problems[0])
            refusal = pr_create_refusal(git, gh, branch, item)
            if refusal:
                return refusal + (LANDED_NOTE.format(pr=landed["pr"])
                                  if landed else "")
            gh(["pr", "create", "--head", branch, "--base", "main",
                "--title", f"{item}: conductor batch {batch}",
                *_body_args(body, landed, batch)])
    except CLI_FAILURES as err:
        return f"opening or updating the PR failed: {detail(err)}"
    return None


def clarify_ask(rows, now, item, state, problems):
    """(the clarify ask that holds `item` until the Owner answers,
    problems): its issue is closed — block recommended — or its state
    could not be read (`problems`, or none reported) — proceed
    recommended, since the read is retried before any launch."""
    if state == "closed":
        return ask_row(rows, now, item, "clarify",
                       CLOSED_QUESTION.format(item=item), CLARIFY_OPTIONS,
                       BLOCK, CLOSED_WHY)
    problem = problems[0] if problems else "its state was not reported"
    return ask_row(rows, now, item, "clarify",
                   UNREAD_QUESTION.format(item=item, problem=problem),
                   CLARIFY_OPTIONS, "proceed", UNREAD_WHY)


def clarify_closed(gh, rows, ready, now):
    """(the entries of `ready` that may launch, the clarify asks that
    hold the rest, problems): one issue read per item about to launch a
    run (#939: nine consumer items closed by other PRs still got paid
    retries and fresh spec launches). A merge turn is the Owner's
    answered consent, not a run, and is not read. Fail-closed: a state
    gh cannot read holds the item as a closed one does."""
    launch, asks = [], []
    for entry in ready:
        if entry["step"] == "merge":
            launch.append(entry)
            continue
        state, problems = issue_state(gh, entry["item"])
        if state == "open":
            launch.append(entry)
            continue
        asked, problems = clarify_ask(rows + asks, now, entry["item"], state,
                                      problems)
        if problems:
            return None, None, problems
        asks.append(asked)
    return launch, asks, []


def bookkeeping_due(rows):
    """[(item view, step, its completed run row)] for every stalled item
    whose retry answer is in and whose stall is a delivery failure of a
    completed run (conductor_flow.delivered_run): the Worker finished,
    so the retry is this turn's, never a launch (#939). PURE."""
    read = view(rows)
    due = []
    for entry in (read["plan"] or {}).get("items", []):
        found = read["items"][entry["item"]]
        if found["state"] != "stalled" or not found["retry"]:
            continue
        run = flow.delivered_run(rows, found)
        if run is not None:
            due.append((found, found["last"]["from"], run))
    return due


def _spend_committed(git, root, batch, worktree, branch, item, run, now):
    """(stall reason or None, problems): the run's spend row committed
    on its item branch. Already there by its commit subject: nothing.
    A row the worktree holds (the runner wrote it; its commit failed):
    committed as it is. Neither: re-metered from the result event the
    runner kept under runs/ and recorded under the item key — which
    breakdown row a build was briefed with is not recorded — or a stall
    reason when that event is gone too."""
    run_id = run["run_id"]
    subjects, problems = run_commits(git, branch)
    if problems:
        return None, [f"cd: {item}: {problems[0]}"]
    if run_id in map(spend_run, subjects):
        return None, []
    if (worktree / cost_ledger.run_ledger_path(run_id)).is_file():
        return commit_spend(git, worktree, run_id), []
    kept = Path(root) / RUNS.format(batch=batch) / f"{run_id}.json"
    metered, error = read_execution(kept)
    if error:
        return (f"no spend row of {run_id} to commit, and its result event"
                f" cannot be metered: {error}"), []
    tokens, cost = metered
    return record_spend(git, worktree, item, run_id, run["model"], tokens,
                        cost, run["outcome"], now), []


def retry_bookkeeping(git, gh, root, batch, rows, now, due):
    """(rows to write, problems): the bookkeeping turn of every item in
    `due` (bookkeeping_due) — its spend row committed, its branch
    pushed, its PR opened or updated from the pr-body.md the runner
    kept — then a resume row to the step, carrying the completed run's
    id so the item reads as finished and `survey` advances it. A
    failure stalls the item again with the failed command's own words
    (delivery-failed, retry offered, no band bump); a missing worktree
    or an unreadable branch log is a problem that writes nothing."""
    written = []
    for found, step, run in due:
        item, run_id, entry = found["item"], run["run_id"], found["entry"]
        problems = flow.transition_problems(rows + written, item, step,
                                            {"run_id": run_id})
        if problems:
            return None, problems
        worktree, problems = worktree_path(git, batch, item)
        if problems:
            return None, problems
        if not worktree.is_dir():
            return None, [f"cd: {item}'s worktree {worktree} is gone, so"
                          f" run {run_id}'s bookkeeping cannot be retried"]
        branch = item_branch(batch, item)
        failed, problems = _spend_committed(git, root, batch, worktree,
                                            branch, item, run, now)
        if problems:
            return None, problems
        failed = failed or deliver(git, gh, worktree, branch, item, batch)
        resumed = flow.state_row(now, item, "stalled", step,
                                 RESUMED.format(run_id=run_id),
                                 run_id=run_id)
        if failed is None:
            (worktree / PR_BODY_FILE).unlink(missing_ok=True)
            written.append(resumed)
            continue
        stalled, problems = flow.stall_rows(
            rows + written + [resumed], now, entry, failed,
            "delivery-failed", "retry", flow.DELIVERY_WHY)
        if problems:
            return None, problems
        written += [resumed, *stalled]
    return written, []


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
    for item in flow.shipped_items(rows):
        blobs, problems = flow.gate_blobs(git, item_branch(batch, item))
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
    for item in flow.standing_due(rows, facts, policy) if policy["enabled"] \
            else []:
        labels, problems = consent.issue_labels(gh, item, policy)
        if problems:
            return None, problems
        verdicts[item] = {"problems": consent.standing_problems(
            item, facts[item]["gate_blobs"], labels, policy),
            "labels": labels, "policy": policy}
    return verdicts, []


def landed_facts(gh, batch, rows):
    """({item: {"merged_pr": {"pr", "sha"} or None}}, problems): the
    merged PR of each item conductor_landed.due names (#938), one read
    each; a failed read fails the tick, as any fact's does."""
    facts = {}
    for item in landed.due(rows):
        found, problems = merged_pr(gh, item_branch(batch, item))
        if problems:
            return None, [f"cd: {problems[0]}"]
        facts[item] = {"merged_pr": found}
    return facts, []


def _facts(git, gh, batch, rows, policy):
    """(the branch, shipped, standing and merged-PR facts the survey
    reads, problems). An item whose bookkeeping is due reads its branch
    facts now, so the same tick advances it once resumed (#939)."""
    pending = [found["item"] for found, step, _ in bookkeeping_due(rows)
               if step in ("spec", "build")]
    facts, problems = flow.branch_facts(git, batch,
                                        flow.needs_facts(rows) + pending)
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
    landed, problems = landed_facts(gh, batch, rows)
    if problems:
        return None, problems
    for item, fact in landed.items():
        facts.setdefault(item, {}).update(fact)
    return facts, []


def advance(root, batch, now, wip_cap, alive, git, gh=None, policy=None):
    """(result, problems): `next`. Reads the facts, then under the
    ledger lock: holds a due bookkeeping item whose issue is closed,
    redoes the rest's bookkeeping, surveys, charges the lost runs, and
    reads the issue of every step about to launch. Writes the asks,
    resumes and consent rows together; any problem writes nothing."""
    rows, problems = load(root, batch)
    if problems:
        return None, problems
    policy = policy or {"enabled": False}
    facts, problems = _facts(git, gh, batch, rows, policy)
    if problems:
        return None, problems
    outcome = {}

    def build(rows):
        due = bookkeeping_due(rows)
        cleared, asked, problems = clarify_closed(
            gh, rows, [{"item": f["item"], "step": s} for f, s, _ in due],
            now)
        if problems:
            return None, problems
        ok = {entry["item"] for entry in cleared}
        resumed, problems = retry_bookkeeping(
            git, gh, root, batch, rows + asked, now,
            [d for d in due if d[0]["item"] in ok])
        if problems:
            return None, problems
        before = rows + asked + resumed
        ready, writes, problems = flow.survey(before, now, wip_cap, alive,
                                              facts, policy)
        if problems:
            return None, problems
        # The lost runs' ceilings land on their item branches before
        # their rows land here (#937): a failed charge writes nothing,
        # so the item stays in flight and its ceiling stays counted.
        problems = record_lost(git, batch, before, writes, now)
        if problems:
            return None, problems
        launch, held, problems = clarify_closed(gh, before + writes, ready,
                                                now)
        if problems:
            return None, problems
        written = asked + resumed + writes + held
        outcome.update(ready=launch, writes=written, rows=rows)
        return written, []
    _, problems = append(root, batch, build)
    if problems:
        return None, problems
    recorded = [row["id"] for row in outcome["writes"]
                if row["kind"] == "ask"]
    after = outcome["rows"] + outcome["writes"]
    return {"ask": next_ask(after), "ready": outcome["ready"],
            "recorded": recorded,
            "merge_due": flow.merge_due(after, facts, policy)}, []


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
