"""human_gates: what the three human gates are, and how to read one
issue's label history against them (ADR-0056).

The gates are the factory's only human decision points (ADR-0033;
CONTEXT.md: PRD approval, blueprint/ADR approval, PR merge), so their
queues live on the work orders' mirrored issues as `wo:` lifecycle
labels (ADR-0032, ADR-0035): `wo:draft` waits at the PRD gate,
`wo:prd-approved` at the blueprint gate, `wo:needs-review` at the merge
gate. This module owns that vocabulary and the walk over it — the
label-event stream, the completed-stay partition, the current stay's
start, the open queues aged from it, and (read_timelines) the one read
that produces the stream and says what its admission refused.

Its callers are thin: gate_digest.py keeps the confirmed stays as
latency rows, rejection_mining.py harvests the rest, dashboard.py ages
the open ones, and gates.py's detector J asks which labels the gates
name. They differ in what a stay MEANS to them, never in what a stay
IS, which is the whole reason this is one module and their posts and
compositions are not.

Pure but for one function: no ledger, no filesystem, no clock (`now` is
an argument). read_timelines is the exception ADR-0090 made — it reads
gh, but only through the injected runner at cli's gh port, so tests
still never touch the network. ADR-0056 had kept that read in each
tool; the #491 refusal then had to be wired into each copy, and one
copy missed it (#791). Everything else is events in, gate facts out,
testable with a literal list.
"""
from collections import namedtuple
from datetime import datetime

from cli import gh_read, label_names

# A gate's ledger name, the wo: label an issue carries while waiting,
# the label whose application confirms the pass (a flip to anything else
# — wo:blocked, wo:failed — is not a passage), and the digest heading.
# Named rather than positional so detector J can ask for the labels
# instead of slicing gate[1:3]; the sites that iterate the rows still
# unpack them positionally (cost_report.GuardResult's precedent).
Gate = namedtuple("Gate", "name queue passed heading")

# The three gates in pipeline order. Six label slots, five distinct
# labels: passing the PRD gate is entering the blueprint gate's queue.
GATES = (
    Gate("prd", "wo:draft", "wo:prd-approved", "PRD gate"),
    Gate("blueprint", "wo:prd-approved", "wo:blueprint-approved",
         "Blueprint gate"),
    Gate("merge", "wo:needs-review", "wo:merged", "Merge gate"),
)


def gate_labels():
    """Every label the three gates name — each queue and each pass
    label. Detector J's one reach into this module (LABELS below, which
    gates.declared_labels reads): the taxonomy must carry all of them,
    and the detector should not know how many label fields a row has."""
    return {label for gate in GATES for label in (gate.queue, gate.passed)}


LABELS = tuple(sorted(gate_labels()))


def _parse_ts(iso):
    """GitHub timestamps end in Z; fromisoformat only accepts that from
    3.11, and local runs may be older."""
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _is_timestamp(value):
    """The module's one answer to "is this a timestamp", asked once at
    admission so nothing downstream has to ask it again.

    Two clauses, and the second is the one that is easy to miss: the
    value must parse, AND it must carry a UTC offset. "2026-08-01"
    parses cleanly to a naive datetime, and subtracting a naive datetime
    from an aware one raises TypeError — the same crash this guard
    exists to prevent, one step further along. Parseability alone is not
    the precondition waited_seconds needs.

    The isinstance test is not decoration either: `value` is a field of
    a decoded API response, and a non-string one would fail inside
    _parse_ts with an AttributeError from .replace rather than a parse
    error, which is a worse thing to depend on."""
    if not isinstance(value, str):
        return False
    try:
        return _parse_ts(value).tzinfo is not None
    except ValueError:
        return False


def waited_seconds(start, end):
    """Whole seconds between two GitHub timestamps.

    Both are offset-aware ISO-8601 by precondition, established by
    label_events, which admits no event whose timestamp fails either
    clause of _is_timestamp.
    So this raises only for a programming error at a future call site
    that sources its timestamps somewhere else — do not add a handler
    here, which would put a second owner on a policy the admission gate
    already holds."""
    return int((_parse_ts(end) - _parse_ts(start)).total_seconds())


