#!/usr/bin/env python3
"""knowledge_plane: the shared grammar and layout of the knowledge plane
(ADR-0004, ADR-0037) — the typed-ID token grammar, the fence rule that
decides when such a token is quoted rather than claimed, the
run-directory layout, and where a factory tool finds the repo root.

These primitives grew up inside gates.py because its detectors needed
them first, but every dispatch-plane tool reads the same plane:
assembler.py resolves breakdown rows, validator.py maps work orders to
tracker issues, orientation_pack.py bundles cited ADRs, budget_guard.py
and cost_report.py locate the repo — and each imported gates for the
privilege, while label_sync.py carried its own repo_root copy. ADR-0037
gives the plane's grammar one home; gates.py keeps only the detectors.

parse_run (ADR-0039's amendment, ADR-0068) widens the walk from
run_dirs/breakdown_files to the run-level artifacts several detectors
independently re-read 3-4x per pass — still read-only, still no
row/slice policy. Issue #442 wired gate detectors A, C, D, G, H and I
onto it; `scannable` is the one addition that migration made: gates.py
keeps `_scannable_files` (its OWN policy — which directories count as
"scannable" is a gates.py detector choice, not run layout), and hands
parse_run the already-selected path list to read once, alongside
everything else this function already reads once.
"""
import re
from pathlib import Path

from protocol import read_frontmatter

PRD_TOKEN = re.compile(r"\bPRD-\d{4}\b")
ADR_TOKEN = re.compile(r"\bADR-(\d{4})\b")
WO_TOKEN = re.compile(r"\bWO-\d{4}\b")
# GitHub's issue-closing keywords, with the optional colon form
# ("Closes: #12") and any run of whitespace before the issue number. The
# number is captured: detector B only asks whether a link exists, but
# validator.py asks WHICH issues a PR closes (it is how a merged PR names
# the one work order it implements), and the closing grammar lives here.
CLOSES_TOKEN = re.compile(
    r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+#(\d+)\b",
    re.IGNORECASE)

# Untrusted-text policy, homed here because its redaction rule IS the WO
# token grammar above. Both tracker-facing writers need it — sweeps.py
# quotes Sentry payloads and detector output, rejection_mining.py quotes
# agent rejection excerpts — and only one of them is mirrored into the
# stamped payload, so a home in sweeps.py left the stamped
# rejection_mining.py importing a module that is not there (#305).
#
# ASCII C0/DEL plus the Unicode format characters that render as nothing but
# reorder or hide text: zero-width (U+200B-200D), bidi marks and overrides
# (U+200E-200F, U+202A-202E), directional isolates (U+2066-2069) and the BOM.
CONTROL = re.compile(
    "[\x00-\x08\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e"
    "\u2066-\u2069\ufeff]")
FENCE = re.compile(r"`{3,}")
REDACTED_WO = "WO-[redacted]"
FIELD_LIMIT = 300


def sanitize(value, limit=FIELD_LIMIT):
    """Untrusted external text -> one safe, bounded line of data. Control
    characters go (they hide content in a terminal), fence runs are defanged
    (they are how quoted text would escape its code block), whitespace
    collapses to single spaces, WO ids are redacted (neither a sweep intake
    nor a mined queue entry may name a work order — ADR-0032), and the
    result is length-capped."""
    text = "" if value is None else str(value)
    text = CONTROL.sub(" ", text)
    text = FENCE.sub("'''", text)
    text = WO_TOKEN.sub(REDACTED_WO, text)
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[:limit - 3].rstrip() + "..."
    return text


