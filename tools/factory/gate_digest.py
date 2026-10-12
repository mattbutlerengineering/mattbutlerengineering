#!/usr/bin/env python3
"""gate_digest: the daily gate-queue digest and gate-latency capture
(PRD-0001 user story 4, WO-0017; ADR-0041).

The three gates are human decision points (CONTEXT.md: PRD approval,
blueprint/ADR approval, PR merge) whose queues live on the work orders'
mirrored issues as `wo:` lifecycle labels (ADR-0032, ADR-0035); what a
gate IS and how to read one issue's label history against it is
human_gates.py's (ADR-0056). This tool reads those queues and each
mirrored issue's label timeline through an injected gh runner (same
seam as validator.py, so tests never touch the network), then:

- posts the digest — one marker-tagged issue, created and pinned on
  first run, edited in place every day after (ADR-0035: the digest posts
  to the tracker);
- captures gate latency — every confirmed passage (queue label removed
  AND the gate's pass label applied) becomes a $0 gate-latency row in
  docs/factory/costs.jsonl via cost_ledger.gate_entry (ADR-0041),
  deduped against rows already recorded so a daily re-scan never
  double-records.

The workflow (.github/workflows/gate-digest.yml) owns the one git
mutation — committing the appended ledger rows — signalled through the
`changed` step output; everything gh-shaped stays here, unit-tested.
Conventions match validator.py: functions return gd:-prefixed problem
strings; the CLI prints them and exits nonzero.

  python3 gate_digest.py daily
        Read the gate queues, append new gate-latency rows to the cost
        ledger, and create-or-update the pinned digest issue. Writes
        `changed` ('true'/'false': did the ledger gain rows?) to
        $GITHUB_OUTPUT for the workflow's commit step.
"""
import os
import sys
from collections import namedtuple
from datetime import datetime, timezone

import cost_ledger
from cli import CLI_FAILURES as GH_FAILURES
from cli import detail as gh_detail
from cli import gh_read, label_names, report, write_outputs
from human_gates import (GATES, gate_passages, label_events,
                         refused_timestamps, waited_seconds, waiting_since)
from knowledge_plane import mirror_map, repo_root
from cli import gh_runner

# First line of the digest issue's body — how the daily run finds its own
# issue among the open ones (same idiom as validator.py's REVIEW_MARKER).
DIGEST_MARKER = "<!-- factory-gate-digest -->"
DIGEST_TITLE = "Factory gate queue"

# One waiting item. `aged` is False only when the issue's timeline could
# not be read — a fact the renderer READS rather than infers from a
# `waited` of None, because the other cause of a missing age (a history
# read fine that held no arrival at this gate) is not a failure and must
# not wear a failure's mark. Same reason cli.GhResult names `truncated`
# instead of leaving it to be deduced from a problem on a usable value.
Item = namedtuple("Item", ("number", "title", "waited", "aged"))

# What a full window costs the READER. cli.gh_read's problem string
# already states the mechanism — the window, its size, raise-or-narrow —
# to the workflow log; this is the same fact told to the person the
# digest is actually for, in terms of what they are looking at.
TRUNCATED_NOTE = ("Coverage: the issue listing came back at its full"
                  " window, so issues outside it are not represented"
                  " here — an empty section may mean unseen, not none.")


def _format_wait(seconds):
    days, rest = divmod(seconds, 86400)
    hours = rest // 3600
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h"
    return "<1h"


