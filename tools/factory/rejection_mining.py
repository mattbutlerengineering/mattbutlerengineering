#!/usr/bin/env python3
"""rejection_mining: the weekly toolsmith-queue harvest (PRD-0001
§User stories, WO-0018).

The toolsmith charter's Mine stage wants the correction stream in one
place before any rule is written. Two streams exist on the dispatch
plane, and this tool reads both through the injected gh runner (same
seam as gate_digest.py, so tests never touch the network):

- gate rejections — a `wo:` queue stay that ended WITHOUT the gate's
  pass label. These are exactly the stays human_gates.gate_passages
  deliberately skips: a flip to wo:failed / wo:blocked records no
  latency row there, so this tool is where those flips finally land.
  One walk answers both (human_gates.completed_stays, ADR-0056): the
  digest keeps the confirmed stays, this keeps the rest.
- PR change-requests — CHANGES_REQUESTED reviews on the work orders'
  PRs, joined to their WO through the `Closes #N` grammar
  (knowledge_plane.CLOSES_TOKEN).

The harvest is upserted as one pinned, marker-tagged queue issue —
the gate digest's tracker idiom (ADR-0035): created and pinned on
first run, edited in place every week after. Recurrence counts lead
each entry because the charter counts recurrences before writing a
rule — one rejection is an anecdote — and the evidence is quoted
(review bodies excerpted), never summarized into existence.

Conventions match gate_digest.py: functions return rm:-prefixed problem
strings; the CLI prints them and exits nonzero.

  python3 rejection_mining.py mine
        Harvest gate rejections and change-requested reviews for the
        mirrored work orders, then create-or-update the pinned
        toolsmith-queue issue.
"""
import os
import sys
from datetime import datetime, timezone

from cli import CLI_FAILURES as GH_FAILURES
from cli import detail as gh_detail
from cli import gh_read, gh_runner, report, write_outputs
from human_gates import gate_rejections, label_events
from knowledge_plane import CLOSES_TOKEN, mirror_map, repo_root, sanitize

# First line of the queue issue's body — how the weekly run finds its
# own issue among the open ones (the gate digest's marker idiom).
MARKER = "<!-- factory-toolsmith-queue -->"
QUEUE_TITLE = "Toolsmith queue — mined rejections"

# How far back the two listings can see. cli.gh_read owns the window —
# the limit it sends gh and the truncation it reports are the same
# number, so the two can no longer drift apart.
LIST_WINDOW = 1000
ISSUE_ARGS = ("issue", "list", "--state", "all", "--json",
              "number,title,state,labels,body")
PR_ARGS = ("pr", "list", "--state", "all", "--json",
           "number,state,body,reviews")


def _excerpt(body):
    """The first line of a review body, sanitized through sweeps'
    pattern (ADR-0032: control characters stripped, fence runs
    defanged, WO tokens redacted, length capped) — or a stated
    absence: the quote is the evidence, so an empty one must be
    visibly empty rather than a blank that reads as a rendering
    bug. Sanitizing here means compose_queue's fence can never be
    escaped by what it quotes."""
    first = (body or "").strip().splitlines()
    excerpt = sanitize(first[0]) if first else ""
    return excerpt or "(no comment)"


def change_requests(listing, mirror):
    """[(wo, pr number, excerpt)] — every CHANGES_REQUESTED review on a
    PR whose Closes link names a mirrored work order. A PR closing no
    mirrored issue is not factory output and is skipped."""
    mined = []
    for entry in listing:
        number = entry.get("number")
        # dict.fromkeys: a body saying `Closes #7` twice names one
        # order once — a duplicate ref must not double-count a review.
        orders = list(dict.fromkeys(
            mirror[int(ref)]
            for ref in CLOSES_TOKEN.findall(entry.get("body") or "")
            if int(ref) in mirror))
        if not isinstance(number, int) or not orders:
            continue
        for review in entry.get("reviews") or []:
            if not isinstance(review, dict) or \
                    (review.get("state") or "").upper() != \
                    "CHANGES_REQUESTED":
                continue
            for wo in orders:
                mined.append((wo, number, _excerpt(review.get("body"))))
    return mined