# CommonMark fences, tracked as a stack of one — NOT a parity toggle. An
# opening fence records its marker character and length; only a fence of the
# SAME character, AT LEAST as long, and carrying NO info string closes it. So
# evidence that quotes markdown (a ```bash block inside a ~~~ block, a ```
# inside a ````) stays content instead of desyncing the scanner and silently
# swallowing every criterion below it (an unclosed fence is H's to report).
# Deliberate deviation from CommonMark: the indent is unbounded, because
# verification evidence is nested under `- Evidence:` list items, where the
# fence is indented to the item's content column. We do not track containers,
# and false-positiving on honest nested evidence is the worse error.
# One owner: deciding that a line is quoted rather than asserted is this
# rule, and every caller (gates' H, M, N, O and D, validator's skip gate)
# reads it from here rather than keeping a looser copy of its own.
FENCE_OPEN = re.compile(r"^\s*(?P<marker>`{3,}|~{3,})(?P<info>.*)$")
FENCE_CLOSE = re.compile(r"^\s*(?P<marker>`{3,}|~{3,})[ \t]*$")


def fence_open(line):
    """(marker char, marker length) if `line` opens a fence, else None."""
    match = FENCE_OPEN.match(line)
    if not match:
        return None
    marker, info = match.group("marker"), match.group("info")
    # CommonMark: a backtick fence's info string may not contain a backtick.
    if marker[0] == "`" and "`" in info:
        return None
    return marker[0], len(marker)


def fence_closes(line, char, length):
    """Does `line` close a fence opened with `length` copies of `char`?"""
    match = FENCE_CLOSE.match(line)
    if not match:
        return False
    marker = match.group("marker")
    return marker[0] == char and len(marker) >= length


def unfenced(lines):
    """(lineno, line) for every line outside a fenced code block — fenced
    content is quoted, not asserted. An unterminated fence swallows the
    rest of the input."""
    fence = None
    for lineno, line in enumerate(lines, 1):
        if fence is not None:
            if fence_closes(line, fence[0], fence[1]):
                fence = None
            continue
        fence = fence_open(line)
        if fence is None:
            yield lineno, line


# A breakdown row is a checkbox bullet line; its work order is its FIRST
# WO token (later tokens are blocking edges). Notes and Accept: sub-bullets
# are prose, never rows. One grammar for the whole dispatch plane:
# validator (row -> tracker issue), assembler (row -> dispatch), and
# orientation_pack (row -> owned block) all read it from here.
# protocol._CHECKBOX (stage completion) stays a separate owner — protocol
# must not depend on this factory seam, and it captures the box contents
# this one doesn't — but its bullet-and-whitespace shape is aligned with
# this regex; change them together or completion counting and dispatch
# will disagree about the same line. It is the ONLY other owner:
# gates.MERGED_ROW was a third, identical to DONE_ROW below, and ADR-0058
# retired it.
ROW = re.compile(r"^\s*[-*+]\s+\[[ xX]\]\s")


def row_work_order(line):
    """The work order a breakdown row carries: its first WO token, or None
    when the line is not a checkbox row or names no work order."""
    if not ROW.match(line):
        return None
    tokens = WO_TOKEN.findall(line)
    return tokens[0] if tokens else None


# The dispatch mirror's marker on a breakdown row (ADR-0032: the row,
# never the issue, is authoritative). One grammar for both mirror
# directions (ADR-0039): the assembler resolves issue# -> row, the
# validator row -> issue#, each through the accessor below.
TRACKER = re.compile(r"\(tracker:\s*#(\d+)\)")


def row_tracker_issue(line):
    """The issue number a breakdown row mirrors to — its `(tracker: #N)`
    marker — or None when the line is not a checkbox row or carries no
    marker. Sibling of row_work_order: the mirror grammar lives here,
    each caller keeps its own lookup direction."""
    if not ROW.match(line):
        return None
    match = TRACKER.search(line)
    return int(match.group(1)) if match else None


# A row merged before the cost ledger was born carries this trailing
# annotation (ADR-0043): the exemption is a fact about a work order, so
# it lives on the row it describes, never as a repo-specific list in a
# mirrored module. The grammar lives here with its row siblings; the
# skip policy (detector G exempts annotated rows from its
# merged-row-must-be-recorded check) stays with gates.py.
PRE_LEDGER_MARK = "(pre-ledger)"
_PRE_LEDGER = re.compile(re.escape(PRE_LEDGER_MARK) + r"\s*$")


