#!/usr/bin/env python3
"""standards_index: the one home of the normative-statement index's shape
(ADR-0073) — docs/standards.json's statement shape, the `## Normative
statements` ADR-heading bullet grammar, the regeneration algorithm, and
the `update` CLI verb.

Before this seam existed, regenerating docs/standards.json and validating
it (gates.py's detector K) would each have needed to parse `## Normative
statements` sections out of docs/adr/*.md independently — two real call
sites needing the identical shape/parsing logic from the moment K exists,
the same "two real callers" relationship cost_ledger.py already has with
detector G (ADR-0037). Conventions match cost_ledger.py: a pure parser
(parse_bullet) returns unlocated problem suffixes for callers that locate
and label their own; build_index walks docs/adr/*.md once and returns
(entries, LOCATED problems, already prefixed with the caller's label via
`load`) — gates.py's detector K is that caller, passing "K" the same way
detector G passes "G" to cost_ledger.load.

The statement shape (ADR-0073's Component 1, architecture.md): a
docs/standards.json entry is
    {slug, statement, level, source, status, domain}
  level ∈ {MUST, SHOULD} — the RFC-2119 keyword family the statement's
    own sentence carries (a "MUST NOT"/"SHOULD NOT" keyword still buckets
    to its MUST/SHOULD family; the NOT is part of the statement text, not
    a third level value).
  status ∈ {advisory, enforced} — ADR-0073 decision (c): this field is
    the ONLY place enforcement status lives. An ADR's `## Normative
    statements` bullet never carries a status; a promotion is a
    docs/standards.json edit, never an ADR edit. build_index therefore
    always emits "advisory" for every ADR-derived entry it builds fresh
    — it has no other honest source for status, and does not read the
    previously committed file to guess one. This is a known, deliberate
    limitation, not an oversight: see ADR-0073's Consequences for what
    it means for a promoted statement across a later regeneration, and
    why gates.py's detector K's drift check must not compare `status`.
  domain ∈ {factory, pipeline, eval, docs} — declared on the bullet
    itself (there is no other source to infer it from).
  source — "adr/NNNN#<slug>" for an ADR-derived entry (this module's own
    output), or "CLAUDE.md#<anchor>" for a hand-curated entry (WO-0057,
    written directly into docs/standards.json by a human, never by this
    module — HAND_CURATED_PREFIX is the one string both `update` and
    gates.py's detector K use to recognise and leave one alone).

Bullet grammar (new with this module — no existing ADR uses it yet; the
back-fill is breakdown.md's WO-0056, deliberately out of this row's
scope): one statement per line, under a `## Normative statements`
heading,
    - **<slug>** (<domain>): <one sentence with exactly one MUST /
      MUST NOT / SHOULD / SHOULD NOT>
e.g. (architecture.md's own worked example, not yet written into
ADR-0032 by this row):
    - **adr0032-one-way-mirror** (factory): A work-order issue MUST be
      created only after its breakdown row exists.
A bullet missing its slug, naming an unknown domain, or carrying zero or
more than one RFC-2119 keyword is a problem string, never a silent skip
(CLAUDE.md: "declared, never assumed" — the same discipline
check_wo_citation already applies to a breakdown row with no PRD
citation).
"""
import json
import re
import sys
from pathlib import Path

from cli import read_file, report
from knowledge_plane import repo_root

STANDARDS_PATH = "docs/standards.json"

LEVELS = ("MUST", "SHOULD")
STATUSES = ("advisory", "enforced")
DOMAINS = ("factory", "pipeline", "eval", "docs")

# A hand-curated entry's source prefix (WO-0057, not yet written by
# anything as of this row): the ONE string that marks an entry as not
# ADR-derived, so `update` leaves it untouched and gates.py's detector K
# excludes it from the ADR-derived drift comparison. There is no
# CLAUDE.md heading-anchor convention this matches against mechanically
# — the anchor text past the "#" is Implement's call (architecture.md's
# own Open-question resolution), never validated here.
HAND_CURATED_PREFIX = "CLAUDE.md#"

# The ADR-derived source grammar this module both writes (build_index)
# and reads back (adr_number, for gates.py's detector K): "adr/NNNN#slug".
ADR_SOURCE = re.compile(r"^adr/(?P<number>\d{4})#(?P<slug>.+)$")

