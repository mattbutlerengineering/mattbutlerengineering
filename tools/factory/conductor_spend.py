#!/usr/bin/env python3
"""conductor_spend: the spend row a Worker run leaves on its item branch
(PRD-0013), split from conductor_run by capability (breakdown assumption
6) when `next` became a second writer of that row (#937). It imports
conductor.py's row grammar and conductor_plan's checkout anchor, which
keep one owner each.

One run, one spend row, as its own file under docs/factory/costs/runs/
(cost_ledger.record_isolated), committed on the item branch under
SPEND_SUBJECT + the run id, which spend_run reads back: the subject
bounds one run's own commits on the branch (#725, #771). The runner
writes the row it metered. `next` writes one for a runner found dead
with no finishing run row, charged the step's full ceiling at zero
tokens, fail-closed like a wall-clock kill (CEILING_OUTCOME): the runner
held the whole spend in memory until the harness exited, and six runs
lost across two consumer batches read $0 to the cap, the scorecard and
calibrate (#937). The ceiling errs high, never at zero: the Worker's
own `claude` process runs in its own session (cli.harness_run) and may
spend up to that ceiling after the runner is gone.
"""
import cost_ledger
from cli import CLI_FAILURES, STDERR_TAIL, detail
from conductor import RUN_ID, item_branch, item_view, item_worktree
from conductor_plan import main_checkout

# A run's spend-row outcome when the figure is its ceiling, not a metered
# cost: the harness was killed at the wall clock, its result could not
# be metered, or its runner died before it could meter (#937).
CEILING_OUTCOME = {"timeout": "killed:cost-at-ceiling",
                   "unaccounted": "unaccounted:cost-at-ceiling",
                   "lost": "runner-lost:cost-at-ceiling"}
LOST = CEILING_OUTCOME["lost"]
# The subject of the spend commit each run ends with (record_spend): it
# bounds one run's own commits on the item branch, and spend_run reads
# it back.
SPEND_SUBJECT = "chore(cost): "


def git_call(git, args, what):
    """(stdout, problems) of one call at the Conductor's git port, a
    failure worded `<what> failed: <stderr tail>`: the last STDERR_TAIL
    lines, so a commit hook's own complaint or a push's rejection reason
    reaches the stall ask, not only the summary line under it (#939).
    The one wrapper the spend and delivery writes share."""
    try:
        return git(args).stdout, []
    except CLI_FAILURES as err:
        return None, [f"{what} failed: {detail(err, tail=STDERR_TAIL)}"]


def spend_run(subject):
    """The run id a spend commit's subject names, else None: the grammar
    record_spend writes, SPEND_SUBJECT + a run id (#771). A Worker's own
    `chore(cost): ...` commit names no run id, so it is work, not
    spend."""
    if not subject.startswith(SPEND_SUBJECT):
        return None
    run = subject[len(SPEND_SUBJECT):]
    return run if RUN_ID.fullmatch(run) else None


def worktree_path(git, batch, item):
    """(the item worktree's path under the main checkout, problems)."""
    checkout, problems = main_checkout(git)
    if problems:
        return None, problems
    return checkout / item_worktree(batch, item), []


def run_commits(git, branch, head=None):
    """(the subjects of the branch's commits beyond origin/main, newest
    first, problems): the one item-branch log read. `head` pins the
    commit read (a sha inspected for a leased delete); it defaults to
    the branch."""
    out, problems = git_call(git, ["log", "--format=%s",
                               f"origin/main..{head or branch}"],
                         f"reading {branch}'s commits")
    return (None, problems) if problems else (out.splitlines(), [])


def _ref_entries(git, ref, path, recursive=False):
    """(rows, problems a retry may fix, problems it cannot) for one path
    on `ref`. An absent path holds none. A directory is listed with -r so
    the blobs under it are shown, not the tree itself. A malformed file
    is never read as empty, and it fails before any later file."""
    args = ["ls-tree", *(["-r"] if recursive else []), "--name-only", ref,
            "--", path]
    listed, problems = git_call(git, args, f"cd: git ls-tree {ref}")
    if problems:
        return None, problems, []
    names = [line.strip() for line in listed.splitlines() if line.strip()]
    if not recursive:
        names = [path] if names else []
    entries = []
    for name in names:
        shown = f"{ref}:{name}"
        text, problems = git_call(git, ["show", shown], f"cd: git show {shown}")
        if problems:
            return None, problems, []
        for lineno, entry, suffixes in cost_ledger.parse(text):
            if suffixes:
                return None, [], [f"cd: {shown}:{lineno} {suffixes[0]}"]
            entries.append(entry)
    return entries, [], []


