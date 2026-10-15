#!/usr/bin/env python3
"""knowledge_plane: the shared grammar and layout of the knowledge plane
(ADR-0004, ADR-0037) — the typed-ID token grammar, the fence rule that
decides when such a token is quoted rather than claimed, the local
markdown link grammar every doc checker resolves links with, the
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
from collections import namedtuple
from pathlib import Path

from cli import read_file
from protocol import parse_frontmatter

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
# rule, and every caller (gates' H, M, N, O and D, validator's skip gate,
# md_claims, kb_drift) reads it from here, through `fenced`, rather than
# keeping a looser copy of its own.
FENCE_OPEN = re.compile(r"^\s*(?P<marker>`{3,}|~{3,})(?P<info>.*)$")
FENCE_CLOSE = re.compile(r"^\s*(?P<marker>`{3,}|~{3,})[ \t]*$")


# An open fence: its marker character and length, its info string
# (stripped), and the 1-based line number of the line that opened it.
Fence = namedtuple("Fence", "char length info lineno")


def _fence_open(line, lineno):
    """The Fence `line` opens, else None."""
    match = FENCE_OPEN.match(line)
    if not match:
        return None
    marker, info = match.group("marker"), match.group("info")
    # CommonMark: a backtick fence's info string may not contain a backtick.
    if marker[0] == "`" and "`" in info:
        return None
    return Fence(marker[0], len(marker), info.strip(), lineno)


def _fence_closes(line, fence):
    """Does `line` close `fence`?"""
    match = FENCE_CLOSE.match(line)
    if not match:
        return False
    marker = match.group("marker")
    return marker[0] == fence.char and len(marker) >= fence.length


def fenced(lines, start=1):
    """(lineno, line, fence) for every line that is not itself a fence
    marker, numbered from `start`; `fence` is the open Fence the line sits
    inside, or None outside every fence. If the input ends inside a fence,
    the last item is (fence.lineno, None, fence) — the unclosed event."""
    fence = None
    for lineno, line in enumerate(lines, start):
        if fence is not None:
            if _fence_closes(line, fence):
                fence = None
            else:
                yield lineno, line, fence
            continue
        fence = _fence_open(line, lineno)
        if fence is None:
            yield lineno, line, None
    if fence is not None:
        yield fence.lineno, None, fence


def unfenced(lines):
    """(lineno, line) for every line outside a fenced code block — fenced
    content is quoted, not asserted. An unterminated fence swallows the
    rest of the input."""
    for lineno, line, fence in fenced(lines):
        if fence is None:
            yield lineno, line


# A markdown inline link's destination, per CommonMark: optional leading
# whitespace, then either <angle brackets> (which may hold spaces) or a
# bare run with no whitespace and only balanced parentheses, then an
# optional "title", 'title' or (title), then the closing paren. Images
# share the grammar. One owner (issue #739): gates' detector I,
# md_claims, kb lint, kb_drift and lint.py's skill-asset check each kept
# a looser copy, and the copies read `[a](x.md "T")` three ways.
_LINK = re.compile(
    r"\]\(\s*(?:<(?P<angle>[^<>\n]*)>"
    r"|(?P<bare>(?:[^\s()<]|\([^\s()]*\))(?:[^\s()]|\([^\s()]*\))*)?)"
    r"""(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)""")
URL_TARGET = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:")


def local_link_targets(text):
    """Every local link destination in `text`, in order and as written
    (fragment and query kept; angle brackets and title dropped). URLs,
    in-page anchors and empty destinations are not local. Fence and
    inline-code skipping is each caller's policy, not the grammar's."""
    targets = [m.group("angle") if m.group("angle") is not None
               else m.group("bare") or "" for m in _LINK.finditer(text)]
    return [t for t in targets
            if t and not t.startswith("#") and not URL_TARGET.match(t)]


def resolve_link(root, doc, target):
    """The path a link in `doc` names: fragment and query dropped, a
    leading slash read from `root`, anything else from `doc`'s own
    directory. None when the target names no path (an anchor, a bare
    query, a URL)."""
    if URL_TARGET.match(target):
        return None
    path = target.split("#", 1)[0].split("?", 1)[0]
    if not path:
        return None
    if path.startswith("/"):
        return Path(root) / path.lstrip("/")
    return Path(doc).parent / path

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

    The one owner of the checked-row grammar (ADR-0058). Its one caller
    is parse_row below: every reader takes the answer as a row record's
    `done` field (issue #737). Detector G layers its own ADR-0043
    pre-ledger exclusion on top — that is the detector's rule, not the
    row grammar's. Same alignment caveat as protocol._CHECKBOX: change
    the bullet shape in one and the other must move with it.

    The ROW guard is the same one every sibling accessor opens with, and
    it is load-bearing rather than ceremonial: ROW requires whitespace
    after the closing bracket and DONE_ROW does not, so without it a
    checked box followed immediately by text is a checked row here and no
    row at all to row_size, row_title and the rest.
    """
    if not ROW.match(line):
        return False
    return bool(DONE_ROW.match(line))