# A plain ATX '## Normative statements' heading — this repo's own ADRs
# write every heading in plain ATX form (`## Decision`, `## Consequences`,
# never Setext), so this module's heading scanner does not need H's fuller
# generality (Setext titles, trailing '#', arbitrary heading level) —
# lighter machinery for a narrower, hand-authored input.
NORMATIVE_HEADING = re.compile(r"^##\s+Normative statements\s*$")
ANY_HEADING = re.compile(r"^#{1,6}\s")

# One statement per line: a bullet carrying a bold slug, a parenthesised
# domain, and a statement sentence — the whole grammar in one regex so a
# line either matches completely or is read as malformed, never partially
# accepted.
NORMATIVE_BULLET = re.compile(
    r"^-\s+\*\*(?P<slug>[^*]*)\*\*\s*\((?P<domain>[^)]*)\)\s*:\s*"
    r"(?P<statement>\S.*)$")
SLUG_SHAPE = re.compile(r"^[a-z][a-z0-9-]*$")
# Longer alternatives first: "MUST NOT"/"SHOULD NOT" must not be counted
# twice as a bare "MUST"/"SHOULD" plus a stray "NOT".
RFC2119 = re.compile(r"\b(MUST NOT|SHOULD NOT|MUST|SHOULD)\b")


def _normative_sections(lines):
    """[(first body lineno, body lines)] for every '## Normative
    statements' section in an ADR file's LINES — the section runs from
    the line after the heading to the next heading of any level, or EOF.
    An ADR with no such heading yields nothing; one with several (not
    expected, not forbidden) yields each independently."""
    sections = []
    index = 0
    total = len(lines)
    while index < total:
        if NORMATIVE_HEADING.match(lines[index]):
            start = index + 1
            end = start
            while end < total and not ANY_HEADING.match(lines[end]):
                end += 1
            sections.append((start, lines[start:end]))
            index = end
        else:
            index += 1
    return sections


def parse_bullet(line):
    """(fields, problems) for one normative-statement bullet LINE: fields
    is {"slug", "domain", "statement", "level"} when the line is fully
    well-formed, else None — problems is the unlocated suffix list a
    caller locates and labels (cost_ledger.line_problems' convention). A
    bullet is malformed, never silently skipped, when: it does not match
    the '- **<slug>** (<domain>): <statement>' shape at all; its slug is
    empty or not lowercase-kebab; its domain is not one of DOMAINS; or
    its statement carries zero or more than one RFC-2119 keyword."""
    bullet = NORMATIVE_BULLET.match(line)
    if not bullet:
        return None, [
            f"unreadable normative-statement bullet {line.strip()!r}"
            " (expected '- **<slug>** (<domain>): <statement>')"]
    slug = bullet.group("slug").strip()
    domain = bullet.group("domain").strip()
    statement = bullet.group("statement").strip()
    problems = []
    if not slug or not SLUG_SHAPE.match(slug):
        problems.append(
            f"missing or invalid slug {slug!r} (expected lowercase-kebab,"
            " e.g. 'adr0032-one-way-mirror')")
    if domain not in DOMAINS:
        problems.append(
            f"domain {domain!r} is not one of {', '.join(DOMAINS)}")
    keywords = RFC2119.findall(statement)
    if not keywords:
        problems.append(
            "statement carries no RFC-2119 keyword (MUST/MUST NOT/SHOULD/"
            "SHOULD NOT)")
    elif len(keywords) > 1:
        problems.append(
            f"statement carries {len(keywords)} RFC-2119 keywords,"
            f" exactly one required: {keywords}")
    if problems:
        return None, problems
    level = "MUST" if keywords[0].startswith("MUST") else "SHOULD"
    return {"slug": slug, "domain": domain, "statement": statement,
           "level": level}, []


def adr_number(source):
    """The ADR number an ADR-derived `source` string names ("adr/NNNN#..."
    -> "NNNN"), or None for a hand-curated source or anything else this
    module did not write. gates.py's detector K uses this to find the
    source ADR of an `enforced` statement without re-deriving the source
    grammar a second time."""
    if not isinstance(source, str):
        return None
    match = ADR_SOURCE.match(source)
    return match.group("number") if match else None


