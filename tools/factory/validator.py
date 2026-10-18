#!/usr/bin/env python3
"""validator: the brain behind .github/workflows/validator.yml and the
assembler workflow's claim step (PRD-0001; ADR-0032 lifecycle labels,
ADR-0033 gate 3).

The workflows name no repo tool of their own — every tool invocation goes
through a `make` target, because the Makefile is the seam that knows where
a repo keeps its tools (root here, tools/factory/ there) — and the ones
that need judgment land here. The shell plumbing AROUND those targets is
not a tool and does not move between repos: gh, git, and the review job's
exit-code capture stay in the workflow. The PR-shaped legs read the
pull_request event payload (GITHUB_EVENT_PATH), and pr-event below writes
the one a dispatched run stands in for; the claim leg is handed its issue
number outright. All reach GitHub through the gh CLI, which is injected so
tests never touch the network (same shape as label_sync.py).
Conventions match gates.py/label_sync.py: functions return V:-prefixed
problem strings; the CLI prints them and exits nonzero.

  python3 validator.py pr-event --pr <N> --out <path>
        The dispatch shim (WO-0030). GitHub suppresses the pull_request
        event for a PR the factory's own token opened, so the validator is
        dispatched against a PR NUMBER — and the legs below still need an
        event to read. Write the payload cli.read_event will hand them.
        One owner for a shape three workflow steps used to build by hand.

  python3 validator.py review --findings <file> [--status <rc>]
        Post the check run's output on the PR as review findings, from an
        actor that is not the PR's author — PRD-0001: no work is verified by
        the agent that produced it. The reviewing identity is derived from
        the TOKEN (see reviewer_login), not from a variable that declares it;
        anything unresolved or self-reviewing refuses to post (nonzero,
        nothing said). Red findings are posted and do NOT fail the review
        job: failing the build is the check job's work, and a reviewer that
        goes silent on red is useless.

  python3 validator.py pr-merged
        The merge leg. Make wo:merged the only wo: lifecycle label on the
        work order's mirrored issue (ADR-0032: exactly one at a time). The
        issue number comes from the breakdown row, never from the issue
        itself — the knowledge plane is authoritative and the mirror is
        one-way.

  python3 validator.py pr-opened
        The PR-open leg: wo:needs-review, the same PR-shaped resolution.

        Both PR legs skip an uncited PR (ADR-0057), so a PR citing no work
        order is a silent no-op on each — human housekeeping PRs are
        normal traffic, not errors. "Citing" means naming one OUTSIDE
        quoted material (ADR-0064): a token in a fenced block or a
        blockquote is something the PR is discussing. A PR that NAMES a
        work order in its own prose and resolves none stays a problem on
        both. The rule is the verb's, not the caller's: there is no flag
        to forget (#302-#306 were a recipe that forgot one).

  python3 validator.py claim <N>
        The dispatch claim: flip KNOWN issue N (no PR to resolve) to
        wo:in-progress and write transitioned=true/false to
        $GITHUB_OUTPUT — true only when the flip took the order out of
        wo:ready-for-agent, which is the assembler's idempotency verdict
        (a repeat label event gets false and the paid agent step is
        skipped).

  python3 validator.py fail <N>
        The dispatch failure leg: the same KNOWN-issue flip, to wo:failed,
        writing no verdict. The assembler runs it from a failure() step,
        so an order whose agent run died lands on wo:failed instead of
        sitting on wo:in-progress forever — the state both the gate digest
        and the improvement routine read as work still in flight.

  python3 validator.py lifecycle --label <label> [--issue <N> [--verdict skip]
                                                  | --uncited skip]
        The grammar before the verbs, where the recipe named the label and
        a flag picked the leg. Kept as an alias because factory-init
        update never refreshes a stamped Makefile
        (docs/kb/stamp-outside-payload.md); remove it once stamped
        Makefiles call the verbs.

Which lifecycle labels machinery writes, and which it deliberately does
not (ADR-0045). The assembler claims (wo:in-progress) and reports its own
failures (wo:failed); the PR legs above record the merge queue
(wo:needs-review) and its exit (wo:merged). The three gate labels are
applied by the humans who pass the gates. wo:blocked is human- or
Planner-applied by design: it means an unmet dependency, and that graph
lives in the issue tracker, not in CI. No workflow flips it — its absence
from this file is a decision, not a hole.
"""
import json
import os
import re
import sys
import tempfile
from pathlib import Path

