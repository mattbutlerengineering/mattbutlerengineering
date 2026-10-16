#!/usr/bin/env python3
"""cost_ledger: the one home of the append-only cost ledger's shape
(ADR-0034, ADR-0037) — docs/factory/costs.jsonl's path, field set, line
grammar, and the append/record/read operations over it.

Before this seam the shape lived in three places: budget_guard.py wrote
lines, detector G (gates.py) validated them in full, and
cost_report.read_ledger hand-rolled a partial re-validation that its own
docstring admitted could diverge from G. Now G and the report read the
same grammar: parse/line_problems are the single rule, G layers its
breakdown cross-checks on top, and read() is the report's reader whose
excluded-line problems ARE the CI rule's field checks.

Conventions match gates.py: read() returns ledger:-prefixed problem
strings; parse/line_problems return unlocated suffixes for callers that
prefix their own label and location (detector G keeps its G: strings
byte-for-byte).
"""
import json
import re
from datetime import date
from pathlib import Path

from cli import read_file
from knowledge_plane import WO_TOKEN

# The append-only cost ledger (ADR-0034). The outcome vocabulary is
# deliberately open — ADR-0034 fixes the field set, not its values.
COST_LEDGER = "docs/factory/costs.jsonl"
# One file per run. Parallel item branches never share a path, so a
# merge does not depend on a union driver — GitHub ignores custom merge
# drivers, and a shared append stays CONFLICTING. The aggregate above
# stays the historical ledger; read() sees both.
RUNS_DIR = "docs/factory/costs/runs"
# A run id used as a filename: no slash, no dot-dot, no leading dot.
RUN_FILE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$")
LEDGER_FIELDS = ("wo", "run_id", "model", "tokens", "cost", "outcome")
LEDGER_TEXT_FIELDS = ("run_id", "model", "outcome")

# Optional-on-read, written by every new row: the UTC date the row was
# appended, "YYYY-MM-DD" — the monthly circuit breaker (ADR-0034) windows
# on it. Absent on pre-2026-08 legacy rows, which stay valid — the ledger
# is append-only and never backfilled.
LEDGER_OPTIONAL_FIELDS = ("at",)

# The at field's shape: the dashed calendar form ONLY. date.fromisoformat
# alone is looser (basic "20260802", week dates) — a row in those shapes
# would pass the shape check yet fall out of every month window, the
# fail-open direction the breaker must not have.
AT_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")

# Gate-latency observations (ADR-0041): a $0, zero-token row recording how
# long a work order waited at one of the three human gates, written by the
# daily gate digest inside ADR-0034's open outcome vocabulary.
GATE_OUTCOME = re.compile(r"gate_wait:([a-z]+):(\d+)s")

# Owner-session markers (ADR-0069): a $0 row recording that a work order
# was worked in an owner session, not dispatched — "not a dispatch", so
# never a run. Written as outcome "owner-session:unmetered".
OWNER_SESSION = "owner-session:"

# The issue key (ADR-0084): a run that implements no single work order is
# keyed by the issue it served, "#<n>" with no leading zero. wo_token
# still returns None for it, so every work-order rule skips the row while
# dispatched() counts its spend.
ISSUE_KEY = re.compile(r"#[1-9][0-9]*")


def entry(wo, run_id, model, tokens, cost, outcome, at):
    """A well-formed ledger record, built from LEDGER_FIELDS +
    LEDGER_OPTIONAL_FIELDS so the field set cannot drift from what
    detector G checks — the single place a caller assembles one. `at` is
    the UTC date the row is written ("YYYY-MM-DD"): every NEW row carries
    it (the monthly circuit breaker windows on it), while legacy rows
    without it stay readable — required on the writer, optional on the
    reader."""
    record = dict(zip(LEDGER_FIELDS, (wo, run_id, model, tokens, cost,
                                      outcome)))
    record.update(zip(LEDGER_OPTIONAL_FIELDS, (at,)))
    return record


