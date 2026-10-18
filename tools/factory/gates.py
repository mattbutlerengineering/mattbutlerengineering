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
                     duplicate PRD ids fail, and so does a work order or
                     tracker issue two breakdown rows claim
  D BLUEPRINT-DRIFT — the approved blueprint (docs/adr) is self-consistent:
                     every ADR reads, declares a known status and is
                     indexed with
                     that status in docs/adr/README.md, and no artifact
                     outside docs/adr builds on a superseded decision
  E SCAFFOLD-SYNC  — factory/manifest.json checksums match the template
                     payload (no hand-edited mirrors), and in a stamped
                     repo the executable payload in use — tools/factory/
                     and .github/workflows/ — matches what it was stamped
                     from (no hand-edited stamped files); a tools-only
                     stamp has no mirror, and its manifest says so
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
                     fresh standards_index.build_index regen, and
                     every `enforced`-status entry's source ADR is
                     in force (ADR-0073, ADR-0089)
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
ROSTER below is the full roster, and what run_all dispatches from.

`--selftest` runs the checkers against fixture trees and exits nonzero
on a failing assertion; the fixtures and the selftest live in
gates_selftest.py, mirrored beside this module. Both run in CI (validator.yml, via `make check`)
on every push/PR.

The knowledge plane's shared grammar (typed-ID tokens, run_dirs,
repo_root) lives in knowledge_plane.py, and the cost ledger's shape in
cost_ledger.py (ADR-0037) — this module keeps only the detectors.
"""
import ast
import hashlib
import importlib
import json
import os
import re
import sys
from collections import namedtuple
from pathlib import Path

import cost_ledger
import factory_config
import standards_index
from cli import read_event, read_file, report
from cost_ledger import COST_LEDGER
from knowledge_plane import (ADR_TOKEN, CLOSES_TOKEN, PRD_TOKEN, WO_TOKEN,
                             adr_record, breakdown_rows, fenced,
                             local_link_targets, parse_run, repo_root,
                             resolve_link, run_dirs, status_head, unfenced,
                             work_orders)
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

# An index row: | [0032](0032-slug.md) | Decision | status |
# The first cell's link target is knowledge_plane's to read (issue #773:
# a hand-rolled `[^)]+` took a link title into the filename).
ADR_INDEX_ROW = re.compile(
    r"^\|\s*(?P<cell>\[(?P<num>\d{4})\]\([^|]*\))\s*\|[^|]*\|"
    r"\s*(?P<status>[^|]*?)\s*\|")

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
        for row in breakdown_rows(entry["breakdown"]):
            if row["wo"] and not row["prd_ids"]:
                problems.append(
                    f"A: {rel}:{row['lineno']} work-order row {row['wo']}"
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
    """Set of work orders a breakdown.md row carries (knowledge_plane's
    row record, issue #737). Pure over `parsed`."""
    return {row["wo"] for entry in parsed["runs"]
            if entry["breakdown"] is not None
            for row in breakdown_rows(entry["breakdown"]) if row["wo"]}


def check_link_integrity(root, parsed=None):
    """C: typed cross-link tokens must resolve; duplicate PRD ids fail,
    and so does a duplicated work order or tracker — in
    knowledge_plane.work_orders' own words, the one duplicate rule the
    dispatcher refuses on (issue #886).

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
    _, duplicates = work_orders(root, [
        (entry["path"] / "breakdown.md", entry["breakdown"])
        for entry in parsed["runs"] if entry["breakdown"] is not None])
    problems.extend(f"C: {duplicate}" for duplicate in duplicates)
    adr_numbers = {adr_record(path, lines)["number"]
                   for path, lines in parsed["adr_files"]}
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
        lines = entry["architecture"]
        for lineno, line, fence in fenced(lines):
            if fence is None:
                problems.extend(_prose_claims(root, rel, lineno, line))
            elif line is not None and ARCH_CLAIMS_FENCE.match(
                    lines[fence.lineno - 1]):
                problems.extend(_declared_claims(root, rel, lineno, line))
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
    outside the ADR file set (knowledge_plane.adr_paths); only a live
    `.is_file()` answers both cases the same way the pre-migration code
    did, and the "problem strings byte-identical" constraint rules out
    guessing from parsed["adr_files"] membership instead."""
    if parsed is None:
        parsed = parse_run(root, scannable=_scannable_files(root))
    problems = _architecture_drift(root, parsed)
    # An ADR is also a scanned doc, so one undecodable ADR is the same
    # string in both lists; dict.fromkeys reports it once (issue #877).
    problems += [f"D: {problem}" for problem in dict.fromkeys(
        parsed["adr_problems"] + parsed["artifact_problems"]
        + parsed["scannable_problems"])]
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
        record = adr_record(path, lines)
        number, text = record["number"], record["status"]
        statuses[number] = None
        if text is None:
            problems.append(f"D: {rel} declares no Status line")
            continue
        if record["head"] is None:
            problems.append(
                f"D: {rel}:{record['lineno']} unknown ADR status {text!r}")
            continue
        statuses[number] = text
        if record["superseded_by"]:
            retired[number] = record["superseded_by"]

    readme_lines = parsed["adr_readme"]
    # An index parse_run could not read is already a "cannot read"
    # problem above (ADR-0094), not a missing one: only a live check
    # tells the two apart.
    if (statuses and readme_lines is None
            and not (adr_dir / "README.md").is_file()):
        problems.append("D: docs/adr/README.md is missing"
                        " (ADR files present, no blueprint index)")
    elif readme_lines is not None:
        rows = {}
        for lineno, line in enumerate(readme_lines, 1):
            match = ADR_INDEX_ROW.match(line)
            if not match:
                continue
            number = match.group("num")
            rows[number] = (lineno, match.group("status"))
            filename = next(iter(local_link_targets(match.group("cell"))), "")
            named = resolve_link(root, adr_dir / "README.md", filename)
            if named is None or not named.is_file():
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
            if status_head(indexed) != status_head(text):
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
    carrying the trailing (pre-ledger) annotation — the row record's
    `pre_ledger` field — are excluded: they merged before the ledger
    existed and G owes them no ledger line (ADR-0043). Pure over `parsed`;
    `root` only relativizes the paths returned."""
    rows = []
    for entry in parsed["runs"]:
        if entry["breakdown"] is None:
            continue
        rel = (entry["path"] / "breakdown.md").relative_to(root)
        rows += [(rel, row["lineno"], row["wo"])
                 for row in breakdown_rows(entry["breakdown"])
                 if row["done"] and row["wo"] and not row["pre_ledger"]]
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
            for target in local_link_targets(line):
                resolved = resolve_link(root, path, target)
                if resolved is not None and not resolved.exists():
                    problems.append(
                        f"I: {rel}:{lineno} stale link"
                        f" {target.split('#', 1)[0]} (no such path)")
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

# A tools-only stamp's manifest (#941) carries INSTALL_KEY: TOOLS_ONLY.
# factory_init writes it when the stamp lands tools/factory/ and
# factory.json alone — no mirror, no workflows, no Makefile, no seeds —
# and E reads it: there is no factory/templates/ to compare by design, so
# the mirror half stands down and the stamped half is the whole gate. A
# manifest without the marker is a full stamp's, checked as always.
INSTALL_KEY = "install"
TOOLS_ONLY = "tools-only"


def install_destination(rel):
    """Where a manifest key installs in a stamped repo, or None if it is not
    a plain path under templates/.

    A dual-home artifact's payload key installs at its installed home, read
    from factory_config.ARTIFACT_HOMES — the table factory_init.INSTALL_MAP
    derives from (ADR-0048), so the two cannot disagree on a mapped key
    (#748). The strip rule below mirrors factory_init.install_path's, pinned
    to it in lockstep by tests/test_factory_init.py: ADR-0048 keeps that rule
    with the stamp, and factory_init.py is NOT in the payload, so a stamped
    repo's gates.py cannot import it.
    """
    for installed, payload in factory_config.ARTIFACT_HOMES.values():
        if rel == payload:
            return installed
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


def mirror_problems(root, expected):
    """E's first half: the template payload under factory/templates/
    must match its checksum manifest exactly, file for file."""
    problems = []
    actual = manifest_files(root)
    for rel, digest in sorted(expected.items()):
        if rel not in actual:
            problems.append(f"E: manifest lists missing file factory/{rel}")
        elif actual[rel] != digest:
            problems.append(
                f"E: factory/{rel} does not match its manifest checksum"
                " (re-run manifest update, never hand-edit)")
    return problems + [f"E: factory/{rel} is not in the manifest"
                       for rel in sorted(actual) if rel not in expected]


def check_scaffold_sync(root):
    """E: the template payload must match its checksum manifest exactly, and
    a stamped repo's executable payload must match what it was stamped
    from. A tools-only stamp (INSTALL_KEY) has no payload mirror by
    design, so only the second half runs there."""
    manifest, problem = read_file(root / "factory" / "manifest.json",
                                  "factory/manifest.json", dict)
    if problem:
        return [f"E: {problem}"]
    if manifest is None:
        return ["E: missing factory/manifest.json"]
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        return ["E: factory/manifest.json has no files map"]
    mirror = ([] if manifest.get(INSTALL_KEY) == TOOLS_ONLY
              else mirror_problems(root, files))
    return mirror + stamped_destination_problems(root, files)


# Where the factory's label literals are declared: every module beside
# gates.py that assigns LABELS at module scope declares the labels it
# names there (issue #856). J discovers the declarers rather than keeping
# a list of them, so a tool that ships a label is covered by declaring
# it — a hand-kept list had already fallen three modules behind. The
# source is parsed only to FIND a declarer; the labels are read off the
# imported module, never the source text — a regex over source stops
# matching the moment a literal is reformatted, and stops SILENTLY,
# which is the exact failure a detector exists to prevent.
#
# sweeps.py declares no LABELS on purpose: it is factory-repo-only (never
# stamped) and its TRIAGE labels are bootstrap-created by ensure_labels
# before any sweep runs, so they are wired by construction rather than
# by taxonomy.
LABELS_NAME = "LABELS"


def label_declarers():
    """Sorted names of the modules beside gates.py that assign LABELS at
    module scope. Beside gates.py is the factory repo's root and a
    stamped repo's tools/factory/, so a declarer J finds is a module
    that ships with it — by construction, not by a list."""
    names = []
    for path in sorted(Path(__file__).resolve().parent.glob("*.py")):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, SyntaxError):
            continue  # an unparseable sibling fails its own import first
        if any(isinstance(target, ast.Name) and target.id == LABELS_NAME
               for node in tree.body if isinstance(node, ast.Assign)
               for target in node.targets):
            names.append(path.stem)
    return names


# A stamped Makefile from before the lifecycle verbs (#859) hands
# validator.py the label to flip, so its target line IS the declaration.
# factory-init update never refreshes a stamped Makefile, so this stays
# until no stamp carries the `lifecycle --label` alias.
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
    for name in label_declarers():
        try:
            module = importlib.import_module(name)
        except ImportError:
            continue
        for label in getattr(module, LABELS_NAME):
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
    gate labels, validator's lifecycle verbs each flip one, and a
    pre-verb Makefile lifecycle target hands validator.py one — and
    validator refuses a label the taxonomy does not carry
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
    # (Forwarding the strings is not giving detector L a checker row in ROSTER —
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
        marks a line read while a fence (knowledge_plane.fenced) is still
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
    underlined = False
    for lineno, line, fence in fenced(lines[body_start:], body_start + 1):
        if line is None:
            yield "unclosed", lineno, None
            continue
        if fence is not None:
            yield "line", lineno, (line, True)
            continue
        if underlined:  # the ===/--- under a Setext title, already consumed
            underlined = False
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
                     for row in breakdown_rows(entry["breakdown"])
                     if row["wo"] and prd_id in row["prd_ids"]
                     for cited in SECTION_CITATION.findall(row["text"])]
        rel = (entry["path"] / "prd.md").relative_to(root)
        for lineno, title, waived in _prd_sections(entry["prd"]):
            if not waived and not _cites(citations, title):
                problems.append(
                    f"O: {rel}:{lineno} {prd_id} §{title} is cited by no"
                    " breakdown row and carries no coverage waiver")
    return problems


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


# The knowledge_plane.standing values whose ADR can source an enforced
# standard (ADR-0089): accepted or amended, or superseded only in part.
# Provisional, retired and unrecognized never can.
ENFORCEABLE_STANDINGS = ("active", "partial")


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
        disagree with a fresh standards_index.build_index regen over
        parsed["adr_files"],
        compared on every field EXCEPT `status` (see _DRIFT_FIELDS —
        `status` can never "drift" from an ADR regen by definition, since
        an ADR bullet never states one).
    (2) an `enforced`-status entry's source ADR is not in force: its
        knowledge_plane.adr_record standing (the same reading detector D
        and adr_status use, not a second status parser) is not one of
        ENFORCEABLE_STANDINGS — accepted, amended, or superseded only in
        part (ADR-0089).

    An absent docs/standards.json is not a K problem — mirrors detector
    G's "an absent ledger is silent" precedent (check_cost_ledger): the
    index is created by the first `standards_index.py update` run, so a
    repo that has never run it has nothing to account for yet.

    `parsed` defaults to a fresh parse of `root`, same lazy-default
    convention as A, C, D, G, H and I; run_all threads the shared parse
    in (K's ROSTER row declares a parsed input) so this never re-parses on that path."""
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
    fresh, build_problems = standards_index.build_index(
        root, parsed["adr_files"])
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

    records = {record["number"]: record for record in
               (adr_record(path, lines)
                for path, lines in parsed["adr_files"])}
    for entry in committed:
        if not isinstance(entry, dict) or entry.get("status") != "enforced":
            continue
        number = standards_index.adr_number(entry.get("source"))
        if number is None:
            continue
        record = records.get(number, {})
        status = record.get("status")
        if record.get("standing") not in ENFORCEABLE_STANDINGS:
            problems.append(
                f"K: enforced statement {entry.get('slug')!r} cites"
                f" ADR-{number}, status {status!r} (not in force)")
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


# The detector roster, in ONE table (#738): one row per letter, declaring
# its name, home module, plane, checker and input. A letter's plane
# decides where its code goes. Offline detectors live in this module and
# gate every push/PR through run_all — hermetic and deterministic, no
# network (B reads a local event file, so it is offline too; it just
# SKIPs outside a PR run). Network detectors read live services, so they
# live beside the scheduled sweeps that drive them and carry no checker
# here: L reads the repo's live label set through gh, which is why it
# lives in label_sync.py and not here (the same posture that keeps every
# ADR-0037 seam offline). K and M are claimed (ADR-0073), and N and O
# (ADR-0071, ADR-0072) skipped them while that work was in flight. A new
# detector takes the next free letter (P) and adds its row here — the
# one edit run_all and tests/test_gates.py's TestRoster both read.
#
# `input` is what run_all hands the checker after `root`:
#   root             — nothing more: E, F, J and M each read their own
#                      seam (factory_config.py, the manifest, the label
#                      taxonomy, the capture briefs) exactly once
#   env              — the process environment: B reads the CI event
#   parsed           — the one knowledge_plane.parse_run of this pass
#   parsed+scannable — the same parse, which then must carry the
#                      _scannable_files docs: C, D and I scan them, and
#                      find nothing in a parse made without them
# Row order is run_all's report order.
Detector = namedtuple("Detector", "letter name home plane fn input")
INPUTS = ("root", "env", "parsed", "parsed+scannable")

ROSTER = (
    Detector("A", "WO-CITATION", "gates.py", "offline",
             check_wo_citation, "parsed"),
    Detector("B", "PR-TRACEABILITY", "gates.py", "offline",
             check_pr_traceability, "env"),
    Detector("C", "LINK-INTEGRITY", "gates.py", "offline",
             check_link_integrity, "parsed+scannable"),
    Detector("D", "BLUEPRINT-DRIFT", "gates.py", "offline",
             check_blueprint_drift, "parsed+scannable"),
    Detector("E", "SCAFFOLD-SYNC", "gates.py", "offline",
             check_scaffold_sync, "root"),
    Detector("J", "LABEL-WIRING", "gates.py", "offline",
             check_label_wiring, "root"),
    Detector("F", "CONFIG-SHAPE", "gates.py", "offline",
             check_config_shape, "root"),
    Detector("G", "COST-LEDGER", "gates.py", "offline",
             check_cost_ledger, "parsed"),
    Detector("H", "EVIDENCE-HONESTY", "gates.py", "offline",
             check_evidence_honesty, "parsed"),
    Detector("I", "STALENESS", "gates.py", "offline",
             check_staleness, "parsed+scannable"),
    Detector("K", "STANDARDS-DRIFT", "gates.py", "offline",
             check_standards_drift, "parsed"),
    Detector("L", "LABEL-SYNC", "label_sync.py", "network", None, None),
    Detector("M", "CAPTURE-COMPLETENESS", "gates.py", "offline",
             check_capture_completeness, "root"),
    Detector("N", "NEEDS-CLARIFICATION", "gates.py", "offline",
             check_needs_clarification, "parsed"),
    Detector("O", "PRD-COVERAGE", "gates.py", "offline",
             check_prd_coverage, "parsed"),
)

# Issue #443 (the sequence's "contract" step) asked whether dropping the
# migrate-era shim means making `parsed` a required argument on the
# checkers whose row declares a parsed input. It does not, and this is
# that judgment call, made and kept in one place rather than once per
# checker.
#
# The thing #443 actually asks to be gone — a detector, reached through
# `run_all`, re-walking the filesystem another detector (or itself) has
# already walked this pass — IS gone, and was already gone as of #442:
# `run_all` below builds `parsed` exactly once and threads it to every
# row declaring a parsed input, so none of them ever takes its own
# `if parsed is None` branch on that path (pinned by
# TestRunAll.test_run_all_parses_the_knowledge_plane_exactly_once in
# tests/test_gates.py, which counts parse_run's calls directly rather
# than trusting the code doesn't regress).
#
# What stays is each function's OWN fallback, for a caller that invokes
# it directly rather than through run_all — and this repo leans on that
# in ~50 places (tests/test_gates.py, tests/test_budget_guard.py, and
# seven calls in gates_selftest.selftest()), several of which need a
# real tree no hand-built `parsed` dict substitutes for: D's tree-claims
# happy path, G's ledger seam, I's live link-target check, and H's
# TestLockstep read of this repo's OWN verification.md. Requiring
# `parsed` would not remove one filesystem read from the path that gates
# every push/PR — only push `parse_run(root, ...)` boilerplate onto every
# one of those standalone callers, for a test-count-sized diff with no
# behavior change. `check_pr_traceability`'s own `env=None` sibling
# default has stood since ADR-0033 without ever being treated as debt to
# strip; the `parsed=None` fallback is the same convention, not the shim.


def run_all(root, env=None):
    """Run every detector ROSTER wires, handing each the input its row
    declares. `env` (default os.environ) goes to the rows that read the
    process environment, so callers can stay hermetic without mutating
    global state. The knowledge plane is parsed ONCE — with
    _scannable_files' own selection when any row declares
    parsed+scannable — and threaded to every parsed row, rather than each
    one re-parsing it (issue #442; #443 confirmed nothing more was left
    to remove, see the comment above)."""
    if env is None:
        env = os.environ
    wired = [row for row in ROSTER if row.fn is not None]
    scan = any(row.input == "parsed+scannable" for row in wired)
    parsed = parse_run(root, scannable=_scannable_files(root) if scan else ())
    extra = {"root": (), "env": (env,), "parsed": (parsed,),
             "parsed+scannable": (parsed,)}
    problems = []
    for row in wired:
        problems.extend(row.fn(root, *extra[row.input]))
    return problems


def main(argv):
    if "--selftest" in argv:
        # The planted-defect fixtures and selftest() live in their own
        # mirrored module (#784); imported here, not at the top, because
        # it imports this one.
        import gates_selftest
        return gates_selftest.selftest()
    return report("gates", run_all(repo_root()))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
