#!/usr/bin/env python3
"""conductor_merge: `conductor.py merge <batch> <item>` (PRD-0013,
WO-0160, WO-0161), split from conductor.py by capability (breakdown
assumption 6). It imports conductor.py's row grammar and
conductor_flow's state machine, which keep one owner.

The precondition is pure over the ledger's rows and the item branch's
gate blobs. An item merges only when it is reviewed with a pass verdict
from a reviewer run distinct from every author run, its ship step has
completed, and an answer covers it: its own merge ask answered `merge`,
or a train ask whose `covers` lists it answered `train`, with every
earlier item in that train already merged, or a standing consent row
that the opt-in policy still covers (ADR-0086). The merge turn also
holds the merged tree to the reviewed one: a turn starting from `ship`
stalls when anything but the review and ship artifacts changed after the
head the review run was launched on. An item whose branch changes
a gate file rides a train only when each gate file's blob id equals the
one approved at its gate asks; otherwise it needs its own merge ask
(ADR-0036 condition 3, as architecture.md reads it; drafted for the
Owner as provisional ADR-0085).

The turn runs in this plugin's repo and in a stamped consumer repo
alike (#678): its gate is factory.json's conductor.gate_command, and the
plugin-version bump and the manifest regeneration happen only in the
factory source repo, the one whose root holds factory_init.py beside
.claude-plugin/plugin.json. factory_init is root-only, so it is imported
only there.
"""
import json
import os
import re
import subprocess
import time
from collections import Counter
from pathlib import Path, PurePosixPath

import conductor_consent as consent
import conductor_flow as flow
import conductor_plan
import conductor_spend
import factory_config
from cli import CLI_FAILURES, detail, gh_read
from conductor import BLOCK, append, current_state, is_text, \
    item_view, load, stamp
from cost_ledger import ISSUE_KEY
from knowledge_plane import adr_citation, adr_digits, adr_file_number

def _refused(text):
    return [f"cd: merge refused: {text}"]


def _reviewed_problems(rows, item):
    """The reviewed-pass half of the precondition: the item's last
    `reviewed` row is a pass, and its reviewer run is none of the item's
    author runs (as recorded, and every non-review run in the ledger)."""
    found = item_view(rows, item)
    passes = [row for row in found["states"] if row["to"] == "reviewed"]
    if not passes or passes[-1].get("verdict") != "pass":
        return _refused(f"{item} has no reviewed pass")
    reviewer = passes[-1]["reviewer_run"]
    authors = set(passes[-1]["author_runs"]) | set(found["author_runs"])
    if reviewer in authors:
        return _refused(f"{item}'s reviewer run {reviewer} is among its"
                        " author runs")
    if not is_text(passes[-1].get("reviewed_head")):
        return _refused(f"{item}'s reviewed row records no reviewed head")
    return []


# What may change on the item branch after the review run's launch head:
# the review and ship steps' own artifacts, in the run directory whose
# VERIFICATION the item changed before the review, and spend rows
# appended to COSTS. Anything else was never reviewed (review major 1,
# re-review R4, breakdown Notes 2026-10-11).
COSTS = "docs/factory/costs.jsonl"
VERIFICATION = re.compile(r"docs/(?:(?:features|fixes)/[^/]+/)?"
                          r"verification\.md")
AFTER_REVIEW = ("review.md", "release.md")


def review_drift(item, head, changed, own_dirs, appended):
    """The stall reason when a path changed between the reviewed head and
    the branch other than a run directory in `own_dirs`' AFTER_REVIEW
    artifacts, or COSTS when `appended` (its old text is a prefix of its
    new one), else None. PURE."""
    allowed = {run_dir + name for run_dir in own_dirs
               for name in AFTER_REVIEW} | ({COSTS} if appended else set())
    unreviewed = sorted(path for path in changed if path not in allowed)
    if not unreviewed:
        return None
    return (f"{item} changed {', '.join(unreviewed)} after the review of"
            f" {head[:12]}; merged code must be reviewed code, so it needs"
            " a re-review")