def parse_row(line):
    """The breakdown row a line is, as one record, or None when the line
    is not a checkbox row (issue #737). The row_* accessors above are its
    field grammar; readers take fields from the record, never re-match a
    line, so prose — a Notes sub-bullet, a paragraph — naming a work
    order is not a row to any of them. `wo` is None for a checkbox row
    that names no work order: whether that matters is the caller's
    policy. `prd_ids` is every PRD token the row cites, in order."""
    if not ROW.match(line):
        return None
    return {
        "text": line, "wo": row_work_order(line), "done": row_done(line),
        "issue": row_tracker_issue(line), "size": row_size(line),
        "title": row_title(line), "blockers": row_blockers(line),
        "unreadable": row_unreadable_blockers(line),
        "pre_ledger": row_pre_ledger(line),
        "prd_ids": PRD_TOKEN.findall(line),
    }


def _row_block(lines, index):
    """The block the row at lines[index] owns (issue #857): the row,
    stripped, plus the lines under it — indented sub-bullets, blank
    lines between them included (a loose list) — up to the next row or
    the first unindented line, prose or heading. Trailing blank lines
    are not the block's."""
    block = [lines[index].strip()]
    for line in lines[index + 1:]:
        if ROW.match(line) or (line.strip() and not line[:1].isspace()):
            break
        block.append(line.rstrip())
    return "\n".join(block).rstrip()


