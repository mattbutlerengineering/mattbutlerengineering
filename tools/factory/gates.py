#!/usr/bin/env python3
"""Factory gate detectors (PRD-0001; ADR-0032, ADR-0033, ADR-0034).

Offline, gating checks over the knowledge plane, following the same
conventions as lint.py: every checker takes the repo root and returns
label-prefixed problem strings; the CLI prints them and exits nonzero.
Lettered detectors (audit-evals.py style, letters shared with the
ai-tooling suite where the rule is the same idea):

  A WO-CITATION    — every breakdown work-order row cites a PRD id
  B PR-TRACEABILITY — PR body carries a WO id and a closing keyword
                     (event-payload; SKIP locally)
  C LINK-INTEGRITY — every PRD-####/ADR-####/WO-#### token resolves;
                     duplicate PRD ids fail
  D BLUEPRINT-DRIFT — the approved blueprint (docs/adr) is self-consistent:
                     every ADR declares a known status and is indexed with
                     that status in docs/adr/README.md, and no artifact
                     outside docs/adr builds on a superseded decision
  E SCAFFOLD-SYNC  — factory/manifest.json checksums match the template
                     payload (no hand-edited mirrors), and in a stamped
                     repo the executable payload in use — tools/factory/
                     and .github/workflows/ — matches what it was stamped
                     from (no hand-edited stamped files)
  F CONFIG-SHAPE   — factory config parses and every field is a valid
                     token (budgets, routing, caps)
  J LABEL-WIRING   — every label the tools and the Makefile's lifecycle
                     targets name exists in the label taxonomy, and the
                     taxonomy file itself is readable; the taxonomy is
                     the repo's to curate (so nothing checksums it), and
                     a pruned label or an unparseable file would
                     otherwise surface only when CI flips a label, at
                     dispatch or merge time
  G COST-LEDGER    — docs/factory/costs.jsonl lines carry the ADR-0034
                     fields and every merged (checked) work-order row has
                     one; an absent ledger is silent (no runs recorded yet)
  H EVIDENCE-HONESTY — every verification.md section that asserts a LABELLED
                     verdict (Result/Verdict/Outcome/Status) shows literal
                     fenced output or discloses NOT RUN, in its OWN section
                     scope (an appendix fence vouches for nothing; a scoped
                     hedge is not a disclaimer; there is no roll-up excuse);
                     and an artifact with neither output nor a written
                     NOT-RUN disclaimer anywhere fails outright
  I STALENESS      — no knowledge-plane doc links to a path that no longer
                     exists on disk
  K STANDARDS-DRIFT — docs/standards.json's ADR-derived entries match a
                     fresh standards_index.build_index(root) regen, and
                     every `enforced`-status entry's source ADR is
                     `accepted` (ADR-0073)
  M CAPTURE-COMPLETENESS — every docs/fixes/<slug>/defect.md that exists
                     carries skills/capture/TEMPLATE.md's required
                     sections, each with real (non-placeholder) content
                     (ADR-0073)
  N NEEDS-CLARIFICATION — no prd.md or architecture.md carries an
                     unresolved inline [NEEDS CLARIFICATION: ...] marker
                     (ADR-0071)
  O PRD-COVERAGE   — the reverse of A: every section of a prd.md with a
                     declared id is cited by a work-order row of its run's
                     breakdown, or carries a reasoned coverage waiver
                     (ADR-0072)

The letter namespace does not end at I. Detector L (LABEL-SYNC) is
network-side and lives in label_sync.py, driven by scheduled sweeps —
network calls stay out of this offline gate. K, M, N and O are claimed
above; a new detector takes the next free letter (P).
DETECTORS (beside CHECKERS below) is the full roster.

`--selftest` runs the checkers against fixture trees and exits nonzero
on a failing assertion. Both run in CI (validator.yml, via `make check`)
on every push/PR.

The knowledge plane's shared grammar (typed-ID tokens, run_dirs,
repo_root) lives in knowledge_plane.py, and the cost ledger's shape in
cost_ledger.py (ADR-0037) — this module keeps only the detectors.
"""
import hashlib
import importlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

import cost_ledger
import factory_config
import standards_index
from cli import read_event, read_file, report
from cost_ledger import COST_LEDGER
from knowledge_plane import (ADR_TOKEN, CLOSES_TOKEN, PRD_TOKEN, WO_TOKEN,
                             fence_closes, fence_open, parse_run, repo_root,
                             row_done, row_pre_ledger, run_dirs, unfenced)
from protocol import read_frontmatter
# Not every factory PR implements a work order: a governance or chore PR
# (the merge-auth removal in #139, a docs fix) closes an issue but maps to no
# `WO-####`. Such a PR declares that EXPLICITLY — the same "declared, never
# assumed" rule the architecture tree-claims and the review-token provenance
# follow — and the declaration owes a reason, so a bare marker waives nothing.
# A work-order PR that simply omits its WO still fails: only an explicit,
# reasoned "no work order" claim exempts, and claiming it falsely is a
# deliberate lie the same as any other gamed gate. The Closes-#N audit link is
# still required in both cases. (ADR-0033, amended: merge stays gated, but the
# gate no longer assumes every PR is a work order.)
NO_WO_DECLARATION = re.compile(r"\bno[\s-]+work[\s-]+order\b[ \t]*:[ \t]*\S",
                               re.IGNORECASE)

# ADR status vocabulary (docs/adr/README.md), as a status head plus an
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
# An index row: | [0032](0032-slug.md) | Decision | status |
ADR_INDEX_ROW = re.compile(
    r"^\|\s*\[(?P<num>\d{4})\]\((?P<file>[^)]+)\)\s*\|[^|]*\|"
    r"\s*(?P<status>[^|]*?)\s*\|")

# Markdown links to repo paths; URLs, autolinks and bare anchors are not.
MD_LINK = re.compile(r"\[[^\]]*\]\(\s*<?([^)>\s]+)>?")
URL_TARGET = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:")

# H reads verification.md the way the verify skill writes it: markdown
# headings delimit criteria, a LABELLED line asserts the verdict, fenced
# blocks carry the literal output, and prose may disclose a check as NOT RUN.
# Every one of those signals is read IN THE SECTION THAT CARRIES IT — the
# rule H enforces is per-criterion, so its evidence test must be too.
HEADING_LINE = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
# CommonMark's other heading syntax: a title underlined with === or ---.
# GitHub renders it identically to ATX, so a splitter that reads only ATX is
# blind to sections a human reviewer plainly sees (the #147 bypass). The `---`
# underline is ambiguous — it also writes a thematic break and closes the
# frontmatter fence — so a title must be a non-blank line that is not itself a
# list item, block quote, or underline.
SETEXT_UNDERLINE = re.compile(r"^\s{0,3}(?:=+|-+)\s*$")
NOT_A_SETEXT_TITLE = re.compile(r"^\s{0,3}(?:[-*+>]|\d+[.)])\s")
# Only a LABELLED verdict line asserts a verdict. The label is not just
# "Result": a criterion is just as asserted under "Verdict:", "Outcome:",
# "Conclusion:", "Assessment:", "Finding:" — so the rule engages on the whole
# verdict-noun vocabulary (case-insensitive, with an optional list bullet and
# bold markers, and a non-empty value). A four-label whitelist was itself the
# gate's escape hatch: a lying section only had to relabel its verdict line to
# become invisible, which is the same "rename it and the gate goes quiet" move
# the roll-up excuse allowed. The vocabulary below is the closed set of words
# that ASSERT A JUDGEMENT. Words that introduce an INPUT or an aside —
# "Check:", "Command:", "Note:", "Caveat:", "Evidence:" — are deliberately NOT
# verdicts: they carry no claim, and reading them as claims false-positives on
# every honest artifact that documents what it ran.
#
# Nothing else asserts anything. Unlabelled prose and heading text are read
# as prose: an author may open a note with "Done.", title a section "all
# checks pass", and — decisively — write TEMPLATE.md's `## Summary` as the
# narrative roll-up it is meant to be, all without owing output. Reading
# prose and headings as verdicts is what forced the previous roll-up EXCUSE
# ("a section named Summary/Results/… need not evidence itself, provided
# some other section does"), and that excuse was the gate's own escape
# hatch: rename the lying section, or park one throwaway evidenced leaf
# beside it, and the gate went quiet. With only labelled lines asserting, no
# excuse is needed and none exists — every labelled verdict is backed IN ITS
# OWN SECTION, wherever it is written.
# The leading-marker class is deliberately wide. A verdict is just as asserted
# under a blockquote (`> Result: PASS`) or an ordered-list item (`1. Result:
# PASS`) as under a `-` bullet, and GitHub renders all three as visible verdict
# text — so a marker-only whitelist was itself an escape hatch (an independent
# review smuggled a fake PASS past the `-*+`-only form under `>` and `1.`).
# Any run of list/quote markers may lead the line; the verdict noun is what
# makes it a verdict, not the marker. Two more wrappers GitHub renders as a
# visible verdict join the leading class (#151): a table cell's leading pipe
# (`| Result: PASS |`, a row a human reads as PASS) and an inline `<summary>`
# open tag (`<summary>Result: PASS</summary>`, an always-visible clickable
# verdict). Both close with a trailing delimiter — ` |` / `</summary>` — that
# the value capture drops OUTSIDE the group, so `_is_disclosure` still reads
# the verdict's true head (a table-cell `NOT VERIFIED` still discloses).
RESULT_LINE = re.compile(
    r"^\s*(?:(?:[-*+>]|\d+[.)]|\||<summary[^>]*>)\s*)*"
    r"\**\s*(?:result|verdict|outcome|status"
    r"|conclusion|assessment|finding|determination|evaluation|judge?ment"
    r"|disposition|decision|ruling|appraisal)\**"
    r"\s*:\s*(\S.*?)\s*(?:\|\s*|</summary>\s*)?$",
    re.IGNORECASE)
# YAML frontmatter is METADATA, not the author's assertion. `status: draft` is
# a stage field, and reading it as a labelled verdict both false-positived on
# an honest artifact ("(untitled)" asserts draft) and — worse — parked a
# `results` entry in the artifact, which switched the artifact-wide backstop
# off entirely. The frontmatter block is skipped, not scanned.
FRONTMATTER_FENCE = re.compile(r"^---\s*$")
# The disclaimer must be explicit, and it must be WRITTEN: read from body
# text, never from a heading. TEMPLATE.md ships a `## Not verified` slot in
# EVERY artifact, so a heading that counted as a disclosure would let the
# template alone excuse a wholly fabricated, zero-output artifact. What
# discloses a gap is what the author writes under the slot, not the slot.
# A scoped hedge ("not tested on Windows", "not verified in Safari") admits
# the check DID run, just not everywhere — the negative lookahead drops it so
# it cannot disarm the rule the way an unqualified "NOT RUN" legitimately does.
NOT_RUN_TOKEN = re.compile(
    r"\bnot[\s-]+(?:run|ran|verified|executed|checked|tested|attempted)\b"
    r"(?!\s+(?:on|in|for|under|with|against|across|when|beyond|outside)\b)",
    re.IGNORECASE)
# A verdict that claims nothing IS the disclosure and owes no output. Every
# other verdict is a CLAIM and owes literal evidence in its own section — and
# a disclosure sitting NEXT TO a claim buys it nothing. That distinction is
# what stops "(the retry path was not run)" from being a two-word licence to
# fabricate any verdict: a section's prose "not run" disarms nothing it does
# not itself claim. (Body prose still counts for the artifact-wide backstop:
# an artifact that ran nothing and says so is honest.)
#
# The test is ANCHORED at the head of the verdict, never a substring search.
# Searching the whole value let a claim disarm ITSELF by appending a hedge —
# "PASS - every criterion met, full suite green (soak test not run)" asserted
# PASS, showed nothing, and passed in silence. What a verdict asserts is its
# HEAD: lead with a disclosure and you have disclosed; lead with PASS and you
# have claimed, whatever you append. A trailing reason is welcome — an honest
# "NOT RUN — the CI runner was offline" is still a disclosure — and a scoped
# hedge ("not tested on Windows") is still not one, because it concedes the
# check DID run: the preposition lookahead drops it here exactly as it does in
# the body scan.
DISCLOSURE_VERDICT = re.compile(
    r"^(?:n/?a|skip(?:ped)?|defer(?:red)?|untested|unverified|pending|todo|tbd"
    r"|not[\s-]+(?:run|ran|verified|executed|checked|tested|attempted)"
    r"(?!\s+(?:on|in|for|under|with|against|across|when|beyond|outside)\b))"
    r"(?![\w/-])",
    re.IGNORECASE)
# Emphasis and brackets are formatting, not claim: `**NOT RUN**` and `(N/A)`
# are the disclosures they look like, so the head is read past them.
VERDICT_LEAD = re.compile(r"^[\s*_`\"'“‘([]+")
# Unfilled TEMPLATE filler is not output — matched by its filler TEXT, not by
# the shape `<...>`. That shape is also real evidence (a DOM dump's `<html>`,
# a Python repr like `<class 'app.models.User'>`), and discarding it
# false-positived on authors who had pasted exactly what H asks for.
PLACEHOLDER_TEXT = (r"paste|actual\s+output|fill[\s-]*in|to[\s-]?do|tbd|xxx"
                    r"|insert|example\s+output|output\s+here|your\s")