import assembler
import gates
import label_sync
from cli import CLI_FAILURES as GH_FAILURES
from cli import detail as gh_detail
from cli import gh_read, gh_runner, label_names, report, write_outputs
from human_gates import GATES
from knowledge_plane import (CLOSES_TOKEN, WO_TOKEN, repo_root, unfenced,
                             work_orders)

LIFECYCLE_PREFIX = "wo:"
# The labels the two dispatch legs write — the assembler's claim and its
# failure report (ADR-0045). Named here, by the verbs that write them, so
# detector J reads them off this module (LABELS, below) rather than off a
# Makefile recipe.
CLAIM_LABEL = "wo:in-progress"
FAILED_LABEL = "wo:failed"
# The two PR legs write the merge gate's labels: opening a PR enters its
# queue, merging it is the pass. human_gates owns that vocabulary, so the
# legs and the gate digest cannot name different labels.
MERGE_GATE = next(gate for gate in GATES if gate.name == "merge")
# Every label the lifecycle verbs write, for detector J
# (gates.label_declarers): a taxonomy missing one fails a verb at CI time.
LABELS = (CLAIM_LABEL, FAILED_LABEL, MERGE_GATE.queue, MERGE_GATE.passed)
# The dispatch-queue state (ADR-0032) is assembler.READY_LABEL. The
# claim's idempotency verdict is "did THIS event take the order out of
# ready" — so the label is named, not inferred from the taxonomy's
# ordering, and named by its one owner, the declaration detector J reads.
# The row and tracker-mirror grammars are knowledge_plane's — the same
# rules the assembler dispatches with, so the two cannot diverge
# (ADR-0039).
REVIEW_MARKER = "<!-- factory-review -->"
MAX_FINDINGS_CHARS = 12000
# Who a workflow's own GITHUB_TOKEN posts as. GitHub fixes this — it is a
# property of the token, not a setting, which is what makes it safe to assume
# when no FACTORY_REVIEW_TOKEN was supplied.
GITHUB_TOKEN_LOGIN = "github-actions[bot]"


def lifecycle_labels(root):
    """(the wo: state machine's labels in taxonomy order, problems)."""
    labels, problems = label_sync.load_labels(root)
    names = [name for name in label_names(labels)
             if name.startswith(LIFECYCLE_PREFIX)]
    return names, problems


def tracker_issue(root, wo):
    """(the work order's mirrored issue number, problems), read from its
    breakdown row — ADR-0032: the dispatch mirror is one-way, so the
    knowledge plane, not the issue, says which issue a work order owns.
    Read from knowledge_plane.work_orders (issue #857): a row another
    row duplicates names no issue to act on."""
    index, _ = work_orders(root)
    row = index["wo"].get(wo)
    if row is None:
        return None, [f"V: {wo} has no breakdown row"]
    if row["clashes"]:
        return None, [f"V: {clash}" for clash in row["clashes"]]
    if row["issue"] is None:
        return None, [f"V: {wo} has no (tracker: #N) mirror on its"
                      " breakdown row"]
    return row["issue"], []


def transition(current, lifecycle, label):
    """(add, remove) making `label` the issue's only lifecycle label.
    Orthogonal families (size/risk/type/source/flags) are never touched."""
    add = [] if label in current else [label]
    remove = [name for name in current
              if name in lifecycle and name != label]
    return add, remove