def breakdown_rows(lines):
    """Every row record in a breakdown's lines, in order, each carrying
    its 1-based `lineno` and its `block` (_row_block) — the walk A, C,
    G, O and the dispatch-plane tools share instead of each re-reading
    every line."""
    return [{**row, "lineno": index + 1, "block": _row_block(lines, index)}
            for index, row in ((n, parse_row(line))
                               for n, line in enumerate(lines))
            if row is not None]


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
    work-order rows — the assembler, the validator and gates'
    detectors — opens the same files in the same run order.
    Row grammar is breakdown_rows' (ADR-0039 put it here); slice and
    row-reading policy stay with each caller (ADR-0037).
    """
    for run in run_dirs(root):
        breakdown = run / "breakdown.md"
        if breakdown.is_file():
            yield breakdown, breakdown.read_text(
                encoding="utf-8").splitlines()


def work_orders(root, files=None):
    """(index, problems): the row a work order or an issue owns (issue
    #857). index["wo"] maps a WO token, index["issue"] a tracker issue
    number, to its breakdown row record — breakdown_rows' fields plus
    `path` (the breakdown.md) and `clashes`. Every lookup in either
    direction (ADR-0039: each caller keeps its own) reads this one
    index, so they cannot disagree.

    One duplicate policy: the first row in breakdown_files order owns
    the key, and a later row naming the same WO or tracker issue is an
    unlabelled problem, `<rel>:<lineno> <WO> duplicates the row at
    <rel>:<lineno>` (or `(tracker: #N)` in the WO's place). Each clash
    is also listed in the `clashes` of both rows it names, so a caller
    that acts on one row — a dispatch, a label flip — can refuse it.

    `files` is (breakdown path, lines) in breakdown_files order, default
    a fresh breakdown_files(root): gates' detector C hands in the walk
    parse_run already read rather than reading it again (issue #886)."""
    root = Path(root)
    index, problems = {"wo": {}, "issue": {}}, []
    for path, lines in breakdown_files(root) if files is None else files:
        for row in breakdown_rows(lines):
            record = {**row, "path": path, "clashes": []}
            for kind, key, shown in (
                    ("wo", row["wo"], row["wo"]),
                    ("issue", row["issue"], f"(tracker: #{row['issue']})")):
                if key is None:
                    continue
                first = index[kind].setdefault(key, record)
                if first is record:
                    continue
                clash = (f"{path.relative_to(root)}:{row['lineno']} {shown}"
                         f" duplicates the row at"
                         f" {first['path'].relative_to(root)}"
                         f":{first['lineno']}")
                problems.append(clash)
                first["clashes"].append(clash)
                record["clashes"].append(clash)
    return index, problems


def mirror_map(root):
    """{tracker issue number: WO token} from the breakdown rows. The
    knowledge plane is authoritative and the mirror one-way (ADR-0032):
    a row with no (tracker: #N) simply is not in any queue, and an issue
    with no row is not a work order. Read from work_orders, so a
    duplicated tracker maps to the row every other lookup resolves.

    The one composition of the two names above that the tracker-facing
    tools — the gate digest, the miner, the dashboard — all need, and
    the reason ADR-0039 put the mirror grammar here in the first place:
    it reads rows, and it names no gate."""
    index, _ = work_orders(root)
    return {number: row["wo"] for number, row in index["issue"].items()
            if row["wo"]}


# The ADR record (issue #747): which files in docs/adr are decision
# records, what status each declares, and its standing. Six readers used
# to answer these with three file globs and three status readers, so a
# file one of them called an ADR another called a dangling citation.
#
# An ADR file is named by its number: this repo's `0062-slug.md`, a bare
# `0062.md`, or the `ADR-007-slug.md` form other repos use. README.md and
# TEMPLATE.md carry no number and are skipped by the same test.
ADR_FILE = re.compile(r"^(?:ADR-?)?(?P<num>\d+)\b", re.IGNORECASE)


def adr_file_number(name):
    """(number, written) for an ADR filename, or None if NAME is not
    one. `written` is the digits as the filename has them; `number` is
    the same value at the one width every reader keys on — ADR_TOKEN's
    citations, gates' index rows, standards_index sources — so
    `ADR-007-auth.md` is ADR-0007 (issue #774)."""
    match = ADR_FILE.match(name)
    if not match:
        return None
    written = match.group("num")
    return f"{int(written):04d}", written


def adr_digits(number, written):
    """NUMBER's digits at the width WRITTEN (adr_file_number's `written`,
    or a citation's digits) has, so a renumbered `ADR-027` stays 3-digit
    (issue #860)."""
    return f"{int(number):0{len(written)}d}"


def adr_citation(number):
    """A citation of ADR NUMBER at whatever width it is written, its
    digits in group `num`: `ADR-027` and `ADR-0027` both cite 27. Only
    the renumberer reads this; ADR_TOKEN stays the gates' 4-digit
    grammar (#774, #821)."""
    return re.compile(rf"\bADR-(?P<num>0*{int(number)})\b")


# The status vocabulary (docs/adr/README.md), as a status head plus an
# optional free-text annotation: "accepted (shipped by ...)" is accepted.
# Only full supersession retires a decision — "superseded in part by" and
# "amended by" leave the ADR live, so citing it is not drift.
ADR_STATUS = re.compile(
    r"^(accepted|provisional"
    r"|(?P<retired>superseded by ADR-(?P<by>\d{4}))"
    r"|superseded in part by ADR-\d{4}"
    r"|amended by ADR-\d{4})"
    r"(\s*\(.*\))?$")
ADR_STATUS_LINE = re.compile(r"^-\s*Status:\s*(.+?)\s*$")
# A frontmatter `status:` field: the fallback when no Status line exists.
_FRONTMATTER_STATUS = re.compile(r"^status:\s*(.*?)\s*$")


def adr_paths(root):
    """[(number, Path)] for every ADR file under root/docs/adr, in
    filename order; [] when there is no such directory. The one ADR
    file set every reader consults."""
    adr_dir = Path(root) / "docs" / "adr"
    if not adr_dir.is_dir():
        return []
    found = []
    for path in sorted(adr_dir.glob("*.md")):
        numbered = adr_file_number(path.name)
        if numbered:
            found.append((numbered[0], path))
    return found


def status_head(text):
    """The decision state alone, annotation stripped; None if unknown."""
    match = ADR_STATUS.match(text or "")
    return match.group(1) if match else None


def standing(text):
    """The standing of one raw status text:
      active        accepted, or amended by a later ADR
      provisional   recorded without live confirmation — live, held softer
      partial       superseded in part — live outside the superseded part
      retired       superseded by a later ADR — citing it is drift
      unrecognized  no status, or one outside the grammar"""
    match = ADR_STATUS.match(text or "")
    if not match:
        return "unrecognized"
    if match.group("retired"):
        return "retired"
    head = match.group(1)
    if head == "provisional":
        return "provisional"
    if head.startswith("superseded in part"):
        return "partial"
    return "active"


def _declared_status(lines):
    """(lineno, raw status text) from the `- Status:` line, else from a
    frontmatter `status:` field, else (0, None)."""
    for lineno, line in enumerate(lines, 1):
        match = ADR_STATUS_LINE.match(line)
        if match:
            return lineno, match.group(1)
    if lines and lines[0].strip() == "---":
        for lineno, line in enumerate(lines[1:], 2):
            if line.strip() == "---":
                break
            match = _FRONTMATTER_STATUS.match(line)
            if match and match.group(1):
                return lineno, match.group(1)
    return 0, None


def adr_record(path, lines):
    """One ADR, read once: {number, written, path, lineno, status, head,
    standing, superseded_by, title, lines}. PATH must be an adr_paths
    file; LINES are its lines (a read_adrs entry). number and written
    are adr_file_number's pair. lineno is the line the status was read
    from, 0 when it declares none; superseded_by is the retiring ADR's
    number, or None; title is the first `# ` heading's text, or None."""
    lineno, text = _declared_status(lines)
    match = ADR_STATUS.match(text or "")
    number, written = adr_file_number(path.name)
    return {"number": number,
            "written": written,
            "path": path,
            "lineno": lineno,
            "status": text,
            "head": match.group(1) if match else None,
            "standing": standing(text),
            "superseded_by": (match.group("by")
                              if match and match.group("retired") else None),
            "title": next((line[2:].strip() for line in lines
                           if line.startswith("# ")), None),
            "lines": lines}


def read_adrs(root):
    """([(Path, [str])], problems): every adr_paths file under ROOT with
    its lines, in that order — the one ADR read (issue #855), guarded by
    cli.read_file (ADR-0075). A file that cannot be read is left out
    and named in an unlabelled problem string, `cannot read
    docs/adr/<name>: <err>`, which each caller labels."""
    root = Path(root)
    files, problems = [], []
    for _, path in adr_paths(root):
        text, problem = read_file(path, path.relative_to(root).as_posix(),
                                  str)
        if problem:
            problems.append(problem)
        elif text is not None:
            files.append((path, text.splitlines()))
    return files, problems


def adr_records(root):
    """(records, problems): adr_record for every file read_adrs reads
    under ROOT, in that order, and its read problems."""
    files, problems = read_adrs(root)
    return [adr_record(path, lines) for path, lines in files], problems


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
    every detector whose gates.ROSTER row declares a parsed input (K, N
    and O joined those six later), and each of their own filesystem
    reads is gone.

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
        A field is None when that run carries no such file, or when
        cli.read_file could not read it (ADR-0094) — then named in
        "artifact_problems". verification_error carries str(err) when
        verification.md exists but could not be decoded —
        check_evidence_honesty's own "H: {rel} cannot be read: {err}"
        case — with verification then None.
      "adr_files": [(Path, [str]), ...] — read_adrs' files: every
        adr_paths file it could read, in that order — adr_record reads
        an entry. The ADRs alone are read guarded (issue #855), since
        adr_status and the standards index share this read and promise
        problem strings.
      "adr_problems": [str] — read_adrs' unlabelled problems, one per
        ADR left out of "adr_files"; detector D labels and reports them.
      "adr_readme": [str] | None for docs/adr/README.md, read guarded.
      "artifact_problems": [str] — unlabelled `cannot read <rel>: <err>`,
        one per breakdown/PRD/architecture or index left None unread;
        detector D reports them (ADR-0094).
      "scannable": [(Path, [str]), ...], one entry per path in
        `scannable` it could read, in that order — guarded by
        cli.read_file like the ADRs (issue #877), since one undecodable
        doc anywhere in the tree otherwise crashes a full gates run.
      "scannable_problems": [str] — unlabelled `cannot read <rel>: <err>`
        problems, one per `scannable` path left out; detector D labels and
        reports them beside adr_problems.

    Read-only: parse_run never writes.
    """
    artifact_problems = []

    def guarded_text(path):
        """One guarded read (ADR-0094): the file's text, or None when it
        is absent or unreadable — an unreadable one also named once in
        artifact_problems."""
        text, problem = read_file(path, path.relative_to(root).as_posix(),
                                  str)
        if problem:
            artifact_problems.append(problem)
        return text

    def guarded_lines(path):
        text = guarded_text(path)
        return None if text is None else text.splitlines()

    runs = []
    for run in run_dirs(root):
        verification = run / "verification.md"
        verification_text = None
        verification_error = None
        if verification.is_file():
            try:
                verification_text = verification.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as err:
                verification_error = str(err)
        breakdown = guarded_lines(run / "breakdown.md")
        prd_text = guarded_text(run / "prd.md")
        prd_fields = ((parse_frontmatter(prd_text) or {})
                      if prd_text is not None else {})
        runs.append({
            "path": run,
            "breakdown": breakdown,
            "prd_id": prd_fields.get("id"),
            "prd": None if prd_text is None else prd_text.splitlines(),
            "prd_date": prd_fields.get("date"),
            "architecture": guarded_lines(run / "architecture.md"),
            "verification": verification_text,
            "verification_error": verification_error,
        })

    adr_files, adr_problems = read_adrs(root)
    adr_readme = guarded_lines(root / "docs" / "adr" / "README.md")

    scanned, scannable_problems = [], []
    for path in scannable:
        text, problem = read_file(path, path.relative_to(root).as_posix(),
                                  str)
        if problem:
            scannable_problems.append(problem)
        elif text is not None:
            scanned.append((path, text.splitlines()))

    return {"runs": runs, "adr_files": adr_files,
            "adr_problems": adr_problems, "adr_readme": adr_readme,
            "scannable": scanned, "scannable_problems": scannable_problems,
            "artifact_problems": artifact_problems}


def repo_root():
    """Nearest ancestor containing .git (dir or worktree file): correct at
    the factory repo root and stamped at tools/factory/ in a product repo."""
    here = Path(__file__).resolve().parent
    for candidate in (here, *here.parents):
        if (candidate / ".git").exists():
            return candidate
    return here