def _shipped_problems(rows, item):
    """From `ship`, the ship step's finishing run must have completed."""
    found = item_view(rows, item)
    if found["state"] != "ship" or found["completed"]:
        return []
    return _refused(f"{item}'s ship step has not completed")


def merge_problems(rows, item, blobs, policy=None):
    """Problems refusing a merge of `item`, PURE over the ledger's rows,
    `blobs` ({gate path: blob id} the item branch changes) and the
    resolved standing-consent policy (None: off). Empty means the merge
    may proceed."""
    found = item_view(rows, item)
    if found["unknown"]:
        return [found["unknown"]]
    problems = (_reviewed_problems(rows, item)
                or _shipped_problems(rows, item)
                or flow.transition_problems(rows, item, "merging", {}))
    return problems or cover_problems(rows, item, blobs, policy)


def cover_problems(rows, item, blobs, policy=None):
    """The answer half of merge_problems: conductor_consent.cover's
    reasons, refused, unless it reads the item COVERED (ADR-0085,
    ADR-0086). Re-run after the merge turn updates the branch."""
    _, reasons = consent.cover(rows, item, blobs, policy)
    return [problem for reason in reasons for problem in _refused(reason)]


# --- the merge turn (WO-0161) ------------------------------------------

PLUGIN = ".claude-plugin/plugin.json"
MANIFEST = "factory/manifest.json"
VERSION = re.compile(r'("version"\s*:\s*")([^"]*)(")')
SEMVER = re.compile(r"(\d+)\.(\d+)\.(\d+)")
# lean: fixed waits (architecture.md); the trigger to tune one is a
# scorecard showing it fire on a healthy batch.
WAIT_MINUTES = 30
POLL_SECONDS = 30
GREEN = ("success", "skipped", "neutral")
RETRY = "retry"
QUEUE_QUERY = ("query($owner:String!,$name:String!){repository(owner:"
               '$owner,name:$name){mergeQueue(branch:"main"){id}}}')
PREFIXES = {"prd": "PRD", "adr": "ADR", "wo": "WO"}
DRIFT_WHY = ("the item has no path back to review, and a change nobody"
             " reviewed must not merge; block it and file the change anew")
RETRY_WHY = ("a timeout, an ejection or a failed call may be transient; the"
             " branch is left as pushed")
BLOCK_WHY = ("a non-mechanical merge failure needs a fix step or a human,"
             " not a blind retry; the branch is left as pushed")


class Stall(Exception):
    """A merge-turn step that cannot finish mechanically: the turn stops
    and queues a stall ask, recommending `retry` or `block`."""

    def __init__(self, reason, recommended=BLOCK):
        super().__init__(reason)
        self.reason, self.recommended = reason, recommended


def _git(git, worktree, args, what, recommended=BLOCK):
    try:
        return git(["-C", str(worktree), *args]).stdout
    except CLI_FAILURES as err:
        raise Stall(f"{what} failed: {detail(err, every_line=True)}",
                    recommended)


def factory_source(worktree):
    """True in this plugin's own repo: factory_init.py, which writes the
    manifest and is never mirrored, beside the plugin.json it pins. A
    consumer repo, plugin or not, has no factory_init.py at its root."""
    root = Path(worktree)
    return (root / "factory_init.py").is_file() and (root / PLUGIN).is_file()


def _regenerate(tool, worktree):
    try:
        tool(["python3", str(worktree / "factory_init.py"),
              "update-manifest"])
    except CLI_FAILURES as err:
        raise Stall(f"regenerating the manifest failed: {detail(err)}")


def _written(worktree, *paths):
    """The files the Conductor writes: `paths`, plus every payload
    mirror update-manifest refreshes. Staged by name, never with -A, so
    a file a Worker left behind is never swept into a Conductor commit
    (re-review R1)."""
    from factory_init import MIRRORS  # root-only: factory source only
    mirrors = [f"factory/templates/{rel}" for _, rel, _ in MIRRORS]
    return [path for path in [*paths, *mirrors]
            if (worktree / path).is_file()]