def reviewer_login(env, run):
    """(the login the review token actually posts as, problems).

    The TOKEN is the authority, never a human-maintained variable. A declared
    login proves nothing about who the token posts as, and the moment the two
    disagree PRD-0001's non-authoring property lapses SILENTLY: point
    FACTORY_REVIEW_TOKEN at the assembler bot's PAT, leave FACTORY_REVIEW_LOGIN
    unset, and a guard that compares the author against the declaration sees
    two different strings, posts, and reports success — while the bot reviews
    its own PR.

    Two token provenances, both derived, and the caller must DECLARE which:
      - FACTORY_REVIEW_TOKEN_SET=false: GH_TOKEN is the workflow's own
        GITHUB_TOKEN, whose posting identity GitHub fixes at
        GITHUB_TOKEN_LOGIN. Asking it is pointless — `gh api user` needs a
        user-scoped token.
      - FACTORY_REVIEW_TOKEN_SET=true: ask the token who it is.
    An ABSENT flag is not "false". Inside validator.yml both env values come
    from one condition and cannot disagree, but any OTHER caller of `make
    review` in a stamped repo (WO-0005's assembler running a re-review job
    with its PAT in GH_TOKEN) would otherwise reintroduce the original bug
    verbatim: a reviewer ASSERTED to be github-actions[bot] while posting as
    factory-bot. Detector E pins factory/templates/**, not a downstream
    repo's other workflows, so nothing else would catch it.

    An identity that cannot be resolved fails CLOSED — the caller posts
    nothing. A reviewer who cannot be named cannot be shown to differ from
    the author, and an unnamed reviewer is exactly the failure this guards.
    """
    provenance = env.get("FACTORY_REVIEW_TOKEN_SET", "").strip().lower()
    if provenance not in ("true", "false"):
        return None, ["V: the review step did not declare the token's"
                      " provenance (FACTORY_REVIEW_TOKEN_SET) — refusing"
                      " to post"]
    if provenance == "false":
        return GITHUB_TOKEN_LOGIN, []
    try:
        login = run(["api", "user", "--jq", ".login"]).strip()
    except GH_FAILURES as err:
        return None, ["V: cannot resolve the reviewing identity from"
                      " FACTORY_REVIEW_TOKEN (gh api user failed:"
                      f" {gh_detail(err)}) — refusing to post"]
    if not login:
        return None, ["V: FACTORY_REVIEW_TOKEN resolves to no login —"
                      " refusing to post"]
    return login, []


def actor_conflict(author, reviewer):
    """PRD-0001: no work is verified by the agent that produced it. An
    unnamed actor on EITHER side is a conflict too — a name that is not there
    compares unequal to every login, so the guard would pass on nothing
    rather than on a demonstrated difference."""
    if not reviewer.strip():
        return ["V: the reviewing actor is unnamed — no identity was resolved"
                " from the review token"]
    if not author.strip():
        return ["V: the PR's author is unnamed — an author who cannot be"
                " named cannot be shown to differ from the reviewer"]
    if author.strip().lower() == reviewer.strip().lower():
        return [f"V: {author} authored this PR and cannot review it —"
                " generation and verification must be separate actors (give"
                " the reviewer its own identity: FACTORY_REVIEW_TOKEN)"]
    return []


def declared_conflict(declared, reviewer):
    """FACTORY_REVIEW_LOGIN, if set, is an optional cross-check on the
    identity the token resolved to — never the authority. When it disagrees,
    the configuration is lying about who reviews, and a guard that cannot
    trust its own configuration stops rather than posts."""
    declared = declared.strip()
    if declared and declared.lower() != reviewer.strip().lower():
        return [f"V: FACTORY_REVIEW_LOGIN declares {declared} but the review"
                f" token posts as {reviewer} — refusing to post until the"
                " declaration matches the token"]
    return []


def render_findings(wo, author, reviewer, output, status):
    """The review comment body: who reviewed whom, the verdict, and the
    literal output that produced it (truncated, never summarised away).

    The output is untrusted text (ADR-0098), so its fence is one backtick
    longer than the longest backtick run inside it (minimum three): by
    CommonMark, no line of the output can close the block and write prose
    in the reviewer's voice."""
    verdict = "PASS" if status == 0 else "FAIL"
    if len(output) > MAX_FINDINGS_CHARS:
        output = (output[:MAX_FINDINGS_CHARS]
                  + "\n… truncated; see the check job's log for the rest.\n")
    longest = max((len(run) for run in re.findall(r"`+", output)), default=0)
    fence = "`" * max(3, longest + 1)
    return (
        f"{REVIEW_MARKER}\n"
        f"## Factory review — {wo}\n\n"
        f"Reviewed by `{reviewer}`, who is not the author `{author}`"
        " (PRD-0001: generation and verification are separate actors;"
        " ADR-0033: the agent reviewer pre-chews the PR so the human gate is"
        " judgment, not linting).\n\n"
        f"**Detectors and tests: {verdict}**\n\n"
        "<details><summary>Check output</summary>\n\n"
        f"{fence}text\n{output.rstrip()}\n{fence}\n\n"
        "</details>\n")


