"""human_gates: what the three human gates are, and how to read one
issue's label history against them (ADR-0056).

The gates are the factory's only human decision points (ADR-0033;
CONTEXT.md: PRD approval, blueprint/ADR approval, PR merge), so their
queues live on the work orders' mirrored issues as `wo:` lifecycle
labels (ADR-0032, ADR-0035): `wo:draft` waits at the PRD gate,
`wo:prd-approved` at the blueprint gate, `wo:needs-review` at the merge
gate. This module owns that vocabulary and the walk over it — the
label-event stream, the completed-stay partition, the current stay's
start, and (refused_timestamps) how many events that stream silently
dropped.

Its callers are thin: gate_digest.py keeps the confirmed stays as
latency rows, rejection_mining.py harvests the rest, dashboard.py ages
the open ones, and gates.py's detector J asks which labels the gates
name. They differ in what a stay MEANS to them, never in what a stay
IS, which is the whole reason this is one module and their fetches,
posts and compositions are not.

Pure by construction: no gh, no ledger, no filesystem, no clock. Events
in, gate facts out, testable with a literal list — which is why the
timeline fetch that produces those events stays with the tools that own
its failure meaning (ADR-0051).
"""
from collections import namedtuple
from datetime import datetime

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
    label. Detector J's one reach into this module
    (gates.LABEL_DECLARERS): the taxonomy must carry all of them, and
    the detector should not know how many label fields a row has."""
    return {label for gate in GATES for label in (gate.queue, gate.passed)}


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
    list; refused_timestamps counts the refused half. One loop reading
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

    Silent on purpose: this module stays pure (ADR-0056) and returns no
    problems for any of the three clauses. A caller that wants to know
    how many events the third clause refused — the shape a `gd:`/
    `dashboard:` problem string needs — calls refused_timestamps on the
    same raw timeline."""
    return _admit(timeline)[0]


def refused_timestamps(timeline):
    """How many otherwise-well-formed label flips (a label flip, name
    present) label_events silently dropped from this raw timeline
    because the third clause failed: created_at did not read as a
    timestamp. Exists so gate_digest and dashboard — which already carry
    a problems list past label_events' call — can report what vanished
    without label_events itself growing a problems channel; a nameless
    or non-flip event is not this count's business, same as it is not
    label_events'."""
    return _admit(timeline)[1]


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