PLACEHOLDER_LINE = re.compile(
    r"^\s*<\s*(?:" + PLACEHOLDER_TEXT + r")[^>]*>\s*$", re.IGNORECASE)
# architecture.md is a blueprint too (#142). D stayed green while a PR added a
# root Makefile and deleted checks.yml, leaving architecture.md asserting the
# opposite of the tree it describes. A doc that describes the tree is
# checkable against the tree, and a doc that has stopped describing it is
# stale — the finding is the drift, not the file.
#
# The hard part is that architecture.md describes TWO trees: this repo, and
# the repo the payload stamps. It also names files that are PLANNED and do not
# exist yet (a roadmap line naming `validator.yml` before WO-0004 lands). So
# "every path it mentions must exist" is not the rule — it would false-positive
# on an honest doc, which is the failure that killed two attempts at detector
# H. Only two things are read as claims about the CURRENT tree:
#
#   1. PROSE, on a CLOSED keyword vocabulary, anchored so that the code span
#      ends a clause. "there is no `Makefile`," asserts absence; "no `gates.py`
#      change is needed" modifies a NOUN and asserts nothing. "`X` exists here"
#      asserts presence, and "here" is the doc's OWN word for "in this repo"
#      (it writes "no `Makefile` ... here", "`.github/CODEOWNERS` exists here")
#      — which is exactly what separates a claim about this tree from a claim
#      about a stamped one. Missing a hedged claim is the safe error; firing on
#      an honest sentence is not.
#   2. A DECLARED claim block, which is the only way to pin a presence claim
#      that prose states behaviourally ("`checks.yml` runs lint..." asserts the
#      file exists, but no keyword says so). Declaring it follows the same rule
#      the review token's provenance does: what is not declared is not assumed.
ARCH_ABSENT_PROSE = re.compile(
    r"\bno\s+`(?P<path>[^`\n]+)`(?:\s+here)?\s*(?=[,.;:)]|$)")
ARCH_EXISTS_PROSE = re.compile(r"`(?P<path>[^`\n]+)`\s+exists\s+here\b")
ARCH_CLAIMS_FENCE = re.compile(r"^\s*```\s*tree-claims\s*$")
ARCH_CLAIM = re.compile(
    r"^\s*(?P<verb>exists|absent)\s*:\s*(?P<path>\S+)\s*$", re.IGNORECASE)
# A claim must name a plain repo path. A glob or a `..` is not resolvable
# against the tree, and quietly resolving it anyway is how a detector starts
# reporting things it did not check.
ARCH_PLAIN_PATH = re.compile(r"^[\w.@/-]+$")


def _scannable_files(root):
    """Every real markdown doc detectors C, D and I check cross-links
    against: docs/, root-level *.md, .github/, skills/, and factory/ minus
    its two deliberately-foreign subtrees — factory/templates/ (a seed
    tree checked against its OWN numbering by
    tests/test_factory_init.py::TestSeededADRs, not this repo's) and
    factory/evals/fixtures/ (regression fixtures whose WO-/PRD- tokens are
    intentionally fake). tests/ carries no *.md files and is not walked."""
    seen = set()
    files = []

    def add(paths):
        for path in paths:
            if path.is_file() and path not in seen:
                seen.add(path)
                files.append(path)

    docs = root / "docs"
    if docs.is_dir():
        add(sorted(docs.rglob("*.md")))
    add(sorted(root.glob("*.md")))
    for name in ("github", "skills"):
        d = root / f".{name}" if name == "github" else root / name
        if d.is_dir():
            add(sorted(d.rglob("*.md")))
    factory = root / "factory"
    if factory.is_dir():
        foreign = (factory / "templates", factory / "evals" / "fixtures")
        add(sorted(p for p in factory.rglob("*.md")
                   if not any(f in p.parents for f in foreign)))
    return sorted(files)


def check_wo_citation(root, parsed=None):
    """A: a work-order row that cites no PRD section is untraceable scope.

    Pure over `parsed` (knowledge_plane.parse_run); `root` stays only to
    relativize the paths problem strings print. `parsed` defaults to a
    fresh parse of `root` so every existing caller that passes root
    alone keeps working — run_all builds it once and threads it through
    instead (issue #442)."""
    if parsed is None:
        parsed = parse_run(root)
    problems = []
    for entry in parsed["runs"]:
        if entry["breakdown"] is None:
            continue
        rel = (entry["path"] / "breakdown.md").relative_to(root)
        for lineno, line in enumerate(entry["breakdown"], 1):
            wo = WO_TOKEN.search(line)
            if wo and not PRD_TOKEN.search(line):
                problems.append(
                    f"A: {rel}:{lineno} work-order row {wo.group(0)}"
                    " cites no PRD id")
    return problems


def pr_event(env):
    """(the pull_request payload, error): the PR this CI run is about, read
    from the event file (cli.read_event, ADR-0042). (None, None) outside a
    PR run — every caller SKIPs silently there. Callers label the error
    string themselves, so this stays detector-agnostic (validator.py is the
    second caller)."""
    event, error = read_event(env)
    if event is None:
        return None, error
    pr = event.get("pull_request")
    return (pr if isinstance(pr, dict) else None), None


def check_pr_traceability(root, env=None):
    """B: a PR whose body cites no work order and closes no issue breaks
    the audit trail from code back to scope. Reads the CI event payload;
    SKIPs silently outside a PR run. A PR that implements no work order may
    say so explicitly (`No work order: <reason>`) to waive the WO-id
    requirement; the Closes-#N link is required regardless."""
    if env is None:
        env = os.environ
    pr, error = pr_event(env)
    if error:
        return [f"B: {error}"]
    if pr is None:
        return []
    body = pr.get("body") or ""
    problems = []
    if not WO_TOKEN.search(body) and not NO_WO_DECLARATION.search(body):
        problems.append("B: PR body cites no work-order id")
    if not CLOSES_TOKEN.search(body):
        problems.append("B: PR body has no Closes #N link")
    return problems


def collect_prd_ids(root, parsed):
    """Map PRD id -> list of prd.md paths declaring it in frontmatter.
    Pure over `parsed`; `root` only relativizes the paths returned."""
    ids = {}
    for entry in parsed["runs"]:
        if entry["prd_id"]:
            path = (entry["path"] / "prd.md").relative_to(root)
            ids.setdefault(entry["prd_id"], []).append(path)
    return ids


def collect_wo_rows(parsed):
    """Set of WO tokens that appear in any breakdown.md row. Pure over
    `parsed`."""
    rows = set()
    for entry in parsed["runs"]:
        if entry["breakdown"] is None:
            continue
        for line in entry["breakdown"]:
            rows.update(WO_TOKEN.findall(line))
    return rows


def check_link_integrity(root, parsed=None):
    """C: typed cross-link tokens must resolve; duplicate PRD ids fail.

    Pure over `parsed` (`root` only relativizes problem-string paths);
    `parsed` defaults to a fresh parse — including gates._scannable_files'
    own selection — of `root`, same lazy-default convention as A, D, G, H
    and I (issue #442)."""
    if parsed is None:
        parsed = parse_run(root, scannable=_scannable_files(root))
    problems = []
    prd_ids = collect_prd_ids(root, parsed)
    for prd_id, paths in sorted(prd_ids.items()):
        if len(paths) > 1:
            listed = ", ".join(str(p) for p in paths)
            problems.append(f"C: duplicate PRD id {prd_id} in {listed}")
    adr_numbers = {path.name[:4] for path, _ in parsed["adr_files"]}
    wo_rows = collect_wo_rows(parsed)
    for path, lines in parsed["scannable"]:
        rel = path.relative_to(root)
        in_breakdown = path.name == "breakdown.md"
        for lineno, line in enumerate(lines, 1):
            for token in PRD_TOKEN.findall(line):
                if token not in prd_ids:
                    problems.append(
                        f"C: {rel}:{lineno} dangling {token}"
                        " (no prd.md declares this id)")
            for number in ADR_TOKEN.findall(line):
                if number not in adr_numbers:
                    problems.append(
                        f"C: {rel}:{lineno} dangling ADR-{number}"
                        " (no docs/adr file)")
            if not in_breakdown:
                for token in WO_TOKEN.findall(line):
                    if token not in wo_rows:
                        problems.append(
                            f"C: {rel}:{lineno} dangling {token}"
                            " (no breakdown row)")
    return problems


def _adr_status_from_lines(lines):
    """(lineno, status text) of an ADR's Status line, given its LINES
    (a knowledge_plane.parse_run adr_files entry); (0, None) if absent.
    Pure sibling of _adr_status, which reads the file itself —
    tests/test_factory_init.py::TestSeededADRs still calls that one
    directly against the seed tree on disk, so its own signature stays
    (path) -> (lineno, text)."""
    for lineno, line in enumerate(lines, 1):
        match = ADR_STATUS_LINE.match(line)
        if match:
            return lineno, match.group(1)
    return 0, None


def _adr_status(path):
    """(lineno, status text) of an ADR's Status line; (0, None) if absent."""
    return _adr_status_from_lines(
        path.read_text(encoding="utf-8").splitlines())


def _status_head(text):
    """The decision state alone, annotation stripped; None if unknown."""
    match = ADR_STATUS.match(text or "")
    return match.group(1) if match else None


def _claim_path(root, raw):
    """(resolved path, problem-suffix). A claim must name a plain repo path;
    anything else is refused rather than resolved."""
    cleaned = raw.strip().rstrip("/")
    if not cleaned or ".." in cleaned.split("/") \
            or not ARCH_PLAIN_PATH.match(cleaned):
        return None, (f"tree claim '{raw}' is not a plain repo path"
                      " (no globs, no '..')")
    return root / cleaned, None