def _pull_request(env):
    """(the pull_request payload, problems) from the CI event file."""
    pr, error = gates.pr_event(env)
    if error:
        return None, [f"V: {error}"]
    if pr is None:
        return None, ["V: no pull_request in the CI event payload"]
    return pr, []


def cited_work_order(root, body):
    """(the work order this PR implements, problems).

    NOT "the first WO token in the body": the body is author-controlled prose
    that legitimately NAMES other work orders — a blocking edge ("builds on
    WO-0004"), a quoted Accept line — and taking the first token would flip
    the WRONG issue's lifecycle label on merge. The citation is structural
    instead: the work order a PR implements is the one whose breakdown row is
    mirrored to an issue the PR closes. Detector B already requires both
    halves of that (a WO token AND a Closes #N link), and the issue number
    still comes from the row, never from the body — ADR-0032's mirror stays
    one-way. Ambiguity fails CLOSED: nothing is labelled.
    """
    cited = list(dict.fromkeys(WO_TOKEN.findall(body)))
    if not cited:
        return None, ["V: PR body cites no work-order id"]
    closes = sorted({int(n) for n in CLOSES_TOKEN.findall(body)})
    if not closes:
        return None, ["V: PR body has no Closes #N link, so the work order it"
                      " implements cannot be told from the ones it only"
                      " mentions"]
    matched = [wo for wo in cited if tracker_issue(root, wo)[0] in closes]
    if len(matched) == 1:
        return matched[0], []
    if len(matched) > 1:
        return None, ["V: this PR closes the mirrored issues of more than one"
                      f" work order ({', '.join(matched)}); a work order is"
                      " one PR"]
    if len(cited) == 1:
        # One citation and it did not resolve: say why (no row, no tracker)
        # rather than hiding the reason behind "nothing matched".
        problems = tracker_issue(root, cited[0])[1]
        if problems:
            return None, problems
    closed = ", ".join(f"#{n}" for n in closes)
    return None, [f"V: none of the work orders this PR cites"
                  f" ({', '.join(cited)}) is mirrored to an issue it closes"
                  f" ({closed}) — a PR implements the work order whose"
                  " breakdown row it closes"]