def update_branch(git, tool, worktree, branch):
    """Steps 1-2: merge origin/main into the item branch. Item branches
    do not edit docs/factory/costs.jsonl — spend is a per-run file — so a
    conflict in that aggregate is a real conflict and aborts. GitHub does
    not honor a merge=union driver. A conflict in the manifest alone is
    resolved by regeneration in the factory source repo; any other
    conflict, or a manifest conflict in a consumer repo, aborts the
    merge."""
    _git(git, worktree, ["fetch", "origin", "main"], "fetching origin/main",
         RETRY)
    try:
        git(["-C", str(worktree), "merge", "--no-edit", "origin/main"])
        return
    except CLI_FAILURES as err:
        failure = detail(err, every_line=True)
    conflicted = _git(git, worktree, ["diff", "--name-only",
                                      "--diff-filter=U"],
                      "listing conflicts").split()
    if conflicted != [MANIFEST] or not factory_source(worktree):
        if conflicted:
            # A merge git refused before starting (a dirty tracked file,
            # #726) left nothing to abort, and its reason is the stall.
            _git(git, worktree, ["merge", "--abort"], "aborting the merge")
        raise Stall(f"merging origin/main into {branch} conflicts in"
                    f" {', '.join(conflicted)}" if conflicted
                    else f"merging origin/main into {branch} failed:"
                    f" {failure}")
    _regenerate(tool, worktree)
    _git(git, worktree, ["add", "--", *_written(worktree, MANIFEST)],
         "staging the regenerated manifest")
    _git(git, worktree, ["commit", "--no-edit"],
         "committing the merge of origin/main")


def bump_version(git, tool, worktree, branch):
    """Step 3: when the item touched skills/ in the factory source repo,
    set the branch's plugin version to origin/main's with the patch part
    bumped, regenerate the manifest that pins it, and commit. The new
    version, or None; always None in a consumer repo (#678)."""
    if not factory_source(worktree):
        return None
    changed, problems = flow.changed_files(git, branch)
    if problems:
        raise Stall(problems[0][len("cd: "):], RETRY)
    if not any(path.startswith("skills/") for path in changed):
        return None
    shown = _git(git, worktree, ["show", f"origin/main:{PLUGIN}"],
                 f"reading origin/main's {PLUGIN}")
    try:
        current = json.loads(shown).get("version")
    except (ValueError, AttributeError):
        current = None
    parts = SEMVER.fullmatch(current) if isinstance(current, str) else None
    if parts is None:
        raise Stall(f"origin/main's plugin version {current!r} is not"
                    " MAJOR.MINOR.PATCH")
    major, minor, patch = parts.groups()
    version = f"{major}.{minor}.{int(patch) + 1}"
    path = worktree / PLUGIN
    text = path.read_text(encoding="utf-8")
    bumped = VERSION.sub(lambda m: m.group(1) + version + m.group(3), text,
                         count=1)
    if bumped == text:
        return None
    path.write_text(bumped, encoding="utf-8")
    _regenerate(tool, worktree)
    _git(git, worktree, ["add", "--",
                         *_written(worktree, PLUGIN, MANIFEST)],
         "staging the version bump")
    _git(git, worktree, ["commit", "-m",
                         f"chore(release): plugin version {version}"],
         "committing the version bump")
    return version


def _texts(git, worktree, path):
    """(origin/main's lines, the branch's lines) of one changed path: a
    path new on the item has no main lines; a deleted one no branch
    lines. surrogateescape round-trips any bytes the rewrite keeps."""
    try:
        main = git(["show", f"origin/main:{path}"]).stdout
    except CLI_FAILURES:
        main = ""
    head = worktree / path
    text = head.read_text(encoding="utf-8", errors="surrogateescape") \
        if head.is_file() else ""
    return main.splitlines(keepends=True), text.splitlines(keepends=True)


def added_marks(main_lines, head_lines):
    """For each branch line, True when the item added it: a line is
    main's while origin/main's copy of the file still has one unclaimed."""
    remaining = Counter(main_lines)
    marks = []
    for line in head_lines:
        marks.append(remaining[line] == 0)
        remaining[line] -= 1 if remaining[line] else 0
    return marks


def _token(kind, number):
    """A citation of NUMBER, its digits in group `num`: an ADR at any
    width it is written (#860), a PRD or WO at its 4 digits."""
    if kind == "adr":
        return adr_citation(number)
    return re.compile(rf"\b{PREFIXES[kind]}-(?P<num>{number:04d})\b")