def row_pre_ledger(line):
    """Does this breakdown row carry the (pre-ledger) annotation
    (ADR-0043)? The annotation is written TRAILING — the mark ends the
    row, after the tracker mirror — so only a checkbox row ending with
    it is annotated. The mark as mid-row prose (a row about the
    annotation) marks nothing, and a non-row line never does."""
    return bool(ROW.match(line)) and bool(_PRE_LEDGER.search(line))


# A row's own declared metadata. `size:` is the cost band (factory_config
# resolves it to a dollar budget) and `blocked by:` is the dependency edge
# the ROW comment above refers to as "later tokens". Both are clause-scoped
# so the trailing `(PRD-...)` and `(tracker: #N)` markers can never be read
# as part of them.
DONE_ROW = re.compile(r"^\s*[-*+]\s+\[x\]", re.IGNORECASE)
SIZE = re.compile(r"\bsize:\s*([SML])\b")
BLOCKED_BY = re.compile(r"\bblocked by:\s*([^(]*)")


def row_size(line):
    """The row's declared size band ("S"/"M"/"L"), or None.

    factory_config.resolve_budget turns it into the dollar budget, so a
    caller planning a batch can price the batch before running it rather
    than discovering the cost afterwards (ADR-0034).
    """
    if not ROW.match(line):
        return None
    match = SIZE.search(line)
    return match.group(1) if match else None


TITLE = re.compile(r"\*\*WO-\d{4}\*\*\s*(.*)")


def row_title(line):
    """The row's human title — the text between its bold WO token and
    the em-dash metadata clause (size, blockers, citations) — or None
    when the line is not a checkbox row or writes no bold token. Read
    by the dashboard's factory-output table; the mirrored issue's title
    leads with the WO token instead, so neither derives from the
    other."""
    if not ROW.match(line):
        return None
    match = TITLE.search(line)
    if not match:
        return None
    title = match.group(1).split(" — ")[0].strip()
    return title or None


def row_blockers(line):
    """The work orders this row declares it is blocked by.

    Read from the `blocked by:` clause only — NOT "every WO token after
    the first", which would swallow a work order merely mentioned in the
    row's prose and park the row forever. An em-dash (the written form of
    "nothing") yields an empty list, same as an absent clause.
    """
    if not ROW.match(line):
        return []
    match = BLOCKED_BY.search(line)
    return WO_TOKEN.findall(match.group(1)) if match else []


# What a blocked-by clause may hold besides WO tokens: separators, and a
# lone dash, the written form of "nothing".
_BLOCKER_SEPARATORS = re.compile(r"[\s,;&]+|\band\b")
_NOTHING = ("", "—", "–", "-")


def row_unreadable_blockers(line):
    """What the row's `blocked by:` clause says that names no work order,
    or None when every part of it reads.

    row_blockers reads WO tokens only, so a clause naming a title
    ("blocked by: Export API") or a mistyped id ("WO-001") reads as no
    blockers at all, and a planner would dispatch the row before its
    dependency. A caller asks this first and refuses to guess (beads
    wo-o3l). The WO tokens a mixed clause does name still count.
    """
    if not ROW.match(line):
        return None
    match = BLOCKED_BY.search(line)
    if not match:
        return None
    rest = WO_TOKEN.sub(" ", match.group(1)).strip()
    if rest in _NOTHING:
        return None
    residue = " ".join(_BLOCKER_SEPARATORS.sub(" ", rest).split())
    return residue or None