def post_review(number, body, run):
    """Post (or update) the review comment. gh has nothing to edit on the
    first run of a PR, so a failing --edit-last falls back to a new
    comment — that keeps one live comment per PR instead of a thread of
    stale ones."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "review.md"
        path.write_text(body, encoding="utf-8")
        args = ["pr", "comment", str(number), "--body-file", str(path)]
        try:
            try:
                run([*args[:3], "--edit-last", *args[3:]])
            except GH_FAILURES:
                run(args)
        except GH_FAILURES as err:
            return [f"V: gh pr comment failed: {gh_detail(err)}"]
    return []


def run_review(root, findings, status, env, run=gh_runner):
    """The review job: post the check findings as a non-authoring actor."""
    pr, problems = _pull_request(env)
    if problems:
        return problems
    reviewer, problems = reviewer_login(env, run)
    if problems:
        return problems
    author = (pr.get("user") or {}).get("login") or ""
    problems = (actor_conflict(author, reviewer)
                + declared_conflict(env.get("FACTORY_REVIEW_LOGIN", ""),
                                    reviewer))
    if problems:
        return problems
    # Hand-written rather than cli.read_file (ADR-0075): an absent
    # findings file is an OSError message here, where read_file gives
    # (None, None). The file is another job's output handed over as
    # untrusted data (ADR-0098): read only as many bytes as the rendered
    # cap can use (four per UTF-8 character at worst), and replace what
    # does not decode rather than let the text refuse its own review.
    try:
        with open(findings, "rb") as handle:
            raw = handle.read(4 * MAX_FINDINGS_CHARS)
    except OSError as err:
        return [f"V: cannot read findings file {findings}: {err}"]
    output = raw.decode("utf-8", errors="replace")
    # The heading is cosmetic. An unresolvable citation must not silence the
    # reviewer (the findings are the point) — but it must not name a work
    # order this PR may not implement either. Only the merged-label step,
    # which MUTATES an issue, is strict about it.
    wo, _ = cited_work_order(root, pr.get("body") or "")
    body = render_findings(wo or "(no work order resolved)", author, reviewer,
                           output, status)
    return post_review(pr.get("number"), body, run)


def _flip(number, label, lifecycle, run):
    """(labels removed, problems): make `label` the only lifecycle label
    on issue `number`. An already-correct issue is a no-op ([], [])."""
    read = gh_read(["issue", "view", str(number), "--json", "labels"],
                   f"gh issue view {number}", label="V", run=run,
                   expect=dict)
    if read.value is None:
        return [], read.problems
    # The seam drops a nameless label entry outright: it cannot be
    # compared, added, or removed by name, and passing None through
    # would put a non-name into the lifecycle comparison below.
    names = label_names(read.value)
    add, remove = transition(names, lifecycle, label)
    if not add and not remove:
        return [], []
    args = ["issue", "edit", str(number)]
    for name in add:
        args += ["--add-label", name]
    for name in remove:
        args += ["--remove-label", name]
    try:
        run(args)
    except GH_FAILURES as err:
        return [], [f"V: gh issue edit {number} failed:"
                    f" {gh_detail(err)}"]
    return remove, []


# What "quoted" means to the skip gate below: a fenced region (the one
# fence rule, knowledge_plane.unfenced), and a blockquote
# line. NOT inline code — backticks around an id are how this repo writes
# identifiers in ordinary prose, genuine claims included, so treating them
# as quotation would silence real work-order PRs (ADR-0064).


def _unquoted(body):
    """The body with quoted material removed, for the one question the
    skip gate asks: does the author CLAIM a work order here?

    A PR that tightens a detector quotes the detector's output, and a PR
    that discusses a breakdown row quotes the row. Every work-order token
    in that material is evidence, and reading it as an assertion is what
    made this repo redact live ids to WO-00xx inside the very fences whose
    purpose is to show what the tool printed.

    Only the gate reads this. Resolution (`cited_work_order`) still reads
    the whole body, so a quoted token that DOES resolve to an issue the PR
    closes still flips its label — the gate is reached only after
    resolution has failed.

    Line numbers are not preserved: nothing downstream reads any. An
    unterminated fence swallows the rest of the body, which biases the
    gate toward skipping, and a skip is a no-op rather than a mutation of
    an issue nobody named."""
    return "\n".join(line for _, line in unfenced(body.splitlines())
                     if not line.lstrip().startswith(">"))


def run_lifecycle(root, label, env, run=gh_runner, uncited="problem"):
    """The merged-label job: flip the cited work order's lifecycle label.

    uncited="skip" makes a PR that cites no work order at all a silent
    no-op instead of a problem: human housekeeping PRs are normal
    traffic. "Cites" is read off `_unquoted(body)` rather than the raw
    body (ADR-0064) — a token inside a fenced block or a blockquote is
    material the PR quotes, not a work order it claims. ONLY that case
    is relaxed — a body that names a work order in its own prose but
    resolves to none (no Closes line, ambiguous, unmirrored) is a
    malformed WO PR and stays loud in both legs, as does everything
    after resolution. That is what the strictness protects: the skip
    cannot mutate the wrong issue, because it fires only when nothing
    resolves and nothing is mutated.

    BOTH legs pass it (ADR-0057). They disagreed until then — the open
    leg skipped and the merged leg did not — which left no PR body that
    could satisfy both: naming a work order failed the open leg, and
    naming none failed the merged leg. A work-order PR that merges
    having lost its citation entirely no longer reddens the merge; it
    surfaces as cross-plane drift in the reconcile sweep, which is where
    ADR-0045 already puts disagreements of this kind.

    The function default stays strict so a caller must ask for the
    relaxation; pr_opened and pr_merged are the callers that do. Only
    the legacy `lifecycle --label` alias can still reach the strict
    default."""
    lifecycle, problems = lifecycle_labels(root)
    if problems:
        return problems
    if label not in lifecycle:
        return [f"V: {label} is not a lifecycle label in the taxonomy"]
    pr, problems = _pull_request(env)
    if problems:
        return problems
    body = pr.get("body") or ""
    wo, problems = cited_work_order(root, body)
    if problems:
        # The skip is exactly the case where the body claims no work
        # order of its own. A malformed WO PR must not be silently
        # unlabelled — the lost label is the very queue-entry event this
        # leg exists to record, and the job only fires on
        # opened/reopened, so nothing would ever retry it.
        if uncited == "skip" and not WO_TOKEN.findall(_unquoted(body)):
            return []
        return problems
    number, problems = tracker_issue(root, wo)
    if problems:
        return problems
    _, problems = _flip(number, label, lifecycle, run)
    return problems


def _known_issue_flip(root, label, issue, run, require=()):
    """(labels removed, problems): the shared half of the two KNOWN-issue
    legs — the ones handed an issue number outright, with no PR to resolve
    a citation against. Loads the taxonomy once, refuses any label the
    state machine does not contain, then flips. `require` names the extra
    labels the CALLER's own reasoning depends on being in the taxonomy;
    they are checked before the flip, so a broken taxonomy never mutates
    an issue halfway."""
    lifecycle, problems = lifecycle_labels(root)
    if problems:
        return [], problems
    for name in (label, *require):
        if name not in lifecycle:
            return [], [f"V: {name} is not a lifecycle label in the"
                        " taxonomy"]
    return _flip(issue, label, lifecycle, run)


def run_outcome(root, label, issue, run=gh_runner):
    """The dispatch failure leg: flip a KNOWN issue, write no verdict.

    Its own function rather than a flag on run_claim, because the two
    differ in what they may assume. The claim reasons about
    wo:ready-for-agent and reports whether THIS event won the race for
    the order; this leg runs from a failure() step, where the order's
    prior state is however far the dying run got. There is no later step
    to read a verdict, and writing one anyway would let a step that
    failed cast a dispatch decision."""
    return _known_issue_flip(root, label, issue, run)[1]


def run_claim(root, label, issue, env, run=gh_runner):
    """The dispatch claim: flip a KNOWN issue (no PR, no citation to
    resolve) and write the assembler's idempotency verdict to
    $GITHUB_OUTPUT. `transitioned` is true only when the flip removed
    wo:ready-for-agent — the order was in ready state and THIS event
    claimed it; a repeat/stale event finds it already advanced and gets
    false, which is what skips the paid agent step. A flip that cannot
    verify the order's state is a problem (red step), never a verdict."""
    # The verdict is "did the flip take the order out of ready" — a
    # taxonomy that lost the ready label would make every verdict false
    # and silently stop all dispatch. Fail loudly instead.
    ready = assembler.READY_LABEL
    removed, problems = _known_issue_flip(root, label, issue, run,
                                          require=(ready,))
    if problems:
        return problems
    claimed = ready in removed
    write_outputs(env, {"transitioned": "true" if claimed else "false"})
    return []