def build_index(root):
    """(entries, problems): the ADR-derived subset of docs/standards.json,
    freshly rebuilt from docs/adr/*.md's `## Normative statements`
    sections — deterministic (sorted by slug) and pure over the tree at
    `root`. Never reads the previously committed docs/standards.json (see
    this module's docstring: status is always "advisory" here by
    construction). `problems` is LOCATED but UNLABELLED
    ("docs/adr/NNNN-x.md:12 <suffix>") — `update` and gates.py's detector
    K each prefix their own label, the same split cost_ledger.load makes
    for its caller-supplied label.

    A malformed bullet is a problem, never a silent skip. Two ADR-derived
    bullets sharing a slug is also a problem (a slug must resolve to one
    statement) — reported against the SECOND occurrence, the same
    "duplicate declared where it collides" convention detector C uses for
    a duplicate PRD id."""
    root = Path(root)
    adr_dir = root / "docs" / "adr"
    if not adr_dir.is_dir():
        return [], []
    entries = []
    problems = []
    seen = {}  # slug -> "rel:lineno" of its first occurrence
    for path in sorted(adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md")):
        rel = path.relative_to(root)
        number = path.name[:4]
        lines = path.read_text(encoding="utf-8").splitlines()
        for start, body in _normative_sections(lines):
            for offset, line in enumerate(body):
                if not line.strip():
                    continue
                lineno = start + offset + 1
                fields, bullet_problems = parse_bullet(line)
                if bullet_problems:
                    problems.extend(f"{rel}:{lineno} {suffix}"
                                    for suffix in bullet_problems)
                    continue
                slug = fields["slug"]
                if slug in seen:
                    problems.append(
                        f"{rel}:{lineno} slug {slug!r} duplicates"
                        f" {seen[slug]}")
                    continue
                seen[slug] = f"{rel}:{lineno}"
                entries.append({
                    "slug": slug,
                    "statement": fields["statement"],
                    "level": fields["level"],
                    "source": f"adr/{number}#{slug}",
                    "status": "advisory",
                    "domain": fields["domain"],
                })
    entries.sort(key=lambda entry: entry["slug"])
    return entries, problems


def foreign_entries(root):
    """(hand-curated entries, problems): every existing docs/standards.json
    entry whose `source` starts with HAND_CURATED_PREFIX, read verbatim —
    `update`'s "leave untouched" half. ([], []) when the file does not
    exist yet (nothing to preserve on a first regeneration) or holds no
    such entry. An existing file that is not valid JSON, or not a JSON
    array, is a problem: `update` must refuse to overwrite a committed
    file it cannot make sense of half of, the same fail-closed direction
    cost_ledger.load takes on an unreadable ledger."""
    existing, problem = read_file(Path(root) / STANDARDS_PATH,
                                  STANDARDS_PATH, list)
    if problem:
        return [], [problem]
    if existing is None:
        return [], []
    return [entry for entry in existing
            if isinstance(entry, dict)
            and isinstance(entry.get("source"), str)
            and entry["source"].startswith(HAND_CURATED_PREFIX)], []


def update(root):
    """Regenerate docs/standards.json: the ADR-derived subset rebuilt
    fresh (build_index), every hand-curated CLAUDE.md#-sourced entry
    preserved verbatim (foreign_entries), sorted by slug for a stable
    diff (the same stability concern factory_init.update_manifest already
    has for factory/manifest.json). Refuses to write on any problem —
    a malformed ADR bullet or an unreadable/malformed existing file —
    the same "do not write past what did not parse" rule
    factory_init.update_manifest follows for a missing root file."""
    root = Path(root)
    entries, problems = build_index(root)
    foreign, foreign_problems = foreign_entries(root)
    problems = problems + foreign_problems
    if problems:
        return [f"standards-index: {p}" for p in problems]
    merged = sorted(entries + foreign, key=lambda entry: entry["slug"])
    path = root / STANDARDS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
    return []


def main(argv):
    if argv == ["update"]:
        problems = update(repo_root())
    else:
        print(__doc__.strip())
        return 2
    return report("standards-index", problems)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