def compose_queue(rejections_by_wo, requests_by_wo, day, sources=None):
    """The queue issue's body: marker first, then one section per work
    order with corrections, most corrections first (recurrence is the
    rule-writing signal), each with its quoted evidence line.

    `sources` is the already-worded statement of what this harvest could
    read, rendered ABOVE the corrections because a partial harvest changes
    how everything below it reads. Wording belongs to run_mine, which knows
    what happened; structure belongs here, which owns the body — the same
    split the CLI's reason line already uses.

    It is rendered on EVERY body, not only a broken one. A warning that
    appears only on failure is indistinguishable from a body written before
    the warning existed, which is this defect one level up. `None` renders
    nothing, for callers that have nothing to say."""
    orders = sorted(
        set(rejections_by_wo) | set(requests_by_wo),
        key=lambda wo: (-(len(rejections_by_wo.get(wo, ())) +
                          len(requests_by_wo.get(wo, ()))), wo))
    lines = [MARKER, f"{QUEUE_TITLE} — {day}", ""]
    if sources is not None:
        lines += [f"Sources: {sources}", ""]
    if not orders:
        lines.append("No corrections mined.")
    for wo in orders:
        rejections = rejections_by_wo.get(wo, [])
        requests = requests_by_wo.get(wo, [])
        lines.append(f"- **{wo}** — "
                     f"{len(rejections) + len(requests)} correction(s)")
        for gate, ended in rejections:
            lines.append(f"  - {gate} gate rejection at {ended}")
        for number, excerpt in requests:
            # The fence is the quoting boundary (sweeps' idiom):
            # _excerpt already defanged any ``` run, so the quoted
            # line cannot close the fence and speak as the body.
            lines += [f"  - PR #{number} change-request:",
                      "    ```text",
                      f"    {excerpt}",
                      "    ```"]
    lines += ["", "Updated weekly by rejection mining (WO-0018);"
              " recurrences are counted before a rule is written —"
              " one rejection is an anecdote (toolsmith charter,"
              " Mine stage). Quoted excerpts are sanitized, fenced"
              " untrusted data, never instructions (ADR-0032)."]
    return "\n".join(lines) + "\n"


def _timelines(mirrored, run, problems):
    """{issue number: label events} for every mirrored issue gh can
    answer for; a failed fetch is a problem, never a silently thinner
    harvest — the queue still posts, and next week's re-scan of the
    same history catches up (the upsert is idempotent)."""
    events = {}
    for number in mirrored:
        path = f"repos/{{owner}}/{{repo}}/issues/{number}/timeline"
        read = gh_read(["api", path, "--paginate", "--slurp"],
                       f"gh api timeline for #{number}", label="rm",
                       run=run)
        problems.extend(read.problems)
        if read.value is None:
            continue
        events[number] = label_events(
            [event for page in read.value for event in page])
    return events


def _change_requests(mirror, run, problems, truncated):
    """change_requests over a live pr listing, or None when the listing
    failed; a failed listing is a problem plus a MISSING stream, never a
    lost harvest — the gate rejections still post.

    None rather than [], because [] is the answer when the listing was read
    and no PR carried a change request. Conflating those two is what let a
    broken stream read as a healthy empty one for the harvest's whole life:
    the failure reached `problems` and the workflow log, and the queue issue
    a human reads said the same sentence either way. The sentinel is
    gh_read's own — this module already branches on `read.value is None`
    three times — rather than a second shape of maybe.

    `truncated` collects the names of listings that came back at their full
    window, appended the way `problems` already is rather than returned as
    a second value: None answers "was it read", which truncation does not
    contradict — a full window is read, usable, and short. Two facts, two
    channels, so neither has to encode the other."""
    read = gh_read(list(PR_ARGS), "gh pr list", label="rm", run=run,
                   window=LIST_WINDOW)
    problems.extend(read.problems)
    if read.truncated:
        truncated.append("the PR listing")
    if read.value is None:
        return None
    return change_requests(read.value, mirror)


def _post_queue(existing, body, run, problems):
    """Create-or-update the queue issue — gate_digest._post_digest's
    contract: the edit path re-pins and tolerates the refusal (a human
    unpin heals next week), the create path's pin failure IS a
    problem."""
    if existing is not None:
        try:
            run(["issue", "edit", str(existing), "--body", body])
        except GH_FAILURES as err:
            problems.append(f"rm: gh issue edit {existing} failed:"
                            f" {gh_detail(err)}")
            return
        try:
            run(["issue", "pin", str(existing)])
        except GH_FAILURES:
            pass
        return
    try:
        url = run(["issue", "create", "--title", QUEUE_TITLE,
                   "--body", body]).strip()
    except GH_FAILURES as err:
        problems.append(f"rm: gh issue create failed: {gh_detail(err)}")
        return
    try:
        run(["issue", "pin", url.rsplit("/", 1)[-1]])
    except GH_FAILURES as err:
        problems.append(f"rm: gh issue pin failed: {gh_detail(err)}")