def compose_digest(queues, as_of, listing_truncated):
    """The digest issue body: marker first (how the next run finds it),
    then one section per gate listing every waiting item and how long it
    has waited. Deterministic text, same discipline as
    cost_report.compose_report. queues is [(heading, queue label,
    [Item])] — the mirrored issue's title already leads with its WO
    token, so the line never repeats it.

    This body is the tool's whole product, so it states its own coverage
    rather than leaving that to the workflow log nobody opens. The two
    ways coverage can be short render in two places and neither repeats
    the other: a truncated listing is a property of the whole digest and
    gets one sentence under the sections it qualifies; an unreadable
    timeline is a property of one item and gets marked on that item's
    line, because a footer counting unreadable timelines cannot say
    which line to distrust.

    `listing_truncated` is required on purpose. A default would let a
    caller omit the fact silently, which is the defect this parameter
    exists to prevent."""
    lines = [DIGEST_MARKER, f"# {DIGEST_TITLE} — {as_of}"]
    for heading, queue_label, items in queues:
        lines += ["", f"## {heading} ({queue_label})"]
        if not items:
            lines.append("- (empty)")
        for entry in items:
            line = f"- #{entry.number} {entry.title}"
            if entry.waited is not None:
                line += f" — waiting {_format_wait(entry.waited)}"
            elif not entry.aged:
                line += " — age unknown (timeline unreadable)"
            lines.append(line)
    if listing_truncated:
        lines += ["", TRUNCATED_NOTE]
    lines += ["", "Updated daily by the gate digest (WO-0017); a passage"
              " lands a gate-latency row in "
              f"{cost_ledger.COST_LEDGER} (ADR-0041)."]
    return "\n".join(lines) + "\n"


# How far back the issue listing can see. cli.gh_read owns the window —
# the limit it sends gh and the truncation it reports are the same
# number, so the two can no longer drift apart.
LIST_WINDOW = 1000
LIST_ARGS = ("issue", "list", "--state", "all", "--json",
             "number,title,state,labels,body")


def _timelines(mirrored, run, problems):
    """{issue number: label events} for every mirrored issue gh can
    answer for; a failed fetch is a problem, never a lost queue item
    (the digest still lists the issue, just without an age, and the next
    daily run re-scans — dedup makes the catch-up safe).

    A fetch that succeeds can still carry an event label_events refuses
    for a malformed timestamp — a different failure, reported here
    rather than swallowed with the fetch's own problems (#491): the
    read succeeded, so read.problems says nothing about it."""
    events = {}
    for number in mirrored:
        path = f"repos/{{owner}}/{{repo}}/issues/{number}/timeline"
        read = gh_read(["api", path, "--paginate", "--slurp"],
                       f"gh api timeline for #{number}", label="gd",
                       run=run)
        problems.extend(read.problems)
        if read.value is None:
            continue
        raw = [event for page in read.value for event in page]
        refused = refused_timestamps(raw)
        if refused:
            problems.append(f"gd: timeline for #{number} refused"
                            f" {refused} malformed timestamp(s)")
        events[number] = label_events(raw)
    return events


def _capture_latency(root, mirror, events_by_issue, problems):
    """Append every not-yet-recorded gate passage to the cost ledger and
    return the new rows. The dedup identity is cost_ledger.row_key
    (ADR-0041): gate_entry keys run_id on the passage timestamp, so a
    daily re-scan of the same history appends nothing."""
    existing, ledger_problems = cost_ledger.read(root)
    problems.extend(ledger_problems)
    recorded = {cost_ledger.row_key(entry) for entry in existing}
    new_rows = []
    for number, events in sorted(events_by_issue.items()):
        for gate, waited, passed_at in gate_passages(events):
            row = cost_ledger.gate_entry(mirror[number], gate, waited,
                                         passed_at)
            if cost_ledger.row_key(row) not in recorded:
                new_rows.append(row)
    for row in new_rows:
        cost_ledger.append(root, row)
    return new_rows


def _queues(mirror, open_issues, events_by_issue, now):
    """[(heading, queue label, items)] for compose_digest: the open
    mirrored issues currently carrying each gate's queue label, oldest
    issue first, aged from the current stay's labeled event when the
    timeline yielded one — and carrying whether the timeline could be
    read at all, which is the difference between an unknown age and an
    unreadable one."""
    queues = []
    for _, queue_label, _, heading in GATES:
        items = []
        for entry in sorted(open_issues, key=lambda e: e["number"]):
            number = entry["number"]
            if number not in mirror or \
                    queue_label not in label_names(entry):
                continue
            # absent means _timelines could not read this issue's
            # history; present-and-empty means it read one that held no
            # arrival at this gate. The old .get(number, []) default
            # collapsed the two, and the digest inherited the collapse.
            events = events_by_issue.get(number)
            since = waiting_since(events or [], queue_label)
            waited = (waited_seconds(since, now.isoformat())
                      if since else None)
            items.append(Item(number, entry.get("title") or "", waited,
                              events is not None))
        queues.append((heading, queue_label, items))
    return queues