def pr_opened(root, env, run=gh_runner):
    """The PR-open leg: the cited work order enters the merge gate's
    queue. An uncited PR is a no-op (ADR-0057)."""
    return run_lifecycle(root, MERGE_GATE.queue, env, run=run,
                         uncited="skip")


def pr_merged(root, env, run=gh_runner):
    """The merge leg: the cited work order passes the merge gate. An
    uncited PR is a no-op here too (ADR-0057) — the legs agree."""
    return run_lifecycle(root, MERGE_GATE.passed, env, run=run,
                         uncited="skip")


def claim(root, issue, env, run=gh_runner):
    """The dispatch claim of KNOWN issue `issue`, with its verdict."""
    return run_claim(root, CLAIM_LABEL, issue, env, run=run)


def fail(root, issue, run=gh_runner):
    """The dispatch failure leg for KNOWN issue `issue`: no verdict."""
    return run_outcome(root, FAILED_LABEL, issue, run=run)


# The action a dispatch stands in for. GitHub suppresses the real
# pull_request event for a PR the factory's own token opened (WO-0030), so
# the synthetic one says "opened". Nothing reads the word back out of this
# file — no consumer of cli.read_event touches `action`, and the workflow's
# own `github.event.action` conditions are evaluated by GitHub against the
# REAL event (a workflow_dispatch, where it is empty), never against this.
# It is here so read_event's callers are handed a webhook-shaped object,
# and "opened" is the shape a first look at a PR has.
DISPATCH_ACTION = "opened"