def gate_entry(wo, gate, waited_seconds, passed_at):
    """A gate-latency observation as a well-formed ledger record
    (ADR-0041): the work order waited `waited_seconds` at `gate` and
    passed it at `passed_at` (ISO timestamp, which keys the run_id so a
    re-observed passage dedups instead of double-recording, and whose date
    part is the row's `at` — gate rows need no clock).

    The composed outcome is checked against GATE_OUTCOME, the reader's
    own pattern, so the writer cannot state the grammar more loosely
    than the reader reads it. That is not belt-and-braces: dispatched()
    selects spend rows by exclusion, so a row gate_wait cannot parse is
    silently counted as a dispatched run against ADR-0034's monthly cap.
    Refusing loudly at the write boundary is the only outcome that keeps
    the ledger honest, and the three shipped gate names all pass."""
    outcome = f"gate_wait:{gate}:{int(waited_seconds)}s"
    if not GATE_OUTCOME.fullmatch(outcome):
        raise ValueError(
            f"{outcome!r} is not a gate row gate_wait can read: the gate "
            "name must be lowercase letters and the wait a whole "
            "non-negative number of seconds")
    return entry(wo, f"gate-{gate}-{passed_at}", "none", 0, 0.0, outcome,
                 at=passed_at[:10])


def in_month(entry, month):
    """True when the record's `at` date falls in `month` ("YYYY-MM") — the
    monthly circuit breaker's window predicate (ADR-0034). Legacy rows
    without `at` predate the field and belong to closed months by
    construction: in no window. Same tolerant shape as wo_token/gate_wait
    (a non-dict record or malformed field is simply not in the month)."""
    value = entry.get("at") if isinstance(entry, dict) else None
    return isinstance(value, str) and value.startswith(month + "-")


def gate_wait(entry):
    """The record's (gate, waited_seconds) when it is a gate-latency row,
    else None — the one predicate for callers that treat gate rows apart
    from dispatched runs (the digest dedups on them; the weekly report
    keeps them out of its run counts)."""
    value = entry.get("outcome") if isinstance(entry, dict) else None
    match = GATE_OUTCOME.fullmatch(value) if isinstance(value, str) else None
    if match is None:
        return None
    return match.group(1), int(match.group(2))


def owner_session(entry):
    """True when the record is an owner-session marker (ADR-0069: not a
    dispatch) — the one predicate for it, beside gate_wait. Detector G
    still validates the marker as a row; only dispatched() sets it
    apart. Same tolerant shape as gate_wait."""
    value = entry.get("outcome") if isinstance(entry, dict) else None
    return isinstance(value, str) and value.startswith(OWNER_SESSION)


def dispatched(entries, month=None):
    """The rows that count as spend, in ledger order: never a
    gate-latency observation (ADR-0041 — a wait record, not a run), never
    an owner-session marker (ADR-0069 — not a dispatch, and $0 by
    line_problems' rule, so the month's spend is the same with or
    without it), and when `month` ("YYYY-MM") is given only the rows in_month admits.

    The ONE row-selection rule behind both month-to-date figures — the
    weekly report's spend breakdown and the work queue's circuit-breaker
    input — so the number ADR-0034's cap is compared against has one
    definition rather than one per caller. Each caller keeps its own
    arithmetic and its own cap comparison; only which rows to walk is
    shared. A pure filter over already-validated rows (read()'s
    contract), in the same family as in_month, gate_wait, row_key and
    wo_token."""
    return [entry for entry in entries
            if gate_wait(entry) is None and not owner_session(entry)
            and (month is None or in_month(entry, month))]