def _adr_file(path):
    """adr_file_number's (number, written) for a repo-relative PATH in
    the ADR file set knowledge_plane.adr_paths reads (docs/adr/*.md),
    else None."""
    where = PurePosixPath(path)
    if str(where.parent) != "docs/adr" or where.suffix != ".md":
        return None
    return adr_file_number(where.name)


def _width(kind, number, new_paths):
    """The digits NUMBER is written at in a message: an ADR at the width
    of the item's ADR file of NUMBER (#860, #890), anything else at the
    4-digit grammar."""
    if kind == "adr":
        for path in new_paths:
            found = _adr_file(path)
            if found and int(found[0]) == number:
                return found[1]
    return "0000"


def _used(held, files, new_paths):
    """{kind: numbers} of the item's block it actually used: cited in a
    line it added, or naming an ADR file it added."""
    used = {}
    for kind, numbers in held.items():
        for number in sorted(numbers):
            cited = any(_token(kind, number).search(line)
                        for lines, marks in files.values()
                        for line, added in zip(lines, marks) if added)
            named = kind == "adr" and any(
                _adr_file(path) and int(_adr_file(path)[0]) == number
                for path in new_paths)
            if cited or named:
                used.setdefault(kind, []).append(number)
    return used


def _allocate(rows, on_main, collided, new_paths):
    """{kind: {old: new}}: each collided number moves to the next number
    above everything on origin/main and every block in the batch."""
    moves = {}
    for kind, numbers in collided.items():
        taken = set(on_main[kind]) | {
            value for row in rows if row["kind"] == "reserve"
            and row["what"] == kind for value in row["values"]}
        top = max(taken, default=0)
        for number in numbers:
            top += 1
            if top > 9999:
                written = _width(kind, number, new_paths)
                raise Stall(f"{PREFIXES[kind]}-"
                            f"{adr_digits(number, written)} is taken on"
                            " origin/main and cannot be renumbered:"
                            f" {PREFIXES[kind]}-{top} would leave the"
                            " 4-digit grammar")
            moves.setdefault(kind, {})[number] = top
    return moves


def _rewrite(line, moves, stems):
    for kind, pairs in moves.items():
        for old, new in pairs.items():
            # Each citation keeps the width it is written at (#860).
            line = _token(kind, old).sub(
                lambda cited, kind=kind, new=new:
                f"{PREFIXES[kind]}-{adr_digits(new, cited['num'])}", line)
    for old, new in stems.items():
        line = line.replace(old, new)
    return line


def _renumber(git, worktree, files, new_paths, moves):
    """Rename the item's ADR files and rewrite every line it added, then
    commit. Lines that are origin/main's are never touched."""
    renames = {}
    for path in new_paths:
        number, written = _adr_file(path) or (None, None)
        if number is not None and int(number) in moves.get("adr", {}):
            # The name's first digits are its number (ADR_FILE's prefix
            # holds none), renamed at the width they are written (#860).
            new = adr_digits(moves["adr"][int(number)], written)
            renames[path] = ("docs/adr/" + PurePosixPath(path).name
                             .replace(written, new, 1))
    for old, new in renames.items():
        if (worktree / new).exists():
            raise Stall(f"{old} cannot be renumbered: {new} already exists")
        _git(git, worktree, ["mv", old, new], f"renaming {old}")
    stems = {Path(old).stem: Path(new).stem for old, new in renames.items()}
    touched = list(renames.values())
    for path, (lines, marks) in files.items():
        rewritten = [_rewrite(line, moves, stems) if added else line
                     for line, added in zip(lines, marks)]
        if rewritten != lines:
            target = renames.get(path, path)
            (worktree / target).write_text("".join(rewritten),
                                           encoding="utf-8",
                                           errors="surrogateescape")
            touched.append(target)
    _git(git, worktree, ["add", "--", *sorted(set(touched))],
         "staging the renumber")
    spans = ", ".join(
        f"{PREFIXES[kind]}-{adr_digits(old, written)} to"
        f" {PREFIXES[kind]}-{adr_digits(new, written)}"
        for kind, pairs in moves.items() for old, new in pairs.items()
        for written in [_width(kind, old, new_paths)])
    _git(git, worktree, ["commit", "-m", f"chore(conductor): renumber {spans}"],
         "committing the renumber")