def _admit(timeline):
    """The one walk over a raw GitHub timeline: every event classed as a
    label flip carrying a name, split into admitted (timestamp reads as
    one) and refused (it does not). label_events keeps the admitted
    list; read_timelines also reports the refused count. One loop reading
    the payload's `event`/`label`/`created_at` keys, so the two
    questions cannot drift apart — the second clause of "well-formed" is
    still asked exactly once, by `_is_timestamp`."""
    admitted = []
    refused = 0
    for event in timeline:
        kind = event.get("event")
        if kind not in ("labeled", "unlabeled"):
            continue
        name = (event.get("label") or {}).get("name")
        if not name:
            continue
        ts = event.get("created_at")
        if _is_timestamp(ts):
            admitted.append((ts, kind, name))
        else:
            refused += 1
    return admitted, refused


def label_events(timeline):
    """[(timestamp, 'labeled'|'unlabeled', label name)] from a GitHub
    issue timeline, in timeline (chronological) order. Anything that is
    not a well-formed label flip is not this module's business; an
    unusable timeline is the fetcher's problem, never this walk's.

    Well-formed means all three: a label flip, carrying a name, and
    carrying a timestamp that reads as one. The third clause is what
    lets every function downstream take ISO-8601 as given.

    Silent on purpose: it returns no problems for any of the three
    clauses. read_timelines is the one caller that reports what the
    third clause refused, so no tool can read a timeline and forget to
    (ADR-0090)."""
    return _admit(timeline)[0]


def read_timelines(numbers, run, label, slug="{owner}/{repo}"):
    """({issue number: label events}, problems) for each issue in
    `numbers`, read through the injected gh runner at cli's gh port —
    the one timeline read the gate tools share (ADR-0090).

    An issue whose fetch failed or did not parse is ABSENT from the
    map, never present-and-empty: [] is a history that was read and
    holds nothing, and open_queues tells an unreadable age from an
    unknown one by that difference (#665). Its problem is gh_read's.

    A fetch that succeeds can still carry an otherwise-well-formed
    label flip whose created_at does not read as a timestamp. Admission
    drops it, and this says so as a `<label>: timeline for #N refused`
    problem (#491): the read succeeded, so gh_read said nothing, and a
    dropped `unlabeled` leaves its stay open — a lost rejection for the
    miner, a wrong age for the queues (#740). A nameless or non-flip
    event is not a refusal.

    `label` is the caller's problem-string label ("gd", "rm",
    "dashboard"); `slug` is gh's {owner}/{repo} placeholder unless the
    caller reads another repo."""
    events = {}
    problems = []
    for number in numbers:
        path = f"repos/{slug}/issues/{number}/timeline"
        read = gh_read(["api", path, "--paginate", "--slurp"],
                       f"gh api timeline for #{number}", label=label,
                       run=run)
        problems.extend(read.problems)
        if read.value is None:
            continue
        admitted, refused = _admit(
            [event for page in read.value for event in page])
        if refused:
            problems.append(f"{label}: timeline for #{number} refused"
                            f" {refused} malformed timestamp(s)")
        events[number] = admitted
    return events, problems