def ref_rows(git, ref):
    """(the spend rows the ref's cost ledger holds, problems a retry may
    fix, problems it cannot). The aggregate and every per-run file count.
    An absent aggregate holds none (#708): nothing seeds
    docs/factory/costs.jsonl in a consumer repo, so its first run finds
    none on main. A malformed aggregate fails before the run files are
    read, and a malformed run file is never read as empty."""
    entries, problems, malformed = _ref_entries(
        git, ref, cost_ledger.COST_LEDGER)
    if problems or malformed:
        return None, problems, malformed
    runs, problems, malformed = _ref_entries(
        git, ref, cost_ledger.RUNS_DIR, recursive=True)
    if problems or malformed:
        return None, problems, malformed
    return entries + runs, [], []


def record_spend(git, worktree, wo, run_id, model, tokens, cost, outcome,
                 now, skip_existing=False):
    """Commit the run's one spend row on the item branch, as its own file
    under docs/factory/costs/runs/ (cost_ledger.record_isolated). The
    shared aggregate is not touched, so parallel item branches do not
    conflict on it. A row the worktree already holds is refused — twice
    would double-count the run — unless `skip_existing`, for a file an
    earlier tick wrote and failed to commit. A stall reason on failure,
    else None."""
    refused = cost_ledger.record_isolated(worktree, cost_ledger.entry(
        wo, run_id, model, tokens, cost, outcome, now.strftime("%Y-%m-%d")),
        skip_existing=skip_existing)
    if refused:
        return (f"refusing to record the spend row of {run_id}: "
                + "; ".join(refused))
    return commit_spend(git, worktree, run_id)


def commit_spend(git, worktree, run_id):
    """Add and commit the run's spend file on the item branch under
    SPEND_SUBJECT + run id: the write's second half, and the half a
    bookkeeping turn redoes for a row an earlier commit left in the
    worktree (#939). A stall reason on failure, else None."""
    rel = cost_ledger.run_ledger_path(run_id)
    for args in (["add", rel],
                 ["commit", "-m", f"{SPEND_SUBJECT}{run_id}"]):
        _, problems = git_call(git, ["-C", str(worktree), *args],
                               f"committing the spend row of {run_id}")
        if problems:
            return problems[0]
    return None


def record_lost(git, batch, rows, writes, now):
    """(problems): a spend row for every lost run among `writes` — a run
    row whose outcome is LOST, which `next` writes for a runner found
    dead with no finishing run row (#937) — charged its step's full
    ceiling at zero tokens, on the item branch through record_spend, the
    one path a run's spend takes, so the cap, the scorecard and
    calibrate read it like any run's. The row's `wo` is the item: which
    breakdown row a lost build was briefed with is not recorded. A run
    the branch's log already names (a tick whose ledger append failed
    after the commit) is not charged again. A missing item worktree, or
    a failed read or commit, is a problem: nothing is written, and the
    item stays in flight with its ceiling counted, until the Owner sees
    it."""
    for row in writes:
        if row["kind"] != "run" or row["outcome"] != LOST:
            continue
        item, run_id = row["item"], row["run_id"]
        worktree, problems = worktree_path(git, batch, item)
        if problems:
            return problems
        if not worktree.is_dir():
            return [f"cd: {item}'s worktree {worktree} is gone, so its lost"
                    f" run {run_id} cannot be charged its ceiling"]
        subjects, problems = run_commits(git, item_branch(batch, item))
        if problems:
            return [f"cd: {item}: {problems[0]}"]
        if run_id in map(spend_run, subjects):
            continue
        if (worktree / cost_ledger.run_ledger_path(run_id)).is_file():
            # The runner metered and wrote its row, under the build's
            # work order, and died before the commit: that row is the
            # run's; a ceiling row under the item key would be a second
            # row_key and a double count (#939).
            failed = commit_spend(git, worktree, run_id)
        else:
            ceiling = item_view(rows, item)["steps"][row["step"]][
                "ceiling_usd"]
            failed = record_spend(git, worktree, item, run_id, row["model"],
                                  0, float(ceiling), LOST, now)
        if failed:
            return [f"cd: {item}: {failed}"]
    return []