def confirm_reservations(rows, item, git, worktree, branch):
    """Step 4: every reserved number the item used must still be free on
    origin/main. A collision is renumbered mechanically (file name, and
    every line the item added); returns the reserve rows' fields
    ({what, values, renumbered_from}) for each renumbered kind."""
    live = item_view(rows, item)["reserved"]
    held = {kind: set(live.get(kind, ())) for kind in PREFIXES}
    if not any(held.values()):
        return []
    on_main, problems = conductor_plan.ids_on_main(git)
    if not problems:
        changed, problems = flow.changed_files(git, branch)
    if problems:
        raise Stall(problems[0][len("cd: "):], RETRY)
    files, new_paths = {}, []
    for path in changed:
        main_lines, head_lines = _texts(git, worktree, path)
        if not main_lines and head_lines:
            new_paths.append(path)
        files[path] = (head_lines, added_marks(main_lines, head_lines))
    collided = {kind: [n for n in numbers if n in on_main[kind]]
                for kind, numbers in _used(held, files, new_paths).items()}
    collided = {kind: numbers for kind, numbers in collided.items()
                if numbers}
    if not collided:
        return []
    moves = _allocate(rows, on_main, collided, new_paths)
    _renumber(git, worktree, files, new_paths, moves)
    return [{"what": kind, "values": list(pairs.values()),
             "renumbered_from": list(pairs)}
            for kind, pairs in moves.items()]


def _read(gh, args, operation, expect=dict):
    """A gh read's value, or a retry stall naming why it failed."""
    result = gh_read(args, operation, run=gh, expect=expect)
    if result.problems:
        raise Stall(result.problems[0], RETRY)
    return result.value


def pr_number(gh, branch):
    listed = _read(gh, ["pr", "list", "--head", branch, "--state", "open",
                        "--json", "number"], "gh pr list", expect=list)
    if len(listed) != 1 or not isinstance(listed[0], dict) \
            or not isinstance(listed[0].get("number"), int):
        raise Stall(f"{branch} has {len(listed)} open PRs, not one")
    return listed[0]["number"]


def _check_runs(value):
    runs = value.get("check_runs")
    if not (isinstance(runs, list) and all(
            isinstance(run, dict) and is_text(run.get("name"))
            for run in runs)):
        raise Stall("gh api check-runs returned unreadable check runs",
                    RETRY)
    return runs


def wait_checks(gh, sha, clock, sleep):
    """Step 7: {check name: conclusion} once every check run on the new
    head has completed green. A red run stalls at once; none finishing
    within WAIT_MINUTES stalls as a timeout."""
    started = clock()
    while True:
        runs = _check_runs(_read(
            gh, ["api", f"repos/{{owner}}/{{repo}}/commits/{sha}/check-runs"
                 "?per_page=100"], f"gh api check-runs for {sha[:12]}"))
        red = sorted(run["name"] for run in runs
                     if run.get("status") == "completed"
                     and run.get("conclusion") not in GREEN)
        if red:
            raise Stall(f"checks failed on {sha[:12]}: {', '.join(red)}")
        if runs and all(run.get("status") == "completed" for run in runs):
            return {run["name"]: run["conclusion"] for run in runs}
        if (clock() - started).total_seconds() >= WAIT_MINUTES * 60:
            raise Stall(f"checks on {sha[:12]} did not finish within"
                        f" {WAIT_MINUTES} minutes", RETRY)
        sleep(POLL_SECONDS)


def has_queue(gh):
    """True when main has a merge queue (mergeQueue(branch: "main") is
    non-null), read at merge time."""
    value = _read(gh, ["api", "graphql", "-f", f"query={QUEUE_QUERY}",
                       "-F", "owner={owner}", "-F", "name={repo}"],
                  "gh api graphql mergeQueue")
    repository = (value.get("data") or {}).get("repository")
    if not isinstance(repository, dict):
        raise Stall("gh api graphql mergeQueue named no repository", RETRY)
    return repository.get("mergeQueue") is not None