def write_pr_event(number, path, env, run=gh_runner):
    """Write the pull_request event a dispatched run stands in for.

    The counterpart of cli.read_event (ADR-0042): that reader's consumers
    — detector B's body read, both lifecycle legs' PR resolution — are
    handed exactly this object, so its shape is stated once here instead
    of once per workflow step that needs it.

    Nothing is written unless the whole PR was read. Half an event is
    worse than none: read_event parses it happily, and every consumer
    then sees a PR whose body is simply absent — a detector that skips
    and a label flip that no-ops, both silently.
    """
    slug = env.get("GITHUB_REPOSITORY")
    if not slug:
        return ["V: GITHUB_REPOSITORY is unset —"
                " nothing names the PR to read"]
    result = gh_read(["api", f"repos/{slug}/pulls/{number}"],
                     f"gh api pull #{number}", "V", run=run, expect=dict)
    if result.value is None:
        return result.problems
    payload = {"action": DISPATCH_ACTION, "pull_request": result.value}
    try:
        Path(path).write_text(json.dumps(payload), encoding="utf-8")
    except OSError as err:
        return [f"V: cannot write the event payload to {path}: {err}"]
    return []


# The lifecycle verbs, one per leg; each leg names its own label and its
# own uncited rule, so no argument can pair a leg with another's.
PR_VERBS = {"pr-opened": pr_opened, "pr-merged": pr_merged}
ISSUE_VERBS = ("claim", "fail")


def parse(argv):
    """(command, options) for a well-formed invocation, else (None, None)."""
    if not argv:
        return None, None
    command, rest, options = argv[0], argv[1:], {}
    # The lifecycle verbs: a leg's only argument is its issue, if it has
    # one. isascii(): str.isdigit() is true for '\u00b2'.
    if command in PR_VERBS:
        return (command, {}) if not rest else (None, None)
    if command in ISSUE_VERBS:
        if len(rest) == 1 and rest[0].isascii() and rest[0].isdigit():
            return command, {"issue": rest[0]}
        return None, None
    while rest:
        if not rest[0].startswith("--") or len(rest) < 2:
            return None, None
        options[rest[0][2:]] = rest[1]
        rest = rest[2:]
    if (command == "pr-event" and set(options) == {"pr", "out"}
            and options["pr"].isdigit()):
        return command, options
    if command == "review" and set(options) <= {"findings", "status"}:
        status = options.get("status", "0")
        # isascii(): str.isdigit() is true for '\u00b2', which int() refuses.
        if not (status.isascii() and status.isdigit()):
            return None, None
        return command, {"findings": options.get("findings", "findings.txt"),
                         "status": int(status)}
    if command == "lifecycle":
        # The pre-verb alias. Its forms parse exactly as they did,
        # mis-pairings included: a stamped Makefile is never refreshed.
        if set(options) == {"label"}:
            return command, options
        if (set(options) == {"label", "issue"}
                and options["issue"].isdigit()):
            return command, options
        if (set(options) == {"label", "issue", "verdict"}
                and options["issue"].isdigit()
                and options["verdict"] == "skip"):
            return command, options
        if (set(options) == {"label", "uncited"}
                and options["uncited"] == "skip"):
            return command, options
    return None, None


def main(argv, env=None, run=gh_runner):
    env = os.environ if env is None else env
    root = repo_root()
    command, options = parse(argv)
    if command == "pr-event":
        problems = write_pr_event(options["pr"], options["out"], env=env,
                                  run=run)
    elif command == "review":
        problems = run_review(root, options["findings"], options["status"],
                              env=env, run=run)
    elif command in PR_VERBS:
        problems = PR_VERBS[command](root, env=env, run=run)
    elif command == "claim":
        problems = claim(root, options["issue"], env=env, run=run)
    elif command == "fail":
        problems = fail(root, options["issue"], run=run)
    elif command == "lifecycle" and "verdict" in options:
        problems = run_outcome(root, options["label"], options["issue"],
                               run=run)
    elif command == "lifecycle" and "issue" in options:
        problems = run_claim(root, options["label"], options["issue"],
                             env=env, run=run)
    elif command == "lifecycle":
        problems = run_lifecycle(root, options["label"], env=env, run=run,
                                 uncited=options.get("uncited", "problem"))
    else:
        print(__doc__.strip())
        return 2
    return report("validator", problems)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