def _declared_claims(root, rel, lineno, line):
    """Problems for one line inside a ```tree-claims block."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return []
    claim = ARCH_CLAIM.match(line)
    if not claim:
        return [f"D: {rel}:{lineno} unreadable tree claim '{stripped}'"
                " (expected 'exists: <path>' or 'absent: <path>')"]
    raw = claim.group("path")
    path, refused = _claim_path(root, raw)
    if refused:
        return [f"D: {rel}:{lineno} {refused}"]
    name = raw.strip().rstrip("/")
    exists = path.exists()
    if claim.group("verb").lower() == "exists" and not exists:
        return [f"D: {rel}:{lineno} claims {name} exists, but it does not"
                " (architecture.md is stale)"]
    if claim.group("verb").lower() == "absent" and exists:
        return [f"D: {rel}:{lineno} claims {name} is absent, but it exists"
                " (architecture.md is stale)"]
    return []


def _prose_claims(root, rel, lineno, line):
    """Problems for the existence claims a prose line makes about this tree.
    An unresolvable path (a glob, a `make check` command span) is not a claim
    and is skipped — in prose, silence is the safe reading."""
    problems = []
    for match in ARCH_ABSENT_PROSE.finditer(line):
        raw = match.group("path")
        path, refused = _claim_path(root, raw)
        if path is not None and path.exists():
            problems.append(
                f"D: {rel}:{lineno} says there is no {raw.rstrip('/')}, but"
                " it exists (architecture.md is stale)")
    for match in ARCH_EXISTS_PROSE.finditer(line):
        raw = match.group("path")
        path, refused = _claim_path(root, raw)
        if path is not None and not path.exists():
            problems.append(
                f"D: {rel}:{lineno} says {raw.rstrip('/')} exists, but it"
                " does not (architecture.md is stale)")
    return problems


def _architecture_drift(root, parsed):
    """D: every file architecture.md names as present or absent in THIS repo
    must agree with the tree. Fenced examples are inert — a doc quoting a
    claim is not making it — except for the ```tree-claims block, which is
    where a claim prose can only state behaviourally gets declared.

    Content comes from `parsed`; the existence checks each claim makes
    (_declared_claims/_prose_claims, via _claim_path) stay live against
    `root` — parse_run captures content, not existence, and that half of
    D can never become pure (issue #442)."""
    problems = []
    for entry in parsed["runs"]:
        if entry["architecture"] is None:
            continue
        rel = (entry["path"] / "architecture.md").relative_to(root)
        fence = None  # None | (marker char, marker length, is tree-claims)
        for lineno, line in enumerate(entry["architecture"], 1):
            if fence is not None:
                if fence_closes(line, fence[0], fence[1]):
                    fence = None
                elif fence[2]:
                    problems.extend(
                        _declared_claims(root, rel, lineno, line))
                continue
            opened = fence_open(line)
            if opened:
                fence = (*opened, bool(ARCH_CLAIMS_FENCE.match(line)))
                continue
            problems.extend(_prose_claims(root, rel, lineno, line))
    return problems


def check_blueprint_drift(root, parsed=None):
    """D: docs/adr is the approved blueprint (ADR-0033's second gate). It
    must describe itself consistently — every ADR carries a known status
    and is indexed with that status — and no artifact outside docs/adr may
    build on a decision the blueprint has retired (ADR-0032: disagreement
    resolves in the knowledge plane's favour).

    A run's architecture.md is a blueprint too, and it drifts the same way:
    it goes on describing a tree that has moved out from under it (#142). So
    a file it names as present or absent in this repo must agree with the
    tree, on the same principle — the doc does not get to disagree with what
    is there.

    Content (ADR status lines, the index, the retired-citation scan) comes
    from `parsed`, defaulting to a fresh parse of `root` (with
    gates._scannable_files' own selection) exactly like C, G, H and I.
    Two existence checks stay live against `root` and can never become
    pure: architecture.md's own tree-claims (_architecture_drift) and
    whether an index row's named file actually exists — parse_run only
    captures the ADR files it FOUND via its own glob, so a row naming one
    it did not find is either genuinely missing or (rarer) names a file
    outside the NNNN-*.md pattern parse_run does not walk; only a live
    `.is_file()` answers both cases the same way the pre-migration code
    did, and the "problem strings byte-identical" constraint rules out
    guessing from parsed["adr_files"] membership instead."""
    if parsed is None:
        parsed = parse_run(root, scannable=_scannable_files(root))
    problems = _architecture_drift(root, parsed)
    adr_dir = root / "docs" / "adr"
    # Equivalent to the pre-migration `if not adr_dir.is_dir(): return
    # problems` (see gates.py history): with no ADR files and no README,
    # `statuses`/`retired` end up empty either way and the loops below are
    # no-ops, so the two conditions produce identical problems — this one
    # just skips paying for parsed["scannable"]'s no-op scan.
    if not parsed["adr_files"] and parsed["adr_readme"] is None:
        return problems
    statuses = {}  # ADR number -> status text (None when unusable)
    retired = {}   # ADR number -> the ADR number that superseded it
    for path, lines in parsed["adr_files"]:
        rel = path.relative_to(root)
        number = path.name[:4]
        lineno, text = _adr_status_from_lines(lines)
        statuses[number] = None
        if text is None:
            problems.append(f"D: {rel} declares no Status line")
            continue
        match = ADR_STATUS.match(text)
        if not match:
            problems.append(f"D: {rel}:{lineno} unknown ADR status {text!r}")
            continue
        statuses[number] = text
        if match.group("retired"):
            retired[number] = match.group("by")

    readme_lines = parsed["adr_readme"]
    if statuses and readme_lines is None:
        problems.append("D: docs/adr/README.md is missing"
                        " (ADR files present, no blueprint index)")
    elif readme_lines is not None:
        rows = {}
        for lineno, line in enumerate(readme_lines, 1):
            match = ADR_INDEX_ROW.match(line)
            if not match:
                continue
            number, filename = match.group("num"), match.group("file")
            rows[number] = (lineno, match.group("status"))
            if not (adr_dir / filename).is_file():
                problems.append(
                    f"D: docs/adr/README.md:{lineno} index row ADR-{number}"
                    f" links to missing file {filename}")
        for number, text in sorted(statuses.items()):
            if number not in rows:
                problems.append(
                    f"D: docs/adr/README.md has no index row for"
                    f" ADR-{number}")
                continue
            lineno, indexed = rows[number]
            if text is None:  # already flagged; nothing to compare against
                continue
            if _status_head(indexed) != _status_head(text):
                problems.append(
                    f"D: docs/adr/README.md:{lineno} ADR-{number} index"
                    f" status {indexed!r} does not match the file's {text!r}")

    for path, lines in parsed["scannable"]:
        if adr_dir in path.parents:
            continue
        rel = path.relative_to(root)
        for lineno, line in enumerate(lines, 1):
            for number in ADR_TOKEN.findall(line):
                if number in retired:
                    problems.append(
                        f"D: {rel}:{lineno} cites ADR-{number}, superseded"
                        f" by ADR-{retired[number]} (blueprint drift)")
    return problems


def merged_wo_rows(root, parsed):
    """(breakdown path, lineno, WO token) for every checked breakdown row —
    the artifact-side record that a work order merged (ADR-0004). Rows
    carrying the trailing (pre-ledger) annotation — knowledge_plane's
    row_pre_ledger grammar — are excluded: they merged before the ledger
    existed and G owes them no ledger line (ADR-0043). Pure over `parsed`;
    `root` only relativizes the paths returned."""
    rows = []
    for entry in parsed["runs"]:
        if entry["breakdown"] is None:
            continue
        rel = (entry["path"] / "breakdown.md").relative_to(root)
        for lineno, line in enumerate(entry["breakdown"], 1):
            wo = WO_TOKEN.search(line)
            if (row_done(line) and wo
                    and not row_pre_ledger(line)):
                rows.append((rel, lineno, wo.group(0)))
    return rows


def check_cost_ledger(root, parsed=None):
    """G: every run appends {wo, run_id, model, tokens, cost, outcome} to
    the append-only docs/factory/costs.jsonl, and a merged work order with
    no ledger line is a gating finding (ADR-0034). An absent ledger is
    silent, not a finding: the ledger is created by the first run that
    records into it, so a freshly stamped repo has no runs to account for
    — the rule bites once the ledger exists.

    The file read and line grammar are cost_ledger.load — the same
    labelled read the weekly report is built on (ADR-0037, ADR-0049), so
    the two cannot diverge, down to the cannot-read string. cost_ledger.py
    is G's own dedicated seam (like factory_config.py is F's) and stays
    untouched by issue #442: only the cross-checks between ledger and
    breakdown below (a recorded wo must have a row; a merged row must be
    recorded) moved onto `parsed`, defaulting to a fresh parse of `root`
    like every other migrated detector.

    A gate-latency row (ADR-0041) never satisfies the merged-order
    check: it records queue time at $0 with no tokens, and the monthly
    breaker's sum excludes it — counting it as spend coverage kept G
    green on a ledger that accounted for nothing (issue #222)."""
    if parsed is None:
        parsed = parse_run(root)
    rows, problems = cost_ledger.load(root, "G")
    if rows is None:
        # Absent (silent, no runs yet) or unreadable (the labelled
        # cannot-read problem) — either way the line walk and the
        # merged-row cross-check have no ledger to bite on.
        return problems
    wo_rows = collect_wo_rows(parsed)
    recorded = set()
    for lineno, entry, located in rows:
        problems.extend(located)
        wo = cost_ledger.wo_token(entry) if entry is not None else None
        if wo:
            if cost_ledger.gate_wait(entry) is None:
                recorded.add(wo)
            if wo not in wo_rows:
                problems.append(f"G: {COST_LEDGER}:{lineno} wo {wo}"
                                " has no breakdown row")
    for rel, lineno, wo in merged_wo_rows(root, parsed):
        if wo not in recorded:
            problems.append(f"G: {rel}:{lineno} merged work order {wo} has"
                            f" no line in {COST_LEDGER}")
    return problems


def check_staleness(root, parsed=None):
    """I: a doc that links to a path which no longer exists on disk is
    stale — the knowledge plane moved and the doc did not. Deliberately
    filesystem-shaped, not time-shaped: a detector must be deterministic
    and hermetic, which "older than the code it describes" is not.

    The scanned CONTENT comes from `parsed["scannable"]` (defaulting to a
    fresh parse of `root`, with gates._scannable_files' own selection);
    whether a link's TARGET exists stays a live check against `root` —
    that is the rule I enforces, and it can never become pure."""
    if parsed is None:
        parsed = parse_run(root, scannable=_scannable_files(root))
    problems = []
    for path, lines in parsed["scannable"]:
        rel = path.relative_to(root)
        for lineno, line in enumerate(lines, 1):
            for target in MD_LINK.findall(line):
                if URL_TARGET.match(target) or target.startswith("#"):
                    continue
                cleaned = target.split("#", 1)[0]
                if not cleaned:
                    continue
                base = root if cleaned.startswith("/") else path.parent
                if not (base / cleaned.lstrip("/")).exists():
                    problems.append(
                        f"I: {rel}:{lineno} stale link {cleaned}"
                        " (no such path)")
    return problems


def manifest_files(root):
    """{rel: sha256} for every file in the template payload, keyed
    relative to factory/ in posix form — the ONE statement of the
    manifest's walk-hash-key grammar. update_manifest (factory_init.py)
    writes exactly this map and check_scaffold_sync diffs the manifest
    against it, so writer and verifier cannot diverge — the same
    discipline detector G borrows from cost_ledger.parse.

    __pycache__/ is not payload. Importing a payload tool from inside the
    mirrored tree writes bytecode there and .gitignore keeps it untracked,
    so hashing it would pin keys git never carries — the manifest would
    verify only in the checkout that wrote it. Excluding it here rather
    than at the call sites keeps the writer and the verifier agreeing."""
    payload = root / "factory" / "templates"
    if not payload.is_dir():
        return {}
    return {p.relative_to(root / "factory").as_posix():
            hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(payload.rglob("*"))
            if p.is_file() and "__pycache__" not in p.parts}


# The half of the payload a product repo must never edit: the tools and the
# workflows — exactly the files factory_init.MIRRORS machine-copies from the
# factory repo root. Everything else the stamp lands is meant to be edited
# there: docs/adr/ and docs/design/ are seeds, .github/factory.json carries
# budgets to tune, .github/CODEOWNERS ships a placeholder owner that SHOULD
# be substituted, and the Makefile's contract is its target set (checked by
# name, not by byte). Comparing those would fight the documented setup.
PRISTINE_PREFIXES = ("templates/tools/factory/",
                     "templates/.github/workflows/")


def install_destination(rel):
    """Where a manifest key installs in a stamped repo, or None if it is not
    a plain path under templates/.

    Mirrors factory_init.install_path's rule, pinned to it in lockstep by
    tests/test_factory_init.py: factory_init.py is NOT in the payload, so a
    stamped repo's gates.py cannot import the mapping it has to agree with.
    """
    if not rel.startswith("templates/"):
        return None
    dest = rel[len("templates/"):]
    parts = dest.split("/")
    if "\x00" in dest or ".." in parts or "." in parts or "" in parts:
        return None
    return dest


def stamped_destination_problems(root, expected):
    """E's second half: in a STAMPED repo, the executable payload actually in
    use must match the manifest it was stamped from.

    The mirror-vs-manifest pass proves factory/templates/ is intact. It says
    nothing about tools/factory/gates.py, or the workflows — the copies the
    repo actually runs. A hand edit there passed every offline gate silently,
    including an edit to gates.py itself (issue #207).

    Scoped to stamped trees, discovered by where the tools live: the factory
    repo keeps its own at the root, and its Makefile, docs/adr/, and .github/
    are its own files rather than copies of the payload. Compares against the
    manifest, not the on-disk mirror, so a drifted mirror and a drifted
    destination stay one problem each instead of cross-reporting.
    """
    if not (root / "tools" / "factory" / "gates.py").is_file():
        return []
    problems = []
    for rel in sorted(expected):
        if not rel.startswith(PRISTINE_PREFIXES):
            continue
        dest = install_destination(rel)
        if dest is None:
            continue  # malformed key: already reported by the manifest pass
        path = root / dest
        if not path.is_file():
            problems.append(f"E: {dest} is in the payload but missing here"
                            " (partial stamp — re-stamp the target)")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != expected[rel]:
            problems.append(
                f"E: {dest} does not match factory/{rel} (hand-edited"
                " stamped file — restore it from the mirror or re-stamp,"
                " never keep the edit)")
    return problems


def check_scaffold_sync(root):
    """E: the template payload must match its checksum manifest exactly, and
    a stamped repo's executable payload must match what it was stamped
    from."""
    manifest, problem = read_file(root / "factory" / "manifest.json",
                                  "factory/manifest.json", dict)
    if problem:
        return [f"E: {problem}"]
    if manifest is None:
        return ["E: missing factory/manifest.json"]
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        return ["E: factory/manifest.json has no files map"]
    problems = []
    actual = manifest_files(root)
    for rel, expected in sorted(files.items()):
        if rel not in actual:
            problems.append(f"E: manifest lists missing file factory/{rel}")
        elif actual[rel] != expected:
            problems.append(
                f"E: factory/{rel} does not match its manifest checksum"
                " (re-run manifest update, never hand-edit)")
    problems += [f"E: factory/{rel} is not in the manifest"
                 for rel in sorted(actual) if rel not in files]
    return problems + stamped_destination_problems(root, files)


# Where the factory's label literals are declared: module name -> a
# callable pulling the labels that module names out of its own constants.
# Read the declaration, never the source text — a regex over source stops
# matching the moment a literal is reformatted, and stops SILENTLY, which
# is the exact failure a detector exists to prevent.
#
# sweeps.py is absent on purpose: it is factory-repo-only (never stamped)
# and its TRIAGE labels are bootstrap-created by ensure_labels before any
# sweep runs, so they are wired by construction rather than by taxonomy.
LABEL_DECLARERS = {
    "assembler": lambda mod: ({mod.READY_LABEL, mod.EXHAUSTED_LABEL}
                              | set(mod.CHARTER_BY_TYPE)),
    "human_gates": lambda mod: mod.gate_labels(),
}

# The Makefile's lifecycle targets hand validator.py the label to flip, so
# the target line IS the declaration — there is no constant to read.
MAKEFILE_LABEL = re.compile(r"--label\s+([a-z][a-z0-9:._-]*)")