def land(gh, pr, head, queued, clock, sleep):
    """Step 8: squash-merge the checked head, or, with a queue, enqueue
    it (gh pr merge enqueues when main requires a queue, which then owns
    the strategy) and wait for merged or ejected. The merge sha."""
    try:
        gh(["pr", "merge", str(pr), "--squash", "--match-head-commit",
            head])
    except CLI_FAILURES as err:
        raise Stall(f"gh pr merge #{pr} failed: {detail(err)}", RETRY)
    started = clock()
    while True:
        view = _read(gh, ["pr", "view", str(pr), "--json",
                          "state,mergeCommit,isInMergeQueue"],
                     f"gh pr view #{pr}")
        state = view.get("state")
        if state == "MERGED":
            sha = (view.get("mergeCommit") or {}).get("oid")
            if not is_text(sha):
                raise Stall(f"PR #{pr} merged with no merge commit sha",
                            RETRY)
            return sha
        if state != "OPEN":
            raise Stall(f"PR #{pr} is {str(state).lower()}, not merged")
        if not queued:
            raise Stall(f"PR #{pr} is still open after gh pr merge", RETRY)
        if not view.get("isInMergeQueue"):
            raise Stall(f"PR #{pr} was ejected from the merge queue")
        if (clock() - started).total_seconds() >= WAIT_MINUTES * 60:
            raise Stall(f"PR #{pr} did not merge from the queue within"
                        f" {WAIT_MINUTES} minutes", RETRY)
        sleep(POLL_SECONDS)


def main_head(git, worktree):
    """origin/main's sha as last fetched: the base a caller passes to
    land_branch once it merged that main into the branch."""
    return _git(git, worktree, ["rev-parse", "origin/main"],
                "reading origin/main", RETRY).strip()


def _main_held(git, worktree, base):
    """Stalls, recommending a retry, when origin/main moved off `base`,
    the main merged into the head the checks ran on (review minor 4).
    Without a queue the squash lands on whatever main is then, so a
    merge that landed during the wait would go unchecked against this
    item. --match-head-commit pins only the PR head. A queue checks the
    merge-result commit itself, so this runs only without one. The
    window left is the moment between this read and the squash."""
    _git(git, worktree, ["fetch", "origin", "main"], "fetching origin/main",
         RETRY)
    moved = main_head(git, worktree)
    if moved != base:
        raise Stall(f"origin/main moved from {base[:12]} to {moved[:12]}"
                    " while the checks ran; a retry merges it in and"
                    " checks again", RETRY)


def land_branch(git, gh, worktree, branch, base, clock, sleep):
    """(pr, sha, checks): push `branch`, wait for green checks on its
    head, then land that head, or raise Stall. `base` is the origin/main
    the caller merged into the branch; without a merge queue main must
    still be there when the checks finish (ADR-0086: the check runs on
    the updated head). The one owner of landing a checked head (#770):
    the merge turn and the closing merge both call it."""
    _git(git, worktree, ["push", "origin", branch], f"pushing {branch}",
         RETRY)
    head = _git(git, worktree, ["rev-parse", "HEAD"], "reading HEAD").strip()
    pr = pr_number(gh, branch)
    checks = wait_checks(gh, head, clock, sleep)
    queued = has_queue(gh)
    if not queued:
        _main_held(git, worktree, base)
    return pr, land(gh, pr, head, queued, clock, sleep), checks


def _on_main(git, worktree, head):
    """True when `head` is an ancestor of a freshly fetched origin/main;
    `merge-base --is-ancestor` exits 1 for not, any other failure stalls."""
    _git(git, worktree, ["fetch", "origin", "main"], "fetching origin/main",
         RETRY)
    try:
        git(["-C", str(worktree), "merge-base", "--is-ancestor", head,
             "origin/main"])
    except CLI_FAILURES as err:
        if getattr(err, "returncode", None) == 1:
            return False
        raise Stall("reading whether origin/main holds"
                    f" {head[:12]} failed: {detail(err)}", RETRY)
    return True