def append(root, entry):
    """Append one line to docs/factory/costs.jsonl. APPEND ONLY: opens in
    "a" mode and never reads or rewrites existing lines — the ledger is the
    factory's measurement substrate and gets the same append-only
    discipline as evals/results/ (CLAUDE.md eval honesty). The raw
    primitive: it checks nothing, so writers go through record()."""
    ledger = Path(root) / COST_LEDGER
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with open(ledger, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")


def record(root, entry):
    """(problems): the one GUARDED write every ledger writer goes through
    (#736) — append() is the raw primitive under it. Refuses BEFORE the
    write, because a bad line is permanent:

      - a row line_problems rejects (the rule every reader applies, so a
        written row can never make a later read report a problem);
      - any read() problem: appending to a ledger that cannot be summed
        would undercount silently, and a failed read leaves no dedup set
        to check against (fail closed);
      - a row whose row_key is already recorded (ADR-0049's identity): a
        re-recorded run would double-count against the monthly cap.

    Shape and duplicate refusals are unlocated suffixes (line_problems'
    convention); read failures keep read()'s ledger: prefix. Callers
    prefix their own label. An empty list means the line landed."""
    shape = line_problems(entry)
    if shape:
        return shape
    entries, problems = read(root)
    if problems:
        return problems
    if row_key(entry) in {row_key(existing) for existing in entries}:
        return [f"run_id {entry['run_id']!r} is already in the ledger —"
                " recording it twice would double-count the run against"
                " the monthly cap"]
    append(root, entry)
    return []


def run_ledger_path(run_id):
    """The per-run ledger path for `run_id`, or None when that id is not
    a safe filename (a slash, a leading dot, or anything outside
    RUN_FILE_ID). Callers refuse None before they write."""
    if not isinstance(run_id, str) or RUN_FILE_ID.fullmatch(run_id) is None:
        return None
    return f"{RUNS_DIR}/{run_id}.jsonl"


def record_isolated(root, entry, skip_existing=False):
    """(problems): write `entry` to its own file under RUNS_DIR, never to
    the shared aggregate. The same refusals as record() — a bad shape, an
    unreadable ledger, an unsafe run_id, a row_key already recorded —
    happen before the write. `skip_existing` skips a duplicate instead of
    refusing it: carry hands over rows the batch branch may already hold.
    A second row with the same run_id and a different wo appends to that
    run's file; row_key, not the filename, is the identity."""
    shape = line_problems(entry)
    if shape:
        return shape
    rel = run_ledger_path(entry.get("run_id"))
    if rel is None:
        return [f"run_id {entry.get('run_id')!r} is not a safe ledger"
                " filename"]
    entries, problems = read(root)
    if problems:
        return problems
    if row_key(entry) in {row_key(existing) for existing in entries}:
        if skip_existing:
            return []
        return [f"run_id {entry['run_id']!r} is already in the ledger —"
                " recording it twice would double-count the run against"
                " the monthly cap"]
    path = Path(root) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")
    return []


def tracked_ledger_paths(root):
    """Ledger paths that exist under `root`: the aggregate when it is a
    file, then each per-run file, in name order. Close stages these so
    blocked-item spend reaches main without appending the aggregate."""
    root = Path(root)
    paths = []
    if (root / COST_LEDGER).is_file():
        paths.append(COST_LEDGER)
    runs = root / RUNS_DIR
    if runs.is_dir():
        paths.extend(
            f"{RUNS_DIR}/{path.name}"
            for path in sorted(runs.iterdir(), key=lambda item: item.name)
            if path.is_file() and path.suffix == ".jsonl"
            and run_ledger_path(path.name[:-len(".jsonl")]) is not None)
    return paths


def record_new(root, rows):
    """(landed, problems): the guarded write for a batch writer (#772) —
    record()'s rules over many rows with ONE read. A row whose row_key
    is already in the ledger, or earlier in the batch, is skipped, not
    refused: callers carrying or re-scanning rows hand over everything
    and never restate the dedup. landed is the rows appended, in order.

    Fails closed before any write: a read() problem, or any row
    line_problems rejects, refuses the whole batch and lands nothing.
    Every problem carries read()'s ledger: label (a shape refusal names
    the row's run_id), so callers pass them through as they are."""
    shape = [f"ledger: refusing run_id {row.get('run_id')!r}: {problem}"
             for row in rows for problem in line_problems(row)]
    if shape:
        return [], shape
    entries, problems = read(root)
    if problems:
        return [], problems
    present = {row_key(existing) for existing in entries}
    landed = []
    for row in rows:
        if row_key(row) not in present:
            append(root, row)
            present.add(row_key(row))
            landed.append(row)
    return landed, []


def row_key(entry):
    """The row's (wo, run_id) identity — ADR-0041's dedup rule in the
    module that composes both fields: gate_entry keys run_id on the
    passage timestamp so a daily re-scan builds a row with the SAME key,
    and the gate digest drops any row whose key is already recorded.
    Takes a well-formed row (read() entries, entry/gate_entry outputs);
    both fields are required on every row, so this subscripts — the read
    contract."""
    return entry["wo"], entry["run_id"]


def wo_token(entry):
    """The record's valid WO-#### token, or None. The shape complaint for
    an invalid one is line_problems' job; this is for callers (detector G)
    that cross-check a VALID token against the knowledge plane."""
    value = entry.get("wo") if isinstance(entry, dict) else None
    if isinstance(value, str) and WO_TOKEN.fullmatch(value):
        return value
    return None


def line_problems(entry):
    """Unlocated shape problems for one parsed ledger record (ADR-0034;
    `wo` is a WO-#### token or an ADR-0084 issue key):
    missing/unknown fields, per-field rules in LEDGER_FIELDS order, then
    the optional `at` rule (present means a valid ISO date; absent means a
    legacy row and is never a problem). An owner-session marker must
    cost 0 — the invariant dispatched()'s exclusion rests on. Callers prefix their own label and
    location — this is the single rule detector G and read() both apply."""
    problems = []
    missing = sorted(set(LEDGER_FIELDS) - set(entry))
    if missing:
        problems.append(
            f"ledger line is missing field(s): {', '.join(missing)}")
    unknown = sorted(
        set(entry) - set(LEDGER_FIELDS) - set(LEDGER_OPTIONAL_FIELDS))
    if unknown:
        problems.append(
            f"ledger line has unknown field(s): {', '.join(unknown)}")
    for field in LEDGER_FIELDS:
        if field not in entry:
            continue
        value = entry[field]
        if field == "wo":
            if not (isinstance(value, str)
                    and (WO_TOKEN.fullmatch(value)
                         or ISSUE_KEY.fullmatch(value))):
                problems.append(f"wo {value!r} is not a WO-#### token"
                                " or an issue key (#<n>)")
        elif field in LEDGER_TEXT_FIELDS:
            if not isinstance(value, str) or not value.strip():
                problems.append(f"{field} must be a non-empty string")
        elif field == "tokens":
            if isinstance(value, bool) or not isinstance(value, int) \
                    or value < 0:
                problems.append("tokens must be a non-negative integer")
        elif field == "cost":
            if isinstance(value, bool) or not isinstance(value, (int, float)) \
                    or value < 0:
                problems.append("cost must be a non-negative number")
            elif value != 0 and owner_session(entry):
                # dispatched() drops markers from spend on the grounds
                # that they are $0 (ADR-0069); a paid row mislabelled as
                # one would escape the monthly cap unreported (#815).
                problems.append("an owner-session marker must cost 0"
                                f" (ADR-0069), not {value!r}")
    for field in LEDGER_OPTIONAL_FIELDS:
        if field not in entry:
            continue
        value = entry[field]
        if field == "at":
            valid = isinstance(value, str) and AT_DATE.fullmatch(value)
            if valid:
                try:
                    date.fromisoformat(value)
                except ValueError:
                    valid = False
            if not valid:
                problems.append(
                    f"at {value!r} is not an ISO date (YYYY-MM-DD)")
    return problems


def parse(text):
    """[(lineno, entry, problems)] for every non-blank ledger line: entry
    is the parsed record (None when the line is not a JSON object) and
    problems are its unlocated parse + shape complaints. The one walk both
    detector G and read() are built on. The parse guard takes ValueError
    and RecursionError, not JSONDecodeError alone, as cli.read_file's does
    (ADR-0075): a line json.loads refuses any other way must be a problem
    too, or the monthly cap check raises where it promises to fail
    closed."""
    parsed = []
    for lineno, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except (ValueError, RecursionError) as err:
            parsed.append((lineno, None, [f"is not valid JSON: {err}"]))
            continue
        if not isinstance(record, dict):
            parsed.append((lineno, None, ["is not a JSON object"]))
            continue
        parsed.append((lineno, record, line_problems(record)))
    return parsed


def _load_one(path, shown, label):
    """(rows, problems) for one ledger file. rows is None when the file
    is absent. An explicit shown name keeps an injected ledger_path's
    problems worded as COST_LEDGER, which is what its callers pin."""
    text, problem = read_file(path, shown, str)
    if problem:
        return None, [f"{label}: {problem}"]
    if text is None:
        return None, []
    rows = [(lineno, record,
             [f"{label}: {shown}:{lineno} {suffix}"
              for suffix in suffixes])
            for lineno, record, suffixes in parse(text)]
    return rows, []


def load(root, label, ledger_path=None):
    """(rows, problems): the labelled ledger read every reader is built
    on — one existence check, one guarded read (cli.read_file), one
    located problem grammar. rows is parse()'s [(lineno, entry, problems)]
    with each problem located and prefixed for the caller
    ("<label>: <path>:<lineno> <suffix>"), or None when the ledger does
    not exist — None, not [], so a caller whose rules bite only once the
    ledger exists (detector G's merged-row cross-check) can tell an
    absent ledger from an empty one. problems carries only the file-level
    failure ("<label>: cannot read …"), so read() and detector G report
    an unreadable ledger with the same body under their own prefix.

    With no ledger_path, the aggregate and every file under RUNS_DIR are
    one ledger: historical rows stay in the aggregate, and a per-run file
    counts the same. An explicit ledger_path reads that file alone."""
    if ledger_path:
        return _load_one(Path(ledger_path), COST_LEDGER, label)
    root = Path(root)
    rows, problems = _load_one(root / COST_LEDGER, COST_LEDGER, label)
    if problems:
        return None, problems
    found = []
    runs = root / RUNS_DIR
    if runs.is_dir():
        for path in sorted(runs.iterdir(), key=lambda item: item.name):
            if not path.is_file() or path.suffix != ".jsonl":
                continue
            if run_ledger_path(path.name[:-len(".jsonl")]) is None:
                return None, [f"{label}: {RUNS_DIR}/{path.name} is not a"
                              " safe run-file name"]
            extra, problems = _load_one(path, f"{RUNS_DIR}/{path.name}",
                                        label)
            if problems:
                return None, problems
            found.extend(extra or [])
    if rows is None and not found:
        return None, []
    return (rows or []) + found, []


def read(root, ledger_path=None):
    """(entries, problems): every ledger line that satisfies the full
    ADR-0034 shape; anything else is excluded from entries and reported as
    a ledger:-prefixed problem, never silently dropped — an unaccountable
    line must not silently undercount spend (fail closed). An absent
    ledger is silent (no runs yet): the ledger is created by the first run
    that records into it, matching detector G's own convention.

    THE READ CONTRACT: entries are validated dicts — the full shape is
    established right here, so callers subscript LEDGER_FIELDS freely
    (cost_report.aggregate does; per-field accessors would be pure
    pass-throughs, below the seam bar). What the seam owns are the
    semantic rules over a row: row_key (identity), in_month (window),
    gate_wait (gate rows), wo_token (typed token)."""
    rows, problems = load(root, "ledger", ledger_path=ledger_path)
    entries = []
    for _, record, located in rows or ():
        problems.extend(located)
        if record is not None and not located:
            entries.append(record)
    return entries, problems