def declared_labels(root):
    """{label: sorted [where it is named]} across the factory's tools.

    The modules are imported lazily and their absence is silent. A tool
    missing from a stamped repo is a partial stamp, which detector E
    already reports by name; re-reporting it here would just double the
    noise on the one finding that already has an owner. Import failure is
    silent for the same reason it is in E's neighbourhood: a broken
    sibling import already stops gates.py outright, and this detector is
    not the place to discover that.
    """
    named = {}
    for name, pull in sorted(LABEL_DECLARERS.items()):
        try:
            module = importlib.import_module(name)
        except ImportError:
            continue
        for label in pull(module):
            named.setdefault(label, set()).add(f"{name}.py")
    makefile = root / "Makefile"
    if makefile.is_file():
        for lineno, line in enumerate(
                makefile.read_text(encoding="utf-8").splitlines(), 1):
            for label in MAKEFILE_LABEL.findall(line):
                named.setdefault(label, set()).add(f"Makefile:{lineno}")
    return {label: sorted(sites) for label, sites in named.items()}


def check_label_wiring(root):
    """J: every label the factory's tools and Makefile name must exist in
    the label taxonomy.

    The couplings are all runtime-only otherwise. assembler reads
    wo:ready-for-agent and budget-exhausted, human_gates counts the six
    gate labels, and each Makefile lifecycle target hands validator.py one
    to flip — and validator refuses a label the taxonomy does not carry
    (`V: <label> is not a lifecycle label in the taxonomy`). So a taxonomy
    that loses a label passes every offline gate and fails in the dispatch
    plane, at merge or dispatch time, which is the worst moment to find
    out.

    That is not a hypothetical edit. `.github/labels.json` is one of the
    files docs/setup.md and factory_init.update both hand to the stamped
    repo as its own to curate, so pruning it is sanctioned — this is what
    makes the pruning safe.

    One direction only. A taxonomy label with no writer is normal and
    expected: wo:blocked is human-applied by design (ADR-0045) and the
    approval labels are the gates' to set, so "unused" is never a finding.

    Silent when there is no taxonomy FILE to check — an unstamped repo
    has nothing to be wrong about. A file that exists and cannot be read
    is the opposite case, and it is reported: J is the only reader of
    the installed .github/labels.json that runs BEFORE the dispatch
    plane, and the stamped repo curates that file, so nothing checksums
    it either (detector E pins the payload copy, not this one). What J
    declines to say about it, nobody says until a label flip fails.
    """
    # Lazily, for the same reason the declarers are: label_sync.py is a
    # stamped sibling, and importing it at module scope would make a
    # partial stamp crash gates.py before any detector ran.
    try:
        label_sync = importlib.import_module("label_sync")
    except ImportError:
        return []
    # Resolution of WHERE the taxonomy lives stays label_sync's, so the
    # gate and the sync tool cannot read different files — including
    # when the gate only wants to know whether there is one.
    if label_sync.taxonomy_path(root) is None:
        return []
    # The loader's problems travel with their own L: prefix, forwarded as
    # they arrive: a broken taxonomy is that detector's finding, not
    # ours, and sweeps.py forwards them the same way from the same seam.
    # (Forwarding the strings is not wiring detector L into CHECKERS —
    # load_labels reads a file, and L's network half stays out of the
    # offline gate.)
    taxonomy, problems = label_sync.load_labels(root)
    # Nothing parsed at all is not a wiring finding: reporting every
    # declared label as missing from a file that failed to parse buries
    # the one line that says why. J checks the wiring against whatever
    # DID parse rather than bailing on the problems, because bailing
    # would let one malformed entry switch this detector off silently,
    # which is the failure mode it exists to close.
    if not taxonomy:
        return problems
    known = {label["name"] for label in taxonomy}
    return problems + [
        f"J: {site} names {label} but the taxonomy has no such label"
        " (add it to .github/labels.json, or the flip fails when CI"
        " runs it)"
        for label, sites in sorted(declared_labels(root).items())
        if label not in known for site in sites]


def check_config_shape(root):
    """F: factory config must parse and every field be a valid token.

    Every candidate home, not the first hit: the payload copy and the
    installed copy drift independently, so F validates each one that
    exists, where the runtime's factory_config.load reads the first. The
    candidates are the seam's (ADR-0048); only the REPORT order stays
    payload-first — the order F has always printed, pinned by its tests —
    which is the inverse of the seam's installed-first read order. The
    retained divergence is the order of report lines, never which files
    are checked."""
    candidates = [path for path, _ in reversed(
        factory_config.artifact_paths(root, "factory.json"))]
    problems = []
    for path in candidates:
        rel = path.relative_to(root)
        # dict: a config that is not an object has no fields to check, and
        # the key-set checks below subscript it — read_file owns the rule
        # (ADR-0075), so the gate words it as the runtime reader does
        config, problem = read_file(path, rel, dict)
        if problem:
            problems.append(f"F: {problem}")
            continue
        if config is None:
            continue
        # key-set completeness is this gate's whole-shape concern; the
        # field-VALUE grammar is factory_config.config_problems — one
        # home shared with the runtime accessors, so the gate can never
        # again pass a value the dispatch path rejects
        budgets = config.get("budgets_usd")
        if not isinstance(budgets, dict) or sorted(budgets) != ["L", "M", "S"]:
            problems.append(f"F: {rel} budgets_usd must map exactly S, M, L")
        routing = config.get("routing")
        if not isinstance(routing, dict) \
                or sorted(routing) != sorted(factory_config.BANDS):
            expected = ", ".join(factory_config.BANDS)
            problems.append(f"F: {rel} routing must map exactly {expected}")
        problems += [f"F: {rel} {problem}"
                     for problem in factory_config.config_problems(config)]
    return problems


def _is_setext_title(lines, idx):
    """True when lines[idx] is a Setext heading title — a non-blank line with a
    ===/--- underline beneath it. Callers rule out fenced content first. A list
    item or block quote is not a title: `- item` over `---` is a list followed
    by a thematic break, not a heading."""
    if idx + 1 >= len(lines) or not SETEXT_UNDERLINE.match(lines[idx + 1]):
        return False
    line = lines[idx]
    if not line.strip() or SETEXT_UNDERLINE.match(line):
        return False
    return not (HEADING_LINE.match(line) or NOT_A_SETEXT_TITLE.match(line))


def _is_disclosure(verdict):
    """Does this labelled verdict claim nothing — i.e. does it LEAD with the
    NOT-RUN disclaimer ("NOT VERIFIED", "SKIPPED", "N/A", "NOT RUN — reason")?
    Anything else is a claim, and a claim owes literal evidence. The head is
    what asserts: a hedge appended to a claim is still a claim."""
    return bool(DISCLOSURE_VERDICT.match(VERDICT_LEAD.sub("", verdict)))


def _skip_frontmatter(lines):
    """The index of the first BODY line of an artifact's LINES: content
    after a closing `---` fence, when the artifact opens with a YAML
    frontmatter block (metadata, not sectioned content — no caller may
    header-split it or read a `status:` field as a verdict), else 0. An
    unterminated opener is not frontmatter: the whole file is scanned,
    same convention verification_sections has always used. Shared by
    every section-splitting caller (verification_sections for H,
    capture_sections for M) so frontmatter skipping has one home."""
    if lines and FRONTMATTER_FENCE.match(lines[0]):
        for index in range(1, len(lines)):
            if FRONTMATTER_FENCE.match(lines[index]):
                return index + 1
        # An unterminated opener is not frontmatter: fall through to 0.
    return 0


def _walk_sections(lines, body_start):
    """Yield (kind, lineno, payload) events over LINES[body_start:] — the
    shared heading/fence engine verification_sections (H) and
    capture_sections (M) both consume into their own per-section state.
    Two kinds:

      ("heading", lineno, title) — a new section starts here (ATX via
        HEADING_LINE, or Setext via _is_setext_title; the underline that
        follows a Setext title is consumed, never yielded).
      ("line", lineno, (line, in_fence)) — ordinary content. `in_fence`
        marks a line read while a fence opened by FENCE_OPEN is still
        open, so a caller applies its own "is this evidence" or "is this
        body text" rule without re-deriving fence state itself. A line
        that OPENS or CLOSES a fence is itself never yielded — matching
        verification_sections' original behaviour, where neither an
        opening nor a closing fence marker is read as content or as a
        possible verdict/heading line.

    Finally, if the last fence opened is never closed, yields
    ("unclosed", lineno, None) with the fence's OWN opening line number —
    a caller that owes no such rule (M) may simply ignore the event, the
    same way H already reports it and nothing else has ever needed to."""
    fence = None  # (marker char, marker length, opening line number)
    underlined = False
    for lineno, line in enumerate(lines[body_start:], body_start + 1):
        if fence is not None:
            if fence_closes(line, fence[0], fence[1]):
                fence = None
            else:
                yield "line", lineno, (line, True)
            continue
        if underlined:  # the ===/--- under a Setext title, already consumed
            underlined = False
            continue
        opened = fence_open(line)
        if opened:
            fence = (opened[0], opened[1], lineno)
            continue
        heading = HEADING_LINE.match(line)
        if heading:
            yield "heading", lineno, (heading.group(2) or "(untitled)")
            continue
        if _is_setext_title(lines, lineno - 1):
            yield "heading", lineno, line.strip()
            underlined = True
            continue
        yield "line", lineno, (line, False)
    if fence is not None:
        yield "unclosed", fence[2], None


def verification_sections(text):
    """Split a verification artifact's TEXT into heading-delimited sections,
    each recording — IN ITS OWN SCOPE — whether it shows literal output,
    discloses a check as NOT RUN, and what verdicts it asserts. Scope is the
    point: evidence parked in an appendix does not vouch for a criterion
    three headings away. Fenced content is inert: a heading, a `Result:`
    line, or a "not run" quoted inside evidence is output, not the author's
    assertion.

    A section asserts a verdict exactly one way: `results` holds its LABELLED
    verdict lines as (lineno, verdict) pairs (the verdict-noun vocabulary —
    see RESULT_LINE). Prose and heading text assert nothing. YAML frontmatter
    is metadata and is skipped outright, so a `status:` field is never
    mistaken for an author's verdict.

    Public with evidence_problems: pure text in, structure out, so the H
    grammar is exercisable without a fixture tree. Returns (sections,
    unclosed), where each section is {"title", "lineno", "evidence",
    "not_run", "results"} and `unclosed` is the line number of a fence that
    is never closed, or None.

    Built on the shared _skip_frontmatter/_walk_sections engine (also used
    by capture_sections, detector M's own reader): this function owns only
    the H-specific per-line rule (what counts as evidence, a NOT-RUN
    disclosure, or a labelled verdict), not the heading/fence grammar
    itself."""

    def blank(title, lineno):
        return {"title": title, "lineno": lineno, "evidence": False,
                "not_run": False, "results": []}

    lines = text.splitlines()
    body = _skip_frontmatter(lines)
    sections = []
    current = blank("(untitled)", body + 1)
    unclosed = None
    for kind, lineno, payload in _walk_sections(lines, body):
        if kind == "heading":
            sections.append(current)
            current = blank(payload, lineno)
        elif kind == "unclosed":
            unclosed = lineno
        else:  # "line"
            line, in_fence = payload
            if in_fence:
                if line.strip() and not PLACEHOLDER_LINE.match(line):
                    current["evidence"] = True
                continue
            if NOT_RUN_TOKEN.search(line):
                current["not_run"] = True
            result = RESULT_LINE.match(line)
            if result:
                current["results"].append((lineno, result.group(1)))
    sections.append(current)
    return sections, unclosed


def evidence_problems(text):
    """The H grammar over one verification artifact's TEXT: [(lineno,
    suffix)] for every violation, in artifact order — an unclosed fence
    first (it would otherwise swallow every criterion after it), then each
    section's unevidenced claim, then the artifact-wide backstop. Suffixes
    carry no label and no path; check_evidence_honesty prefixes
    "H: {rel}:{lineno}" (the cost_ledger.parse convention: the grammar is
    pure over text, so its rules are exercisable without a fixture tree).

    The rule is per-criterion, uniform, and UNEXCUSED: every section holding
    a labelled verdict line carries its own evidence or its own disclaimer.
    There is no roll-up exemption to buy by renaming a section, and no "some
    other section is honest" test to satisfy with one throwaway leaf.

    An artifact that asserts no labelled verdict anywhere escapes that rule
    but still owes the reader something, so the backstop demands exactly what
    the acceptance criterion demands: literal command output, or an explicit
    NOT-RUN disclaimer. Neither one present means the build fails."""
    problems = []
    sections, unclosed = verification_sections(text)
    if unclosed is not None:
        problems.append((unclosed, "unclosed code fence — every criterion"
                                   " after it is unread"))
    for section in sections:
        if section["evidence"]:
            continue
        claims = [(lineno, verdict)
                  for lineno, verdict in section["results"]
                  if not _is_disclosure(verdict)]
        if not claims:
            continue
        lineno, verdict = claims[0]
        problems.append(
            (lineno,
             f'criterion "{section["title"]}" asserts {verdict} with'
             " neither literal evidence nor a NOT-RUN disclaimer (evidence"
             " must be a fenced code block in this section)"))
    # An artifact that asserts no verdict at all escapes the per-criterion
    # rule; it still owes the reader output or a disclosure.
    if not any(s["results"] for s in sections) and not any(
            s["evidence"] or s["not_run"] for s in sections):
        problems.append(
            (1, "verification artifact shows neither literal evidence nor"
                " a NOT-RUN disclaimer (evidence must be a fenced code"
                " block)"))
    return problems