def landed_by_repo(git, gh, worktree, branch):
    """(pr, sha) when the repo itself (its auto-merge) already merged
    `branch`'s PR carrying the head this worktree pushed, None when no PR
    of the branch merged (#807). Its head is that head (a squash), or
    that head is on origin/main (a merge commit); a PR merged without it
    stalls naming the gap."""
    listed = _read(gh, ["pr", "list", "--head", branch, "--state", "merged",
                        "--json", "number,headRefOid,mergeCommit"],
                   "gh pr list --state merged", expect=list)
    if not listed:
        return None
    merged = listed[0] if isinstance(listed[0], dict) else {}
    pr, at = merged.get("number"), merged.get("headRefOid")
    sha = (merged.get("mergeCommit") or {}).get("oid")
    if not (isinstance(pr, int) and is_text(at) and is_text(sha)):
        raise Stall(f"gh pr list named an unreadable merged PR of {branch}",
                    RETRY)
    head = _git(git, worktree, ["rev-parse", "HEAD"], "reading HEAD").strip()
    if at != head and not _on_main(git, worktree, head):
        raise Stall(f"PR #{pr} was merged by the repo at {at[:12]}, without"
                    f" {head[:12]}, the head the Conductor pushed: what"
                    " that head adds is missing from main")
    return pr, sha


def _reserve(root, batch, clock, item, fields):
    _, problems = append(root, batch, lambda rows: (
        [{"at": stamp(clock()), "kind": "reserve", "item": item, **one}
         for one in fields], []))
    return problems


def _turn(root, batch, item, ports, worktree, gate, policy):
    """Steps 1-8 on a turn already moved to `merging`. (pr, sha, checks),
    or raises Stall; ledger problems are returned as the last value.
    `gate` is the gate command's argv, run in the item worktree;
    `policy` the standing-consent policy the cover is re-checked under."""
    git, gh, tool, clock, sleep = ports
    branch = flow.item_branch(batch, item)
    update_branch(git, tool, worktree, branch)
    base = main_head(git, worktree)
    version = bump_version(git, tool, worktree, branch)
    rows, problems = load(root, batch)
    if problems:
        return None, problems
    renumbered = confirm_reservations(rows, item, git, worktree, branch)
    fields = renumbered + ([{"what": "plugin-version",
                             "values": [version]}] if version else [])
    problems = _reserve(root, batch, clock, item, fields) if fields else []
    if problems:
        return None, problems
    blobs, problems = flow.gate_blobs(git, branch)
    if problems:
        raise Stall(problems[0][len("cd: "):], RETRY)
    changed = cover_problems(rows, item, blobs, policy)
    if changed:
        raise Stall(changed[0][len("cd: "):])
    try:
        tool(gate, cwd=str(worktree))
    except CLI_FAILURES as err:
        raise Stall(f"{' '.join(gate)} failed on {branch}: {detail(err)}")
    pr, sha, checks = land_branch(git, gh, worktree, branch, base, clock,
                                  sleep)
    return {"pr": pr, "sha": sha, "checks": checks}, []


def _drift(rows, item, git, branch, worktree):
    """(stall reason or None, problems): the reviewed-tree check, run on
    a turn that starts from `ship`, before the Conductor's own commits.
    A turn resumed from a stalled merge skips it: the state machine runs
    no Worker between a `merging` stall and its resumed turn, and the
    first turn already checked. A tree diff, so rewritten history is
    caught as well as new commits; and a clean worktree, so nothing a
    Worker left uncommitted can reach a Conductor commit (re-review R1)."""
    if current_state(rows, item) != "ship":
        return None, []
    try:
        status = git(["-C", str(worktree), "status", "--porcelain",
                      "--untracked-files=all"]).stdout
    except CLI_FAILURES as err:
        return None, [f"cd: git status in {worktree} failed:"
                      f" {detail(err, every_line=True)}"]
    dirty = sorted(line[3:] for line in status.splitlines() if line)
    if dirty:
        return (f"{item}'s worktree holds changes no commit carries:"
                f" {', '.join(dirty)}; merged code must be reviewed code,"
                " so it needs a re-review"), []
    head = [row for row in item_view(rows, item)["states"]
            if row["to"] == "reviewed"][-1]["reviewed_head"]
    try:
        changed = git(["diff", "--name-only", head, branch]).stdout.split()
        verified = git(["diff", "--name-only",
                        f"origin/main...{head}"]).stdout.split()
    except CLI_FAILURES as err:
        return None, [f"cd: git diff {head[:12]} {branch} failed:"
                      f" {detail(err, every_line=True)}"]
    own_dirs = {path[:-len("verification.md")] for path in verified
                if VERIFICATION.fullmatch(path)}
    grown = _show(git, branch, COSTS) if COSTS in changed else None
    appended = grown is not None and grown.startswith(
        _show(git, head, COSTS) or "")
    return review_drift(item, head, changed, own_dirs, appended), []