def completed_stays(events, gate):
    """[(start, end, confirmed)] — every stay in one gate's queue that
    was entered AND left, with `confirmed` true when the gate's pass
    label was applied inside that stay's window: from its start up to
    the gate's next re-entry. So a flip to any other label (rejection,
    block) leaves the stay unconfirmed even when the gate is re-entered
    and passed later.

    A stay ends when its queue label is removed or, for a confirmed stay,
    at its first pass label if that came earlier (ADR-0074, amending
    ADR-0056): ADR-0032's one-lifecycle-label rule is not enforced when
    a human applies a gate label, so an added pass label must not leave
    the stay running until the next automated flip.

    This is the invariant made executable. A completed stay is confirmed
    or it is not, so the digest and the miner partition one list between
    them — every stay a passage there or a rejection here, never both —
    instead of agreeing by two hand-written window tests. An open stay
    is absent: still waiting, neither passage nor rejection."""
    confirmations = [ts for ts, kind, name in events
                     if kind == "labeled" and name == gate.passed]
    stays = []
    entered = None
    for ts, kind, name in events:
        if name != gate.queue:
            continue
        if kind == "labeled":
            entered = ts
        elif kind == "unlabeled" and entered is not None:
            stays.append((entered, ts))
            entered = None
    completed = []
    for index, (start, end) in enumerate(stays):
        next_start = (stays[index + 1][0] if index + 1 < len(stays)
                      else None)
        inside = [ts for ts in confirmations
                  if start <= ts and (next_start is None or ts < next_start)]
        # A confirmed stay ends at its pass label when that came first
        # (ADR-0074): a pass label ADDED beside the queue label leaves the
        # queue label on until some later flip strips it, and that gap is
        # automation's, not the human's wait.
        completed.append((start, min([end, *inside]), bool(inside)))
    return completed


def gate_passages(events):
    """[(gate, waited seconds, passed at)] — every confirmed gate
    passage in one issue's label history, in pipeline then stay order.
    Re-entering a gate yields one passage per confirmed stay."""
    return [(gate.name, waited_seconds(start, end), end)
            for gate in GATES
            for start, end, confirmed in completed_stays(events, gate)
            if confirmed]


def gate_rejections(events):
    """[(gate, stay ended at)] — the completed stays the pass label
    never confirmed, oldest first. The complement of gate_passages over
    the same list."""
    return sorted(((gate.name, end)
                   for gate in GATES
                   for _, end, confirmed in completed_stays(events, gate)
                   if not confirmed),
                  key=lambda item: item[1])


def waiting_since(events, queue_label):
    """The timestamp the issue's current stay in `queue_label` began, or
    None when the label is not currently applied (or the labeled event
    fell off the fetched timeline — the item still lists, just without an
    age)."""
    since = None
    for ts, kind, name in events:
        if name != queue_label:
            continue
        since = ts if kind == "labeled" else None
    return since


# One open issue waiting at a gate: the listing entry as the caller read
# it (title, url and the rest are the caller's to render), whole seconds
# waited, and whether its timeline was read at all. `aged` is False only
# for an unread timeline, which is a different fact from a `waited` of
# None on a read one (no arrival at this gate) — so it is named, never
# inferred (#665).
Waiting = namedtuple("Waiting", "issue waited aged")


def _waits_at(entry, mirror, queue_label):
    return entry.get("number") in mirror and \
        queue_label in label_names(entry)


def waiting_issues(open_issues, mirror):
    """The numbers of the open mirrored issues waiting at any gate,
    ascending — the timelines a caller that reads only what it ages must
    read before open_queues can age them. Same membership as
    open_queues, by construction."""
    return sorted({entry["number"] for entry in open_issues
                   for gate in GATES
                   if _waits_at(entry, mirror, gate.queue)})


def open_queues(open_issues, mirror, events_by_issue, now):
    """[(Gate, [Waiting])] for all three gates in pipeline order, each
    listing the open mirrored issues carrying its queue label, issue
    number ascending, aged from the current stay's labeled event at the
    aware datetime `now` — the queues gate_digest posts and dashboard
    renders, built once (ADR-0090).

    `open_issues` is the caller's already-filtered open listing.
    `events_by_issue` is read_timelines' map: an absent issue was not
    read (aged False), a present one with no arrival has no age."""
    queues = []
    for gate in GATES:
        items = []
        for entry in sorted(open_issues,
                            key=lambda e: e.get("number") or 0):
            if not _waits_at(entry, mirror, gate.queue):
                continue
            events = events_by_issue.get(entry["number"])
            since = waiting_since(events or [], gate.queue)
            waited = (waited_seconds(since, now.isoformat())
                      if since else None)
            items.append(Waiting(entry, waited, events is not None))
        queues.append((gate, items))
    return queues