def check_evidence_honesty(root, parsed=None):
    """H: a criterion that asserts a verdict must show literal output or
    disclose that the check was NOT RUN. Prose confidence is not evidence
    (PRD-0001: a change whose verification is asserted but not evidenced
    fails the build).

    The grammar — what asserts, what evidences, what discloses — is
    evidence_problems, pure over the artifact's text. What stays here is
    the detector's own job: walk each run's verification.md from `parsed`
    (an unreadable artifact is a problem, never a traceback — parse_run
    already caught that read and carries it as verification_error) and
    prefix each (lineno, suffix) the grammar returns. `parsed` defaults
    to a fresh parse of `root`, same convention as A, C, D, G and I."""
    if parsed is None:
        parsed = parse_run(root)
    problems = []
    for entry in parsed["runs"]:
        if entry["verification"] is None \
                and entry["verification_error"] is None:
            continue
        rel = (entry["path"] / "verification.md").relative_to(root)
        if entry["verification_error"] is not None:
            problems.append(
                f"H: {rel} cannot be read: {entry['verification_error']}")
            continue
        problems.extend(f"H: {rel}:{lineno} {suffix}"
                        for lineno, suffix
                        in evidence_problems(entry["verification"]))
    return problems


# N (ADR-0071): the inline ambiguity marker a drafting stage leaves at the
# exact clause it could not settle. Only the colon form is a marker — the
# convention's bare name, `[NEEDS CLARIFICATION]`, is how docs talk about
# it — and a marker inside a code span or a fenced block is quoted, not
# live: the PRD and architecture templates document the syntax that way.
CLARIFICATION_MARKER = re.compile(r"\[NEEDS CLARIFICATION:")
CODE_SPAN = re.compile(r"(`+).*?\1")

# O (ADR-0072): a PRD section's coverage waiver, directly under its
# heading. Like detector B's `No work order:` declaration it owes a
# reason — a bare marker waives nothing.
COVERAGE_WAIVER = re.compile(
    r"^\s*<!--\s*coverage-waiver:\s*(?!-->)\S.*?-->\s*$")
SECTION_CITATION = re.compile(r"§\s*([^,;)§]+)")
# O's grandfather cutoff: ADR-0072's own date. Coverage is a NEW rule, and
# a PRD approved and decomposed before it existed does not owe it — the
# principle ADR-0043's `(pre-ledger)` annotation established for G, keyed
# (as detector M's cutoff in the standards-enforcement design is) on the
# PRD's own frontmatter `date:`, a fixed constant against a static field,
# so the same tree always answers the same way. This repo's PRD-0001..
# PRD-0005 predate it; PRD-0006, dated on it, carries its own waivers, as
# ADR-0072's Consequences ask. A missing date is NOT grandfathered — fail
# closed, so omitting the date cannot dodge O.
COVERAGE_ADOPTED = "2026-09-21"


def check_needs_clarification(root, parsed=None):
    """N: a prd.md or architecture.md — the two artifacts with a human
    approval gate (ADR-0033) — must carry no unresolved
    `[NEEDS CLARIFICATION: ...]` marker (ADR-0071). The clarify pass
    removes a marker as it writes the answer back, so a live one is an
    ambiguity nobody has settled: the gate is CI-enforced, not just
    prompt-enforced. `parsed` defaults to a fresh parse of `root`, same
    convention as A, C, D, G, H and I."""
    if parsed is None:
        parsed = parse_run(root)
    problems = []
    for entry in parsed["runs"]:
        for name, key in (("prd.md", "prd"),
                          ("architecture.md", "architecture")):
            if entry[key] is None:
                continue
            rel = (entry["path"] / name).relative_to(root)
            for lineno, line in unfenced(entry[key]):
                if CLARIFICATION_MARKER.search(CODE_SPAN.sub("", line)):
                    problems.append(f"N: {rel}:{lineno} unresolved"
                                    " [NEEDS CLARIFICATION] marker")
    return problems


def _prd_sections(lines):
    """(lineno, title, waived) per `##` section of a PRD, fences skipped.
    `waived`: the first non-blank line under the heading is a reasoned
    coverage waiver."""
    sections = []
    pending = None  # the section still looking for its first body line
    for lineno, line in unfenced(lines):
        heading = HEADING_LINE.match(line)
        if heading and len(heading.group(1)) == 2:
            pending = [lineno, heading.group(2), False]
            sections.append(pending)
        elif pending is not None and line.strip():
            pending[2] = bool(COVERAGE_WAIVER.match(line))
            pending = None
    return [tuple(section) for section in sections]


def _cites(citations, title):
    """Does any `§` citation name this whole section title?"""
    title = title.casefold()
    return any(cited == title or (cited.startswith(title)
                                  and not cited[len(title)].isalnum())
               for cited in citations)


def check_prd_coverage(root, parsed=None):
    """O: the reverse of A (ADR-0072). A says every work-order row cites a
    PRD section; O says every `##` section of a prd.md declaring an
    `id: PRD-####` is cited `§<section>` by at least one work-order row
    of that run's OWN breakdown.md that names that id — or carries a
    `<!-- coverage-waiver: <reason> -->` directly under its heading. An
    absence is either covered or explicitly excused, never invisible.

    Coverage is a Decompose-time property, so a run with no breakdown.md
    yet (a PRD still at its approval gate) is out of scope, as is a PRD
    whose `date:` predates COVERAGE_ADOPTED. `parsed` defaults to a fresh
    parse of `root`, same convention as A, C, D, G, H and I."""
    if parsed is None:
        parsed = parse_run(root)
    problems = []
    for entry in parsed["runs"]:
        prd_id = entry["prd_id"]
        if not prd_id or entry["prd"] is None or entry["breakdown"] is None:
            continue
        date = entry["prd_date"]
        if isinstance(date, str) and date < COVERAGE_ADOPTED:
            continue
        citations = [cited.strip().casefold()
                     for line in entry["breakdown"]
                     if WO_TOKEN.search(line) and prd_id in PRD_TOKEN.findall(
                         line)
                     for cited in SECTION_CITATION.findall(line)]
        rel = (entry["path"] / "prd.md").relative_to(root)
        for lineno, title, waived in _prd_sections(entry["prd"]):
            if not waived and not _cites(citations, title):
                problems.append(
                    f"O: {rel}:{lineno} {prd_id} §{title} is cited by no"
                    " breakdown row and carries no coverage waiver")
    return problems


def _adr_status_by_number(parsed):
    """{ADR number: raw Status text (None when absent or unparseable)} —
    reuses D's own _adr_status_from_lines over parsed["adr_files"], never
    a second status parser. Detector K's own tiny slice of what D already
    validates: K only needs the raw text to compare against "accepted"
    (_status_head), it does not need D's own malformed-status problem
    strings (D already owns reporting those)."""
    return {path.name[:4]: _adr_status_from_lines(lines)[1]
            for path, lines in parsed["adr_files"]}


# ADR-0073's Consequences: build_index never reads the previously
# committed docs/standards.json, so every ADR-derived entry it builds
# fresh carries status "advisory" by construction — it has no other
# honest source for status. Comparing `status` here would make a
# promoted (enforced) entry read as "drifted" forever, which would
# defeat decision (c)'s whole point (a promotion is a docs/standards.json
# edit that must survive a later regeneration). So the drift comparison
# below is over every field EXCEPT status; K's second check (the
# enforced/accepted cross-check further down) is what validates `status`
# instead, directly against the COMMITTED entry, never against a regen.
_DRIFT_FIELDS = ("slug", "statement", "level", "source", "domain")


def _drift_fingerprint(entry):
    """The fields of a docs/standards.json ENTRY that a fresh ADR regen
    can and must reproduce exactly — everything build_index derives,
    deliberately excluding `status` (see _DRIFT_FIELDS above)."""
    return tuple(entry.get(field) for field in _DRIFT_FIELDS)


def check_standards_drift(root, parsed=None):
    """K: docs/standards.json is a derived, regenerable index (ADR-0073)
    over docs/adr/*.md's `## Normative statements` sections — the same
    checksum-pinned relationship detector E has with
    factory/manifest.json: a hand-edited or stale index is worse than no
    index, because a reviewer citing a slug trusts it still matches its
    source.

    K fails two independent ways, kept in one detector because both read
    the same committed file:

    (1) the committed file's ADR-derived entries (every entry whose
        `source` is NOT a standards_index.HAND_CURATED_PREFIX entry)
        disagree with a fresh standards_index.build_index(root) regen,
        compared on every field EXCEPT `status` (see _DRIFT_FIELDS —
        `status` can never "drift" from an ADR regen by definition, since
        an ADR bullet never states one).
    (2) an `enforced`-status entry's source ADR's status
        (_adr_status_by_number, reusing _adr_status_from_lines/
        _status_head — the same machinery detector D already owns, not a
        second status parser) is not `accepted`.

    An absent docs/standards.json is not a K problem — mirrors detector
    G's "an absent ledger is silent" precedent (check_cost_ledger): the
    index is created by the first `standards_index.py update` run, so a
    repo that has never run it has nothing to account for yet.

    `parsed` defaults to a fresh parse of `root`, same lazy-default
    convention as A, C, D, G, H and I; run_all threads the shared parse
    in (K joins _PARSED_CHECKERS) so this never re-parses on that path."""
    standards_path = root / standards_index.STANDARDS_PATH
    if not standards_path.is_file():
        return []
    # Hand-written rather than cli.read_file (ADR-0075): the shape
    # wording below is K's own and covers null. Bytes that are not
    # UTF-8 join the parse failure's wording, by that record's rule.
    try:
        committed_text = standards_path.read_text(encoding="utf-8")
    except OSError as err:
        return [f"K: cannot read {standards_index.STANDARDS_PATH}: {err}"]
    except UnicodeDecodeError as err:
        return [f"K: {standards_index.STANDARDS_PATH} is not valid JSON:"
                f" {err}"]
    try:
        committed = json.loads(committed_text)
    except json.JSONDecodeError as err:
        return [f"K: {standards_index.STANDARDS_PATH} is not valid JSON:"
                f" {err}"]
    if not isinstance(committed, list):
        return [f"K: {standards_index.STANDARDS_PATH} must be a JSON array"]

    if parsed is None:
        parsed = parse_run(root)
    fresh, build_problems = standards_index.build_index(root)
    problems = [f"K: {p}" for p in build_problems]

    committed_adr = sorted(
        _drift_fingerprint(entry) for entry in committed
        if isinstance(entry, dict)
        and not (isinstance(entry.get("source"), str)
                 and entry["source"].startswith(
                     standards_index.HAND_CURATED_PREFIX)))
    fresh_fingerprint = sorted(_drift_fingerprint(entry) for entry in fresh)
    if committed_adr != fresh_fingerprint:
        problems.append(
            f"K: {standards_index.STANDARDS_PATH} has drifted from a"
            " fresh ADR regeneration (run"
            " `python3 standards_index.py update`)")

    statuses = _adr_status_by_number(parsed)
    for entry in committed:
        if not isinstance(entry, dict) or entry.get("status") != "enforced":
            continue
        number = standards_index.adr_number(entry.get("source"))
        if number is None:
            continue
        status = statuses.get(number)
        if _status_head(status) != "accepted":
            problems.append(
                f"K: enforced statement {entry.get('slug')!r} cites"
                f" ADR-{number}, status {status!r} (not accepted)")
    return problems


# skills/capture/TEMPLATE.md's own `##` headings, verbatim — the ground
# truth M checks against (a paraphrase drifts from the template the
# moment either one is edited alone; this list is the one place that
# would need to move with it). "Work items" and "Notes" are
# deliberately excluded: "Work items" only applies when
# `re-entry: implement` (protocol.py, not this module's concern) and
# "Notes" is an open catch-all with no placeholder to be filled in —
# neither is a section M can call missing-or-placeholder in every brief.
CAPTURE_REQUIRED_SECTIONS = (
    "Defect (or Condition)",
    "Reproduction / Evidence",
    "Root-cause hypothesis",
    "Blast radius",
    "Ruled out",
)

# TEMPLATE.md's own placeholder shape: a whole line (an optional leading
# list marker, for "## Ruled out"'s `- <...>` bullet form) that is
# nothing but a single bracketed span of instructional prose, e.g.
# `<What is broken — observed vs expected behavior...>`. Deliberately a
# looser shape rule than H's PLACEHOLDER_LINE (which matches by FILLER
# TEXT, not by shape alone — H's own comment explains why: `<html>`-shaped
# real evidence would false-positive on a shape-only rule). That risk is
# H's, not M's: TEMPLATE.md's own placeholders are full descriptive
# prose, not short filler tokens, and a capture brief's prose is never
# expected to be a single line wrapped end-to-end in angle brackets, so
# the shape alone is the safe, sufficient signal here.
CAPTURE_PLACEHOLDER = re.compile(r"^\s*[-*+]?\s*<[^>]*>\s*$")