def _show(git, ref, path):
    """`path`'s text at `ref`, or None when it is absent there."""
    try:
        return git(["show", f"{ref}:{path}"]).stdout
    except CLI_FAILURES:
        return None


def merge_turn(root, batch, item, clock, git, gh, tool, sleep, pid=None,
               config=None):
    """(summary, problems): one merge turn. problems when the
    precondition refuses (nothing is touched) or a ledger write fails;
    a turn that cannot finish mechanically queues a stall ask and leaves
    the branch as pushed — never a forced push, never a retry. `config`
    is the batch root's factory config (None reads as empty: every
    optional table at its default)."""
    gate, problems = factory_config.resolve_gate_command(config or {})
    policy, found = factory_config.resolve_standing_consent(config or {})
    if problems or found:
        return None, problems + found
    rows, problems = load(root, batch)
    if problems:
        return None, problems
    blobs, problems = flow.gate_blobs(git, flow.item_branch(batch, item))
    if problems:
        return None, problems
    problems = merge_problems(rows, item, blobs, policy)
    if problems:
        return None, problems
    worktree, problems = conductor_spend.worktree_path(git, batch, item)
    if not problems and not worktree.is_dir():
        problems = [f"cd: no item worktree at {worktree}"]
    if problems:
        return None, problems
    drift, problems = _drift(rows, item, git, flow.item_branch(batch, item),
                             worktree)
    if problems:
        return None, problems
    if drift is not None:
        _, problems = flow.queue_stall(root, batch, clock(), item, drift,
                                       "merge-drift", BLOCK, DRIFT_WHY)
        return {"item": item, "stall": drift}, problems
    # The turn's pid lets `next` stall a turn that died mid-way.
    _, problems = flow.move(root, batch, clock(), item, "merging",
                            "merge turn",
                            pid=os.getpid() if pid is None else pid)
    if problems:
        return None, problems
    try:
        merged, problems = _turn(root, batch, item,
                                 (git, gh, tool, clock, sleep), worktree,
                                 gate, policy)
    except Stall as stall:
        _, problems = flow.queue_stall(
            root, batch, clock(), item, stall.reason, "merge-failed",
            stall.recommended,
            RETRY_WHY if stall.recommended == RETRY else BLOCK_WHY)
        return {"item": item, "stall": stall.reason}, problems
    if problems:
        return None, problems
    _, problems = flow.move(root, batch, clock(), item, "merged",
                            f"merged as {merged['sha']}", **merged)
    return {"item": item, "stall": None, **merged}, problems


def run_tool(argv, cwd=None):
    """The tool port: run argv (in `cwd`), raising CLI_FAILURES."""
    return subprocess.run(argv, check=True, capture_output=True, text=True,
                          cwd=cwd)


def merge_cli(root, args, clock, git, gh, tool=None, sleep=None):
    if len(args) != 2 or not ISSUE_KEY.fullmatch(args[1]):
        return None
    config, problems = factory_config.load(root)
    if problems:
        return problems
    summary, problems = merge_turn(
        root, args[0], args[1], clock, git, gh, tool or run_tool,
        sleep or time.sleep, config=config)
    if summary is not None:
        print(f"cd: merge of {summary['item']} stalled: {summary['stall']}"
              if summary["stall"] else
              f"cd: merged {summary['item']} as {summary['sha']}"
              f" (PR #{summary['pr']})")
    return problems