def _post_digest(digest, body, run, problems):
    """Create-or-update the digest issue. The edit path re-pins and
    tolerates the refusal: re-pinning a pinned issue fails, and gh gives
    no cheap way to tell that steady state from a real one — the retry
    exists so a human unpin heals on the next daily run instead of
    rotting. The create path's pin failure IS a problem (nothing else
    would ever retry a digest that was born unpinned and stayed so)."""
    if digest is not None:
        try:
            run(["issue", "edit", str(digest), "--body", body])
        except GH_FAILURES as err:
            problems.append(f"gd: gh issue edit {digest} failed:"
                            f" {gh_detail(err)}")
            return
        try:
            run(["issue", "pin", str(digest)])
        except GH_FAILURES:
            pass
        return
    try:
        url = run(["issue", "create", "--title", DIGEST_TITLE,
                   "--body", body]).strip()
    except GH_FAILURES as err:
        problems.append(f"gd: gh issue create failed: {gh_detail(err)}")
        return
    try:
        run(["issue", "pin", url.rsplit("/", 1)[-1]])
    except GH_FAILURES as err:
        problems.append(f"gd: gh issue pin failed: {gh_detail(err)}")


def run_daily(root, run=gh_runner, clock=None):
    """(outputs, problems) for the daily command: capture new gate
    latency into the cost ledger, then create-or-update the pinned
    digest — the rows are the data half of the work order, the digest
    only points at them. outputs carries `changed` ('true' when ledger
    rows were appended — the workflow's cue to commit) and a one-line
    reason.

    A full issue window is REPORTED AND CONTINUED here, unlike
    sweeps.live_issues: an issue past the window only goes unlisted, so
    the digest under-covers (TRUNCATED_NOTE says so in its body) but
    invents nothing, and a partial digest beats no digest (ADR-0066)."""
    clock = clock or (lambda: datetime.now(timezone.utc))
    now = clock()
    mirror = mirror_map(root)
    read = gh_read(list(LIST_ARGS), "gh issue list", label="gd", run=run,
                   window=LIST_WINDOW)
    if read.value is None:
        return {"changed": "false"}, read.problems
    listing, problems = read.value, list(read.problems)
    mirrored = sorted(entry["number"] for entry in listing
                      if entry.get("number") in mirror)
    events_by_issue = _timelines(mirrored, run, problems)
    new_rows = _capture_latency(root, mirror, events_by_issue, problems)

    open_issues = [entry for entry in listing
                   if (entry.get("state") or "").upper() == "OPEN"]
    queues = _queues(mirror, open_issues, events_by_issue, now)
    body = compose_digest(queues, now.date().isoformat(),
                          read.truncated)
    digest = next((entry["number"] for entry in
                   sorted(open_issues, key=lambda e: e["number"])
                   if (entry.get("body") or "").startswith(DIGEST_MARKER)),
                  None)
    _post_digest(digest, body, run, problems)

    waiting = sum(len(items) for _, _, items in queues)
    return ({"changed": "true" if new_rows else "false",
             "reason": f"gd: {waiting} item(s) waiting,"
                       f" {len(new_rows)} new gate-latency row(s)"},
            problems)


def main(argv, env=None, root=None, run=gh_runner, clock=None):
    env = os.environ if env is None else env
    root = root or repo_root()
    if argv == ["daily"]:
        outputs, problems = run_daily(root, run=run, clock=clock)
        write_outputs(env, outputs)
        if outputs.get("reason"):
            print(outputs["reason"])
    else:
        print(__doc__.strip())
        return 2
    return report("gate_digest", problems)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