def row_done(line):
    """Whether a breakdown row is checked off.

    The one owner of the checked-row grammar (ADR-0058). Call sites
    (derived, not counted by hand — pinned in both directions by
    test_the_documented_call_sites_are_the_real_ones): gates.py,
    plane_drift.py, work_queue.py — nothing else asks. The reconcile
    sweep and the dashboard reach this grammar THROUGH
    plane_drift.reconcile_drift rather than directly (ADR-0060), which
    is why neither appears above; an earlier hand-typed list still named
    them, and their fold into one shared rule, and said five. Detector G
    layers its own ADR-0043 pre-ledger exclusion on top at its call
    site — that is the detector's rule, not the row grammar's, which is
    why it is not here. Same alignment caveat as protocol._CHECKBOX:
    change the bullet shape in one and the other must move with it.

    The ROW guard is the same one every sibling accessor opens with, and
    it is load-bearing rather than ceremonial: ROW requires whitespace
    after the closing bracket and DONE_ROW does not, so without it a
    checked box followed immediately by text is a checked row here and no
    row at all to row_size, row_title and the rest. The one place that
    difference escaped was detector G, which reaches this accessor
    through a raw WO_TOKEN.search rather than through a sibling.
    """
    if not ROW.match(line):
        return False
    return bool(DONE_ROW.match(line))


def run_dirs(root):
    """Candidate run directories per the pipeline protocol."""
    dirs = [root / "docs"]
    for parent in ("features", "fixes"):
        base = root / "docs" / parent
        if base.is_dir():
            dirs.extend(p for p in sorted(base.iterdir()) if p.is_dir())
    return [d for d in dirs if d.is_dir()]


def breakdown_files(root):
    """(breakdown path, its lines) per run that has a breakdown.md.

    The layout walk in one place: every dispatch-plane reader of
    work-order rows — the assembler, the validator, orientation_pack,
    and gates' detectors — opens the same files in the same run order.
    Row and slice grammar stay with each caller (ADR-0037: this
    concentrates layout knowledge, not row-reading policy).
    """
    for run in run_dirs(root):
        breakdown = run / "breakdown.md"
        if breakdown.is_file():
            yield breakdown, breakdown.read_text(
                encoding="utf-8").splitlines()


def mirror_map(root):
    """{tracker issue number: WO token} from the breakdown rows. The
    knowledge plane is authoritative and the mirror one-way (ADR-0032):
    a row with no (tracker: #N) simply is not in any queue, and an issue
    with no row is not a work order.

    The one composition of the three names above that the tracker-facing
    tools — the gate digest, the miner, the dashboard — all need, and
    the reason ADR-0039 put the mirror grammar here in the first place:
    it reads rows, and it names no gate."""
    mapping = {}
    for _, lines in breakdown_files(root):
        for line in lines:
            wo = row_work_order(line)
            number = row_tracker_issue(line)
            if wo and number is not None:
                mapping[number] = wo
    return mapping