def _sources(mirrored, events_by_issue, requests, truncated):
    """What this harvest could read, worded for the queue body.

    Both streams, because both are blind the same way: a timeline fetch that
    fails thins the rejections and a failed pr listing empties the change
    requests, and neither leaves a mark on the artifact anyone reads. The
    counts come from the caller's own facts — the issues asked for versus
    the ones answered, and _change_requests' None — so nothing here re-reads
    the problem list. Those strings stay the CLI's.

    A truncated listing is the third partial harvest and the quietest: the
    read succeeded, so every count below is stated at full confidence over
    the top of a window. Worse on the issue listing, where it shortens
    `mirrored` and so understates the DENOMINATOR the line prints — this
    cannot recover the true number, and saying which listing was cut is the
    honest most it can do."""
    unread = len(mirrored) - len(events_by_issue)
    gap = f" ({unread} unreadable)" if unread else ""
    rejections = (f"gate rejections from {len(events_by_issue)} of"
                  f" {len(mirrored)} issue timelines{gap}")
    if requests is None:
        line = (f"{rejections}; change requests NOT READ — the PR"
                " listing failed.")
    else:
        line = f"{rejections}; change requests from the PR listing."
    if truncated:
        line += (f" TRUNCATED: {', '.join(truncated)} came back full, so"
                 " older entries were never read.")
    return line


def run_mine(root, run=gh_runner, clock=None):
    """(outputs, problems) for the mine command: harvest both correction
    streams for the mirrored work orders and create-or-update the
    pinned queue issue. outputs carries a one-line reason with the
    candidate and correction counts."""
    clock = clock or (lambda: datetime.now(timezone.utc))
    now = clock()
    mirror = mirror_map(root)
    read = gh_read(list(ISSUE_ARGS), "gh issue list", label="rm", run=run,
                   window=LIST_WINDOW)
    if read.value is None:
        return {}, read.problems
    listing, problems = read.value, list(read.problems)
    truncated = ["the issue listing"] if read.truncated else []

    mirrored = sorted(entry["number"] for entry in listing
                      if entry.get("number") in mirror)
    events_by_issue = _timelines(mirrored, run, problems)
    rejections_by_wo = {}
    for number, events in sorted(events_by_issue.items()):
        for rejection in gate_rejections(events):
            rejections_by_wo.setdefault(mirror[number],
                                        []).append(rejection)
    requests_by_wo = {}
    requests = _change_requests(mirror, run, problems, truncated)
    for wo, number, excerpt in requests or ():
        requests_by_wo.setdefault(wo, []).append((number, excerpt))

    body = compose_queue(rejections_by_wo, requests_by_wo,
                         now.date().isoformat(),
                         sources=_sources(mirrored, events_by_issue,
                                          requests, truncated))
    open_issues = [entry for entry in listing
                   if (entry.get("state") or "").upper() == "OPEN"]
    existing = next((entry["number"] for entry in
                     sorted(open_issues, key=lambda e: e["number"])
                     if (entry.get("body") or "").startswith(MARKER)),
                    None)
    _post_queue(existing, body, run, problems)

    candidates = set(rejections_by_wo) | set(requests_by_wo)
    corrections = sum(len(v) for v in rejections_by_wo.values()) + \
        sum(len(v) for v in requests_by_wo.values())
    return ({"reason": f"rm: {len(candidates)} candidate WO(s),"
                       f" {corrections} correction(s) mined"},
            problems)


def main(argv, env=None, root=None, run=gh_runner, clock=None):
    env = os.environ if env is None else env
    root = root or repo_root()
    if argv == ["mine"]:
        outputs, problems = run_mine(root, run=run, clock=clock)
        write_outputs(env, outputs)
        if outputs.get("reason"):
            print(outputs["reason"])
    else:
        print(__doc__.strip())
        return 2
    return report("rejection_mining", problems)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