# M's grandfather cutoff (ADR-0073): CAPTURE_REQUIRED_SECTIONS is a NEW
# rule, and a new rule cannot retroactively apply to briefs written
# before it existed — the same "an old thing does not owe a new rule"
# principle ADR-0043's `(pre-ledger)` annotation already established for
# detector G, applied here without a 57-file hand-annotation pass: a
# defect.md's own frontmatter `date:` is already the fact that tells the
# two eras apart (this repo's OWN docs/fixes/*/defect.md corpus predates
# TEMPLATE.md's current heading set almost entirely — most captured
# `## Reproduction`, `## Why it matters`, `## Fix`, never `## Root-cause
# hypothesis`/`## Blast radius`/`## Ruled out` at all). A FIXED constant
# compared against a file's own static field is deterministic and
# hermetic (unlike comparing against wall-clock "now", the pattern
# check_staleness's own docstring rules out for the opposite reason) —
# the same tree always answers the same way, forever. This also
# generalizes correctly for every OTHER repo this detector ships to
# (factory_init.MIRRORS): any defect.md already on disk when a repo
# takes this factory update predates M by construction, and a fresh
# capture from here on carries today's date and is checked in full.
# A missing or unparseable `date:` is NOT grandfathered — fail closed,
# the same direction cost_ledger.line_problems takes on a bad `at`
# field, so an author cannot dodge M by omitting the date.
CAPTURE_ADOPTED = "2026-09-21"


def capture_sections(text):
    """Split a capture artifact's (defect.md) TEXT into heading-delimited
    sections, built on the same _skip_frontmatter/_walk_sections engine
    verification_sections (H) uses — same frontmatter skip, same
    ATX/Setext heading grammar, same fence tracking. Unlike H, a defect.md
    section is read for PRESENCE, not for a verdict: each entry is
    {"title", "lineno", "lines": [str]} — the section's own literal
    content lines (fenced or not; M owes no evidence-vs-narration
    distinction, only "is there real content here"). An unclosed fence is
    not M's concern (H already owns reporting that, for the artifact type
    where it matters) and is silently ignored here.

    Public with capture_completeness_problems: pure text in, structure
    out, the same H-derived convention (evidence_problems)."""
    lines = text.splitlines()
    body = _skip_frontmatter(lines)
    sections = []
    current = {"title": "(untitled)", "lineno": body + 1, "lines": []}
    for kind, lineno, payload in _walk_sections(lines, body):
        if kind == "heading":
            sections.append(current)
            current = {"title": payload, "lineno": lineno, "lines": []}
        elif kind == "line":
            line, _in_fence = payload
            current["lines"].append(line)
        # "unclosed" carries nothing M reads.
    sections.append(current)
    return sections


def _section_has_content(section):
    """Does this capture section carry anything beyond blank lines and
    TEMPLATE.md's own unfilled placeholder?"""
    return any(line.strip() and not CAPTURE_PLACEHOLDER.match(line)
              for line in section["lines"])


def capture_completeness_problems(text):
    """The M grammar over one defect.md's TEXT: a problem string
    (unlocated — check_capture_completeness prefixes "M: {rel}") for
    every CAPTURE_REQUIRED_SECTIONS heading that is missing outright or
    present with only TEMPLATE.md's own bracketed filler left unedited.
    Matching is case-insensitive on the trimmed heading text — an
    author's own casing is not the claim here, the section's presence
    is."""
    sections = {section["title"].strip().casefold(): section
                for section in capture_sections(text)}
    problems = []
    for name in CAPTURE_REQUIRED_SECTIONS:
        section = sections.get(name.casefold())
        if section is None:
            problems.append(f"missing required section {name!r}")
        elif not _section_has_content(section):
            problems.append(
                f"required section {name!r} is present but"
                " placeholder-only (template text was never filled in)")
    return problems


def check_capture_completeness(root):
    """M: every docs/fixes/<slug>/defect.md must carry skills/capture/
    TEMPLATE.md's required sections, each with real content — the same
    "a criterion that asserts must show its own evidence" discipline H
    already applies to verification.md, generalized to a fixed, named
    heading list instead of H's open one (H reads WHATEVER headings the
    author wrote; M reads for a SPECIFIC, protocol-required set).

    A run with no defect.md yet (an idea/PRD-only feature run, or a
    maintenance run mid-Capture) is out of scope entirely — M walks only
    the defect.md files run_dirs(root) finds, the same "absence
    elsewhere is not this detector's problem" discipline C already
    applies file-by-file. A defect.md whose own frontmatter `date:`
    predates CAPTURE_ADOPTED is grandfathered (see that constant's own
    comment) — a missing or unparseable date is NOT grandfathered, fail
    closed. Bare `root`, no `parsed`: defect.md is not one of
    parse_run's run-level artifacts (its own docstring says so), so
    threading `parsed` here would either grow that walk for one detector
    or leave M re-deriving the same thing under a different name — this
    reads the tree directly, the same shape E/F/J already have."""
    problems = []
    for run in run_dirs(root):
        defect = run / "defect.md"
        if not defect.is_file():
            continue
        frontmatter = read_frontmatter(defect) or {}
        date = frontmatter.get("date")
        if isinstance(date, str) and date < CAPTURE_ADOPTED:
            continue
        rel = defect.relative_to(root)
        text = defect.read_text(encoding="utf-8")
        problems.extend(f"M: {rel} {suffix}"
                        for suffix in capture_completeness_problems(text))
    return problems


# The detector letter namespace, indexed in ONE place: letter -> (name,
# home module, plane). A letter's plane decides where its code goes.
# Offline detectors live in this module and gate every push/PR through
# CHECKERS — hermetic and deterministic, no network (B reads a local event
# file, so it is offline too; it just SKIPs outside a PR run). Network
# detectors read live services, so they live beside the scheduled sweeps
# that drive them and are NEVER wired into CHECKERS: L reads the repo's
# live label set through gh, which is why it lives in label_sync.py and
# not here (the same posture that keeps every ADR-0037 seam offline).
# K and M are claimed below (ADR-0073), and N and O (ADR-0071,
# ADR-0072) skipped them while that work was in flight. A new detector
# takes the next free letter (P) and adds its row here.
DETECTORS = {
    "A": ("WO-CITATION", "gates.py", "offline"),
    "B": ("PR-TRACEABILITY", "gates.py", "offline"),
    "C": ("LINK-INTEGRITY", "gates.py", "offline"),
    "D": ("BLUEPRINT-DRIFT", "gates.py", "offline"),
    "E": ("SCAFFOLD-SYNC", "gates.py", "offline"),
    "F": ("CONFIG-SHAPE", "gates.py", "offline"),
    "G": ("COST-LEDGER", "gates.py", "offline"),
    "H": ("EVIDENCE-HONESTY", "gates.py", "offline"),
    "I": ("STALENESS", "gates.py", "offline"),
    "J": ("LABEL-WIRING", "gates.py", "offline"),
    "K": ("STANDARDS-DRIFT", "gates.py", "offline"),
    "L": ("LABEL-SYNC", "label_sync.py", "network"),
    "M": ("CAPTURE-COMPLETENESS", "gates.py", "offline"),
    "N": ("NEEDS-CLARIFICATION", "gates.py", "offline"),
    "O": ("PRD-COVERAGE", "gates.py", "offline"),
}

CHECKERS = (check_wo_citation, check_pr_traceability, check_link_integrity,
            check_blueprint_drift, check_scaffold_sync, check_label_wiring,
            check_config_shape, check_cost_ledger, check_evidence_honesty,
            check_staleness, check_standards_drift, check_capture_completeness,
            check_needs_clarification, check_prd_coverage)

# The CHECKERS that read the knowledge plane's run artifacts and were
# migrated onto knowledge_plane.parse_run (issue #442): A, C, D, G, H and
# I. E, F and J each already read their own dedicated seam exactly once
# (factory_config.py, cost_ledger.py's own ledger file, label_sync.py)
# and B reads the CI event payload — none of those four touch `parsed`,
# so run_all keeps threading `root, env` to B and bare `root` to E/F/J,
# same as before this issue. Identity-checked, same style as the
# existing check_pr_traceability special-case below, rather than adding
# an `env`-shaped parameter every CHECKERS entry must now accept.
_PARSED_CHECKERS = frozenset((
    check_wo_citation, check_link_integrity, check_blueprint_drift,
    check_cost_ledger, check_evidence_honesty, check_staleness,
    check_standards_drift, check_needs_clarification, check_prd_coverage))

# Issue #443 (the sequence's "contract" step) asked whether dropping the
# migrate-era shim means making `parsed` a required argument on these six
# functions. It does not, and this is that judgment call, made and kept
# in one place rather than six.
#
# The thing #443 actually asks to be gone — a detector, reached through
# `run_all`, re-walking the filesystem another detector (or itself) has
# already walked this pass — IS gone, and was already gone as of #442:
# `run_all` below builds `parsed` exactly once and threads it to every
# _PARSED_CHECKERS entry by identity, so none of the six ever takes its
# own `if parsed is None` branch on that path (pinned by
# TestRunAll.test_run_all_parses_the_knowledge_plane_exactly_once in
# tests/test_gates.py, which counts parse_run's calls directly rather
# than trusting the code doesn't regress).
#
# What stays is each function's OWN fallback, for a caller that invokes
# it directly rather than through run_all — and this repo leans on that
# in ~50 places (tests/test_gates.py, tests/test_budget_guard.py, and
# seven calls in selftest() below), several of which need a real tree no
# hand-built `parsed` dict substitutes for: D's tree-claims happy path,
# G's ledger seam, I's live link-target check, and H's TestLockstep read
# of this repo's OWN verification.md. Requiring `parsed` would not
# remove one filesystem read from the path that gates every push/PR —
# only push `parse_run(root, ...)` boilerplate onto every one of those
# standalone callers, for a test-count-sized diff with no behavior
# change. `check_pr_traceability`'s own `env=None` sibling default has
# stood since ADR-0033 without ever being treated as debt to strip; the
# `parsed=None` fallback is the same convention, not the shim.


def run_all(root, env=None):
    """Run every detector. `env` (default os.environ) is threaded to the
    checkers that read the process environment, so callers can stay
    hermetic without mutating global state. The knowledge plane is
    parsed ONCE (parse_run, with gates._scannable_files' own selection)
    and threaded to every _PARSED_CHECKERS entry, rather than each one
    re-parsing it — issue #442's "migrate" step built this (following
    #441's "expand"); #443's "contract" step confirmed nothing more was
    left to remove (see the _PARSED_CHECKERS comment above)."""
    if env is None:
        env = os.environ
    parsed = parse_run(root, scannable=_scannable_files(root))
    problems = []
    for checker in CHECKERS:
        if checker is check_pr_traceability:
            problems.extend(checker(root, env))
        elif checker in _PARSED_CHECKERS:
            problems.extend(checker(root, parsed))
        else:
            problems.extend(checker(root))
    return problems


# ---- planted-defect fixtures ----------------------------------------
#
# One builder per detector (or per detector's own sub-scenarios), each
# writing an isolated tree from nothing. `selftest` below and
# tests/test_gates.py both build detector fixtures through these — a
# detector fixture is written here exactly once, whichever caller needs
# it (issue #440). A builder writes files and returns nothing unless a
# caller needs something back (a path, a computed label set).

def _wo_citation_defect_fixture(root):
    """A breakdown row that cites its PRD section, beside one that does
    not."""
    breakdown = root / "docs" / "features" / "demo" / "breakdown.md"
    breakdown.parent.mkdir(parents=True, exist_ok=True)
    breakdown.write_text(
        "- [x] WO-0001 do the thing (PRD-0001 §Solution)\n"
        "- [ ] WO-0002 uncited row\n", encoding="utf-8")


def _link_integrity_base_fixture(root):
    """A PRD declaring PRD-0001 and an ADR file declaring ADR-0001 — the
    minimal resolvable pair C's dangling-token checks run against."""
    run = root / "docs" / "features" / "demo"
    run.mkdir(parents=True, exist_ok=True)
    (run / "prd.md").write_text(
        "---\nstage: prd\nid: PRD-0001\n---\n# PRD\n", encoding="utf-8")
    adr_dir = root / "docs" / "adr"
    adr_dir.mkdir(parents=True, exist_ok=True)
    (adr_dir / "0001-real.md").write_text("# Real\n", encoding="utf-8")


def _link_integrity_defect_fixture(root):
    """PRD-0001 and ADR-0001 resolve; PRD-0099 and WO-0003 dangle."""
    _link_integrity_base_fixture(root)
    (root / "CONTEXT.md").write_text(
        "See PRD-0001, PRD-0099, ADR-0001 and WO-0003.\n", encoding="utf-8")