def parse_run(root, scannable=()):
    """Every artifact the gate detectors read from `root`, read ONCE.

    ADR-0037 kept this module walk-only ("Row and slice grammar stay
    with each caller") because nothing had yet observed a caller re-read
    the SAME file more than once. That changed (ADR-0039's amendment,
    issue #441's "expand" step of an expand->migrate->contract
    sequence): detector A (check_wo_citation) and detector G
    (check_cost_ledger, through both collect_wo_rows and merged_wo_rows)
    each call breakdown_files independently, so one run_all pass
    re-globs and re-reads every breakdown.md up to four times; detectors
    C, D and I each independently re-glob and re-read the same wider
    markdown tree via gates._scannable_files. parse_run widens the
    walk-only seam to read the run-level overlap once, as plain data —
    a dict of lists/tuples, no class, matching every other accessor in
    this module (there is no dataclass/NamedTuple precedent here to
    follow instead).

    Issue #441 added this function, unused; issue #442 (the "migrate"
    step) wired detectors A, C, D, G, H and I onto it — gates.run_all
    now calls parse_run once per pass and hands the same parsed dict to
    each of those six, and each of their own filesystem reads is gone.

    `scannable`: an iterable of Paths the CALLER has already selected
    (gates._scannable_files(root), for detectors C, D and I) — read once
    each, in the given order, into the "scannable" key below. Selecting
    WHICH paths count as scannable stays gates.py's own policy (which
    directories to walk, which to exclude, is a detector choice, not run
    layout — issue #441 flagged this and left the call for #442, which
    chose to keep the selection in gates.py and hand parse_run the
    already-selected list, so this module still owns no directory-walk
    policy beyond run_dirs). The default `()` reads nothing, so callers
    that never touch "scannable" (detectors A, G, H) pay nothing for it.

    Deliberately NOT covered here: detector E (the template payload's
    byte hashes, via manifest_files), F (factory.json, via
    factory_config.py), G's OWN ledger read (docs/factory/costs.jsonl,
    via cost_ledger.py — G's collect_wo_rows/merged_wo_rows cross-checks
    moved here, but the ledger file itself is cost_ledger.py's dedicated
    seam), J (.github/labels.json + the Makefile, via label_sync.py) and
    B (the CI event payload, via cli.read_event) each already read their
    own artifact exactly once, through their own dedicated seam or
    single-pass function — there was no cross-detector re-read to remove
    there, so #442 left them untouched.

    Returns a dict:
      "runs": one entry per run_dirs(root), in that order —
        {"path": Path, "breakdown": [str] | None, "prd_id": str | None,
         "prd": [str] | None, "prd_date": str | None,
         "architecture": [str] | None, "verification": str | None,
         "verification_error": str | None}.
        "prd" and "prd_date" (the frontmatter `date:`) are what detectors
        N and O read (ADR-0071, ADR-0072).
        A field is None when that run carries no such file.
        verification_error carries str(err) when verification.md exists
        but could not be decoded — check_evidence_honesty's own
        "H: {rel} cannot be read: {err}" case — with verification then
        None; every other artifact here is read the way its current
        caller already reads it: uncaught, because no current caller
        catches a read error there either.
      "adr_files": [(Path, [str]), ...] for docs/adr/NNNN-*.md, in the
        same sorted order check_blueprint_drift and check_link_integrity
        already glob it.
      "adr_readme": [str] | None for docs/adr/README.md.
      "scannable": [(Path, [str]), ...], one entry per path in
        `scannable`, in that order — read uncaught, same as every other
        entry above.

    Read-only: parse_run never writes.
    """
    runs = []
    for run in run_dirs(root):
        breakdown = run / "breakdown.md"
        prd = run / "prd.md"
        architecture = run / "architecture.md"
        verification = run / "verification.md"
        verification_text = None
        verification_error = None
        if verification.is_file():
            try:
                verification_text = verification.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as err:
                verification_error = str(err)
        prd_fields = (read_frontmatter(prd) or {}) if prd.is_file() else {}
        runs.append({
            "path": run,
            "breakdown": (breakdown.read_text(encoding="utf-8").splitlines()
                         if breakdown.is_file() else None),
            "prd_id": prd_fields.get("id"),
            "prd": (prd.read_text(encoding="utf-8").splitlines()
                    if prd.is_file() else None),
            "prd_date": prd_fields.get("date"),
            "architecture": (architecture.read_text(
                encoding="utf-8").splitlines()
                if architecture.is_file() else None),
            "verification": verification_text,
            "verification_error": verification_error,
        })

    adr_dir = root / "docs" / "adr"
    adr_files = []
    adr_readme = None
    if adr_dir.is_dir():
        for path in sorted(adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md")):
            adr_files.append(
                (path, path.read_text(encoding="utf-8").splitlines()))
        readme = adr_dir / "README.md"
        if readme.is_file():
            adr_readme = readme.read_text(encoding="utf-8").splitlines()

    scanned = [(path, path.read_text(encoding="utf-8").splitlines())
              for path in scannable]

    return {"runs": runs, "adr_files": adr_files, "adr_readme": adr_readme,
            "scannable": scanned}


def repo_root():
    """Nearest ancestor containing .git (dir or worktree file): correct at
    the factory repo root and stamped at tools/factory/ in a product repo."""
    here = Path(__file__).resolve().parent
    for candidate in (here, *here.parents):
        if (candidate / ".git").exists():
            return candidate
    return here