def _blueprint_drift_defect_fixture(root):
    """The index disagrees with ADR-0002's own file, and an artifact
    still cites ADR-0001, which ADR-0002 superseded."""
    adr_dir = root / "docs" / "adr"
    adr_dir.mkdir(parents=True)
    (adr_dir / "0001-real.md").write_text(
        "# Real\n\n- Status: superseded by ADR-0002\n", encoding="utf-8")
    (adr_dir / "0002-new.md").write_text(
        "# New\n\n- Status: accepted\n", encoding="utf-8")
    (adr_dir / "README.md").write_text(
        "| ADR | Decision | Status |\n|-----|----------|--------|\n"
        "| [0001](0001-real.md) | Real | superseded by ADR-0002 |\n"
        "| [0002](0002-new.md) | New | provisional |\n", encoding="utf-8")
    (root / "CONTEXT.md").write_text(
        "Per ADR-0001, which the blueprint already retired.\n",
        encoding="utf-8")


def _cost_ledger_defect_fixture(root):
    """A merged work order the ledger never recorded, beside a line that
    is not JSON at all."""
    breakdown = root / "docs" / "features" / "demo" / "breakdown.md"
    breakdown.parent.mkdir(parents=True, exist_ok=True)
    breakdown.write_text(
        "- [x] WO-0001 do the thing (PRD-0001 §Solution)\n"
        "- [ ] WO-0002 uncited row\n", encoding="utf-8")
    ledger = root / "docs" / "factory" / "costs.jsonl"
    ledger.parent.mkdir(parents=True, exist_ok=True)
    ledger.write_text(
        json.dumps({"wo": "WO-0002", "run_id": "r1", "model": "m",
                    "tokens": 900, "cost": 0.3, "outcome": "failed"})
        + "\n{\"wo\": \"WO-0001\"\n", encoding="utf-8")


def _staleness_defect_fixture(root):
    """A doc that links to a path which is not on disk."""
    (root / "CONTEXT.md").write_text(
        "The [handbook](docs/handbook.md) moved away.\n", encoding="utf-8")


def _standards_drift_defect_fixture(root):
    """Two failure shapes K must catch, from one committed
    docs/standards.json: a committed ADR-derived entry whose statement
    text disagrees with a fresh regen of its own source ADR, and an
    `enforced`-status entry whose source ADR is not `accepted`."""
    adr_dir = root / "docs" / "adr"
    adr_dir.mkdir(parents=True)
    (adr_dir / "0001-real.md").write_text(
        "# Real\n\n- Status: accepted\n\n## Normative statements\n\n"
        "- **some-slug** (factory): Something MUST happen.\n",
        encoding="utf-8")
    (adr_dir / "0002-provisional.md").write_text(
        "# Provisional\n\n- Status: provisional\n", encoding="utf-8")
    standards_path = root / standards_index.STANDARDS_PATH
    standards_path.parent.mkdir(parents=True, exist_ok=True)
    standards_path.write_text(json.dumps([
        {"slug": "some-slug",
         "statement": "Something MUST happen (STALE WORDING).",
         "level": "MUST", "source": "adr/0001#some-slug",
         "status": "advisory", "domain": "factory"},
        {"slug": "enforced-slug", "statement": "Something else MUST"
         " happen.", "level": "MUST", "source": "adr/0002#enforced-slug",
         "status": "enforced", "domain": "factory"},
    ]), encoding="utf-8")


def _standards_drift_clean_fixture(root):
    """The happy path: docs/standards.json matches a fresh regen exactly,
    and its one `enforced` entry cites an `accepted` ADR."""
    adr_dir = root / "docs" / "adr"
    adr_dir.mkdir(parents=True)
    (adr_dir / "0001-real.md").write_text(
        "# Real\n\n- Status: accepted\n\n## Normative statements\n\n"
        "- **some-slug** (factory): Something MUST happen.\n",
        encoding="utf-8")
    standards_path = root / standards_index.STANDARDS_PATH
    standards_path.parent.mkdir(parents=True, exist_ok=True)
    standards_path.write_text(json.dumps([
        {"slug": "some-slug", "statement": "Something MUST happen.",
         "level": "MUST", "source": "adr/0001#some-slug",
         "status": "enforced", "domain": "factory"},
    ]), encoding="utf-8")


def _capture_completeness_defect_fixture(root):
    """A fresh (dated on CAPTURE_ADOPTED, so not grandfathered) defect.md:
    two required sections missing outright, two present as unfilled
    TEMPLATE.md placeholders, and one filled in for real — every shape M
    must tell apart, in one fixture."""
    path = root / "docs" / "fixes" / "demo" / "defect.md"
    path.parent.mkdir(parents=True)
    path.write_text(
        "---\nstage: capture\nrun: maintenance:demo\n"
        f"date: {CAPTURE_ADOPTED}\nre-entry: implement\n---\n\n"
        "# Defect: demo\n\n"
        "## Defect (or Condition)\n\n<What is broken — observed vs"
        " expected behavior.>\n\n"
        "## Reproduction / Evidence\n\nRun `make check`; it fails with"
        " a traceback.\n\n"
        "## Ruled out\n\n- <Dead ends already investigated and why"
        " they're not it — or \"none yet\".>\n",
        encoding="utf-8")


def _capture_completeness_grandfathered_fixture(root):
    """A defect.md dated well before CAPTURE_ADOPTED, missing every
    required section — M must stay silent: the brief predates the
    convention (ADR-0073)."""
    path = root / "docs" / "fixes" / "old" / "defect.md"
    path.parent.mkdir(parents=True)
    path.write_text(
        "---\nstage: capture\nrun: maintenance:old\ndate: 2026-01-01\n"
        "re-entry: implement\n---\n\n# Defect: old\n\n"
        "## Defect\n\nSomething broke, written before the convention"
        " existed.\n",
        encoding="utf-8")


def _scaffold_sync_fixture(root, rel="Makefile", payload="check:\n"):
    """A single template file under factory/templates/ whose manifest
    checksum matches it exactly — E's baseline synced state, shared by
    every caller that needs a starting point to tamper with."""
    path = root / "factory" / "templates" / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    (root / "factory" / "manifest.json").write_text(
        json.dumps({"files": {f"templates/{rel}": digest}}),
        encoding="utf-8")
    return path


# The correctly curated state's Makefile: one lifecycle target, naming
# the one label the fixtures below prune and restore.
_LABEL_WIRING_MAKEFILE = (
    "wo-merged:\n\tpython3 validator.py lifecycle --label wo:merged\n")


def _label_taxonomy_json(names):
    return json.dumps([{"name": name, "color": "ededed",
                        "description": name} for name in names])


def _label_wiring_wired_fixture(root, makefile=None):
    """Write the correctly curated state — a Makefile plus a taxonomy
    carrying every label the shipped tools and that Makefile name — and
    return the sorted label list, so a caller can derive a pruned
    variant. Derived from declared_labels rather than hand-listed, so
    this fixture cannot drift out of step with the tools it wires."""
    (root / "Makefile").write_text(
        _LABEL_WIRING_MAKEFILE if makefile is None else makefile,
        encoding="utf-8")
    named = sorted(declared_labels(root))
    labels = root / ".github" / "labels.json"
    labels.parent.mkdir(parents=True, exist_ok=True)
    labels.write_text(_label_taxonomy_json(named), encoding="utf-8")
    return named


def _config_shape_defect_fixture(root):
    """A factory.json with every F-checked field wrong at once: an
    incomplete budgets_usd and routing map, a non-positive wip_cap, a
    negative monthly_cap_usd, and an effort outside the vocabulary."""
    path = root / "factory" / "templates" / "factory.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(
        {"budgets_usd": {"S": 5}, "routing": {"mechanical": "m"},
         "wip_cap": 0, "monthly_cap_usd": -1,
         "effort": {"mechanical": "extreme"}}), encoding="utf-8")
    return path


def _pr_event_fixture(root, payload):
    """Write a GITHUB_EVENT_PATH payload and return the env pointing
    check_pr_traceability at it."""
    event = root / "event.json"
    event.write_text(json.dumps(payload), encoding="utf-8")
    return {"GITHUB_EVENT_PATH": str(event)}


# Fragments H's own test suite (tests/test_gates.py TestEvidenceHonesty)
# shares with these two file-tree fixtures — each one a literal ALSO used
# directly as `gates.evidence_problems(...)` input by a unit-level
# regression test for the exact bypass it demonstrates, per issue #440's
# review round 2: H's fixtures were consolidated at the file-tree level
# but these body fragments still had a second, hand-typed copy in the
# pytest suite. Named for the bypass each one is the evidence body of;
# each fixture below is built by concatenating the fragment with content
# specific to that scenario, never a full second copy of it.
EVIDENCE_FABRICATED_HEAD = ("## Summary\n\n6/6 criteria pass. Verdict: ship"
                           " it.\n\n## Criteria & evidence\n\n")
EVIDENCE_FABRICATED_TAIL = ("## Failures\n\nNone.\n\n## Not verified\n\n"
                           "Nothing; everything was checked.\n")
EVIDENCE_HONEST_LEAF = ("### Grammar parses\n\n- Evidence:\n  ```\n  .\n"
                       "  ```\n- Result: PASS\n\n")
EVIDENCE_APPENDIX_FENCE = "```\ngit log --oneline -3\n```\n"
EVIDENCE_SUITE_GREEN_OPEN = ("### Suite is green\n\n- Evidence:\n  ```\n"
                            "  Ran 212 tests\n\n  OK\n")


def _evidence_honesty_defect_fixture(root):
    """Four artifacts H must catch: a bare unevidenced claim, a
    template-shaped roll-up with zero real output, a gamed artifact
    exercising each bypass H closes, and an unclosed code fence that must
    not silently swallow the rest of the file."""
    demo = root / "docs" / "features" / "demo"
    demo.mkdir(parents=True)
    (demo / "verification.md").write_text(
        "---\nstage: verify\n---\n# Verification\n\n"
        "### Suite is green\n\n- Check: ran it, all good.\n"
        "- Result: PASS\n", encoding="utf-8")
    # A wholly fabricated, TEMPLATE-shaped artifact with ZERO command
    # output. The `## Not verified` slot ships in every artifact, so its
    # LABEL cannot be the disclosure — only what the author writes is.
    fabricated = root / "docs" / "features" / "fabricated"
    fabricated.mkdir(parents=True)
    (fabricated / "verification.md").write_text(
        "---\nstage: verify\n---\n# Verification\n\n"
        + EVIDENCE_FABRICATED_HEAD + "### Test suite\n\n"
        "- Check: ran the full suite; everything passed.\n\n"
        + EVIDENCE_FABRICATED_TAIL,
        encoding="utf-8")
    # The gaming shapes H exists to stop: a lying roll-up RENAMED to dodge
    # the (now deleted) roll-up excuse, one throwaway evidenced leaf trying
    # to launder it, a relabelled verdict dodging the "Result:" token, a
    # scoped hedge posing as a NOT-RUN disclaimer, and an unrelated
    # appendix fence standing in for per-criterion evidence. Each fires in
    # its own section's scope.
    gamed = root / "docs" / "features" / "gamed"
    gamed.mkdir(parents=True)
    (gamed / "verification.md").write_text(
        "---\nstage: verify\n---\n# Verification\n\n"
        + EVIDENCE_HONEST_LEAF
        + "## Results\n\n- Result: all 6 criteria PASS\n\n"
        "### Budget guard holds\n\n- Verdict: PASS\n\n"
        "### Router picks the model\n\n- Result: PASS\n"
        "Note: not tested on Windows.\n\n"
        "### Retry path\n\n- Result: PASS\n"
        "- (the retry path itself was not run)\n\n"
        "## Appendix\n\n" + EVIDENCE_APPENDIX_FENCE,
        encoding="utf-8")
    # An unclosed fence must be reported, never silently absorb the tail.
    unclosed = root / "docs" / "features" / "unclosed"
    unclosed.mkdir(parents=True)
    (unclosed / "verification.md").write_text(
        "---\nstage: verify\n---\n# Verification\n\n"
        "### Report renders\n\n- Evidence:\n  ```\n  3 orders merged\n"
        "- Result: PASS\n", encoding="utf-8")


def _evidence_honesty_clean_fixture(root):
    """Three artifacts H must stay silent on: literal fenced evidence, an
    explicit NOT-RUN disclosure, and a narrative roll-up over evidenced
    criteria below it."""
    evidenced = root / "docs" / "features" / "evidenced"
    evidenced.mkdir(parents=True)
    (evidenced / "verification.md").write_text(
        "---\nstage: verify\n---\n# Verification\n\n"
        + EVIDENCE_SUITE_GREEN_OPEN + "  ```\n- Result: PASS\n",
        encoding="utf-8")
    disclosed = root / "docs" / "features" / "disclosed"
    disclosed.mkdir(parents=True)
    (disclosed / "verification.md").write_text(
        "---\nstage: verify\n---\n# Verification\n\n"
        "### Non-owner dispatch does not fire\n\n"
        "- Check: NOT RUN — needs a second GitHub account.\n"
        "- Result: NOT VERIFIED\n", encoding="utf-8")
    # A roll-up summary narrates the verdicts the criteria below evidence.
    # It is not itself a criterion, and H must not read it as one.
    rollup = root / "docs" / "features" / "rollup"
    rollup.mkdir(parents=True)
    (rollup / "verification.md").write_text(
        "---\nstage: verify\n---\n# Verification\n\n"
        "## Summary\n\n4/4 criteria pass; suite and lint green on the\n"
        "branch. Verdict: the feature demonstrably works.\n\n"
        "## Criteria & evidence\n\n### Suite is green\n\n- Evidence:\n"
        "  ```\n  Ran 222 tests\n\n  OK\n  ```\n- Result: PASS\n",
        encoding="utf-8")


def _needs_clarification_defect_fixture(root):
    """A PRD and an architecture doc each still carrying a live marker,
    beside a quoted one (a code span) that is a mention, not a marker."""
    run = root / "docs" / "features" / "demo"
    run.mkdir(parents=True, exist_ok=True)
    (run / "prd.md").write_text(
        "# PRD\n\nMark ambiguity as `[NEEDS CLARIFICATION: <question>]`.\n"
        "Users sign in via [NEEDS CLARIFICATION: auth method?].\n",
        encoding="utf-8")
    (run / "architecture.md").write_text(
        "# Architecture\n\nState lives in [NEEDS CLARIFICATION: which DB?]\n",
        encoding="utf-8")


def _prd_coverage_fixture(root, waive_actors):
    """A PRD dated on COVERAGE_ADOPTED whose §Solution a work-order row
    cites and whose §Actors none does — waived or not, per the caller."""
    run = root / "docs" / "features" / "demo"
    run.mkdir(parents=True, exist_ok=True)
    waiver = ("<!-- coverage-waiver: actors are context, not work -->\n\n"
              if waive_actors else "")
    (run / "prd.md").write_text(
        f"---\nstage: prd\nid: PRD-0001\ndate: {COVERAGE_ADOPTED}\n---\n"
        "# PRD\n\n## Solution\n\nBuild it.\n\n## Actors\n\n" + waiver
        + "- **Dev**\n", encoding="utf-8")
    (run / "breakdown.md").write_text(
        "- [ ] **WO-0001** build it (PRD-0001 §Solution)\n", encoding="utf-8")


def _clean_repo_fixture(root):
    """A fully stamped, fully honest repo: every detector's happy path at
    once, the shape run_all must stay silent across."""
    run = root / "docs" / "features" / "demo"
    run.mkdir(parents=True)
    (run / "prd.md").write_text(
        "---\nstage: prd\nid: PRD-0001\n---\n# PRD\n", encoding="utf-8")
    (run / "breakdown.md").write_text(
        "- [x] WO-0001 shipped slice (PRD-0001 §Solution), per"
        " [ADR-0001](../../adr/0001-spine.md)\n", encoding="utf-8")
    (root / "docs" / "adr").mkdir()
    (root / "docs" / "adr" / "0001-spine.md").write_text(
        "# Spine\n\n- Status: accepted (shipped 2026-07-06)\n",
        encoding="utf-8")
    (root / "docs" / "adr" / "README.md").write_text(
        "| ADR | Decision | Status |\n|-----|----------|--------|\n"
        "| [0001](0001-spine.md) | Spine | accepted |\n",
        encoding="utf-8")
    (root / "docs" / "factory").mkdir()
    (root / "docs" / "factory" / "costs.jsonl").write_text(
        json.dumps({"wo": "WO-0001", "run_id": "r1", "model": "m",
                    "tokens": 1200, "cost": 0.42, "outcome": "merged"})
        + "\n", encoding="utf-8")
    _evidence_honesty_clean_fixture(root)
    config = json.dumps(
        {"budgets_usd": {"S": 5, "M": 15, "L": 40},
         "routing": {"mechanical": "m", "implementation": "i",
                     "architecture_review": "a"},
         "wip_cap": 3, "monthly_cap_usd": 300})
    _scaffold_sync_fixture(root, rel="factory.json", payload=config)


def selftest():
    """Fixture trees: each detector must catch its planted defect and stay
    silent on the clean tree."""
    failures = []

    def expect(label, problems, *substrings):
        for fragment in substrings:
            if not any(fragment in p for p in problems):
                failures.append(f"{label}: expected a problem containing"
                                f" {fragment!r}, got {problems}")

    def expect_clean(label, problems):
        if problems:
            failures.append(f"{label}: expected no problems, got {problems}")

    # A: an isolated tree per detector, matching ordinary unittest
    # per-test-method style — a failure for one detector must not depend
    # on or corrupt state left behind by a previous one's fixture.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _wo_citation_defect_fixture(root)
        expect("A", check_wo_citation(root), "WO-0002")

    # C
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _link_integrity_defect_fixture(root)
        problems = check_link_integrity(root)
        expect("C", problems, "PRD-0099", "WO-0003")
        if any("PRD-0001 " in p and "dangling" in p for p in problems):
            failures.append(f"C: PRD-0001 should resolve, got {problems}")

    # D: the index disagrees with ADR-0002's file, and an artifact still
    # builds on ADR-0001, which ADR-0002 superseded.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _blueprint_drift_defect_fixture(root)
        expect("D", check_blueprint_drift(root),
               "ADR-0002 index status 'provisional'",
               "cites ADR-0001, superseded by ADR-0002")

    # G: the ledger accounts for an unmerged order and misses a merged
    # one, and one line is not JSON at all.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _cost_ledger_defect_fixture(root)
        expect("G", check_cost_ledger(root),
               "merged work order WO-0001 has no line", "is not valid JSON")

    # I: a doc links to a path that is not on disk.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _staleness_defect_fixture(root)
        expect("I", check_staleness(root), "stale link docs/handbook.md")

    # K: a committed ADR-derived entry has drifted from a fresh regen,
    # and an enforced entry cites a not-accepted ADR — both from one
    # committed docs/standards.json.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _standards_drift_defect_fixture(root)
        expect("K", check_standards_drift(root),
               "docs/standards.json has drifted",
               "enforced statement 'enforced-slug' cites ADR-0002,"
               " status 'provisional' (not accepted)")

    # K: the happy path — a regen-matching index, and no ADR standing.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _standards_drift_clean_fixture(root)
        expect_clean("K clean", check_standards_drift(root))

    # K: an absent docs/standards.json is silent — no runs recorded yet,
    # same precedent as detector G.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        expect_clean("K absent", check_standards_drift(root))

    # M: a fresh defect.md missing sections, and one placeholder-only.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _capture_completeness_defect_fixture(root)
        expect("M", check_capture_completeness(root),
               "missing required section 'Root-cause hypothesis'",
               "missing required section 'Blast radius'",
               "required section 'Defect (or Condition)' is present but"
               " placeholder-only",
               "required section 'Ruled out' is present but"
               " placeholder-only")
        if any("Reproduction / Evidence" in p
               for p in check_capture_completeness(root)):
            failures.append("M: Reproduction / Evidence should be clean,"
                            f" got {check_capture_completeness(root)}")

    # M: a defect.md dated before CAPTURE_ADOPTED is grandfathered —
    # missing every section, but M must stay silent (ADR-0073).
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _capture_completeness_grandfathered_fixture(root)
        expect_clean("M grandfathered", check_capture_completeness(root))

    # M: no defect.md at all is out of scope entirely.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "docs" / "features" / "demo").mkdir(parents=True)
        expect_clean("M no defect", check_capture_completeness(root))

    # E
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _scaffold_sync_fixture(root)
        expect_clean("E clean", check_scaffold_sync(root))
        factory = root / "factory" / "templates"
        (factory / "Makefile").write_text("check: tampered\n", encoding="utf-8")
        expect("E", check_scaffold_sync(root), "manifest checksum")

        # E's stamped half (issue #207): an unstamped tree is silent about
        # destinations, a stamped one compares its executable payload — and
        # only that. The Makefile above stays diverged throughout and is
        # never reported as a destination: it is the repo's to adjust.
        tool = factory / "tools" / "factory" / "gates.py"
        tool.parent.mkdir(parents=True)
        tool.write_text("# payload\n", encoding="utf-8")
        (factory / "Makefile").write_text("check:\n", encoding="utf-8")
        (root / "factory" / "manifest.json").write_text(json.dumps(
            {"files": manifest_files(root)}), encoding="utf-8")
        expect_clean("E unstamped", check_scaffold_sync(root))
        stamped = root / "tools" / "factory"
        stamped.mkdir(parents=True)
        (stamped / "gates.py").write_text("# payload\n", encoding="utf-8")
        expect_clean("E stamped clean", check_scaffold_sync(root))
        (stamped / "gates.py").write_text("# hand-edited\n", encoding="utf-8")
        expect("E stamped", check_scaffold_sync(root),
               "tools/factory/gates.py does not match", "hand-edited")
        (stamped / "gates.py").unlink()
        # the discriminator is gates.py itself, so removing it un-stamps the
        # tree — a second tool proves the missing-destination leg instead
        (factory / "tools" / "factory" / "cli.py").write_text(
            "# payload\n", encoding="utf-8")
        (stamped / "gates.py").write_text("# payload\n", encoding="utf-8")
        (root / "factory" / "manifest.json").write_text(json.dumps(
            {"files": manifest_files(root)}), encoding="utf-8")
        expect("E partial", check_scaffold_sync(root),
               "tools/factory/cli.py is in the payload but missing here",
               "partial stamp")

    # J: the taxonomy is the repo's to curate, so a pruned label must be
    # caught here — the alternative is finding out when CI flips it.
    # Silent with no taxonomy at all: nothing stamped to be wrong.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        expect_clean("J unstamped", check_label_wiring(root))
        named = _label_wiring_wired_fixture(root)
        expect_clean("J clean", check_label_wiring(root))
        labels = root / ".github" / "labels.json"
        labels.write_text(
            _label_taxonomy_json([n for n in named if n != "wo:merged"]),
            encoding="utf-8")
        expect("J", check_label_wiring(root), "Makefile:2 names wo:merged",
               "human_gates.py names wo:merged", "no such label")
        # A taxonomy nobody can read is the same finding one step
        # earlier, and it is the case with no wiring evidence to fall
        # back on — the loader's line is the only thing that gets said.
        labels.write_text("{ not json", encoding="utf-8")
        expect("J unreadable", check_label_wiring(root),
               ".github/labels.json is not valid JSON")
        labels.write_text(_label_taxonomy_json(named), encoding="utf-8")
        # the restore the later fixtures depend on, now asserted rather
        # than assumed
        expect_clean("J restored", check_label_wiring(root))

    # F
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _config_shape_defect_fixture(root)
        problems = check_config_shape(root)
        expect("F", problems, "budgets_usd", "routing", "wip_cap",
               "monthly_cap_usd", "effort.mechanical")

    # B
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        env = _pr_event_fixture(root, {"pull_request": {
            "title": "fix: something", "body": "no tokens here"}})
        expect("B", check_pr_traceability(root, env),
               "cites no work-order id", "no Closes #N link")
        expect("B unreadable", check_pr_traceability(
            root, {"GITHUB_EVENT_PATH": str(root / "missing.json")}),
            "cannot read GITHUB_EVENT_PATH")
        env = _pr_event_fixture(root, {"ref": "refs/heads/main"})
        expect_clean("B non-PR", check_pr_traceability(root, env))
        env = _pr_event_fixture(root, {"pull_request": {
            "title": "WO-0003: detector B",
            "body": "WO-0003 (PRD-0001) Fixes: #108"}})
        expect_clean("B clean", check_pr_traceability(root, env))

    # H: the planted-defect side.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _evidence_honesty_defect_fixture(root)
        expect("H", check_evidence_honesty(root),
               'criterion "Suite is green" asserts PASS with neither',
               "artifact shows neither literal evidence",
               'criterion "Results" asserts all 6 criteria PASS with neither',
               'criterion "Budget guard holds" asserts PASS with neither',
               'criterion "Router picks the model" asserts PASS with neither',
               'criterion "Retry path" asserts PASS with neither',
               "unclosed code fence")

    # H: the honest side — three shapes that must stay silent.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _evidence_honesty_clean_fixture(root)
        expect_clean("H honest", check_evidence_honesty(root))

    # N: a live marker in each gated artifact fires; the quoted one in a
    # code span (prd.md:3) does not.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _needs_clarification_defect_fixture(root)
        problems = check_needs_clarification(root)
        expect("N", problems, "demo/prd.md:4 unresolved",
               "demo/architecture.md:3 unresolved")
        if any("prd.md:3" in p for p in problems):
            failures.append(f"N: a quoted marker fired, got {problems}")

    # O: an uncited, unwaived PRD section fires; the same section with a
    # declared waiver passes.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _prd_coverage_fixture(root, waive_actors=False)
        expect("O", check_prd_coverage(root),
               "PRD-0001 §Actors is cited by no breakdown row")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _prd_coverage_fixture(root, waive_actors=True)
        expect_clean("O waived", check_prd_coverage(root))

    # Every detector's happy path at once — the integration smoke test
    # run_all must stay silent across, beyond any one detector's own
    # fixture.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _clean_repo_fixture(root)
        expect_clean("clean tree", run_all(root, env={}))

    for failure in failures:
        print(failure)
    print(f"selftest: {'FAIL' if failures else 'ok'}")
    return 1 if failures else 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    return report("gates", run_all(repo_root()))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
