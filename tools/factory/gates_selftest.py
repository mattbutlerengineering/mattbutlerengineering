#!/usr/bin/env python3
"""Planted-defect fixtures and the gates selftest (#784).

`python3 gates.py --selftest` delegates here: selftest() builds one
isolated fixture tree per detector scenario, runs the detector against
it, and exits nonzero when a detector misses its planted defect or fires
on a clean tree. tests/test_gates.py and tests/test_knowledge_plane.py
build their detector trees through the same builders, so a fixture is
written once whichever caller needs it (issue #440).

Mirrored into the payload beside gates.py, so a stamped repo's
`make check` runs the same selftest. Every detector is reached as
`gates.<name>` at call time, never bound at import, so a test that
patches a detector in gates blinds this selftest too.
"""
import hashlib
import json
import tempfile
from pathlib import Path

import gates
import standards_index


# ---- planted-defect fixtures ----------------------------------------
#
# One builder per detector (or per detector's own sub-scenarios), each
# writing an isolated tree from nothing (issue #440). A builder writes files and returns nothing unless a
# caller needs something back (a path, a computed label set).

def wo_citation_defect_fixture(root):
    """A breakdown row that cites its PRD section, beside one that does
    not."""
    breakdown = root / "docs" / "features" / "demo" / "breakdown.md"
    breakdown.parent.mkdir(parents=True, exist_ok=True)
    breakdown.write_text(
        "- [x] WO-0001 do the thing (PRD-0001 §Solution)\n"
        "- [ ] WO-0002 uncited row\n", encoding="utf-8")


def link_integrity_base_fixture(root):
    """A PRD declaring PRD-0001 and an ADR file declaring ADR-0001 — the
    minimal resolvable pair C's dangling-token checks run against."""
    run = root / "docs" / "features" / "demo"
    run.mkdir(parents=True, exist_ok=True)
    (run / "prd.md").write_text(
        "---\nstage: prd\nid: PRD-0001\n---\n# PRD\n", encoding="utf-8")
    adr_dir = root / "docs" / "adr"
    adr_dir.mkdir(parents=True, exist_ok=True)
    (adr_dir / "0001-real.md").write_text("# Real\n", encoding="utf-8")


def link_integrity_defect_fixture(root):
    """PRD-0001 and ADR-0001 resolve; PRD-0099 and WO-0003 dangle."""
    link_integrity_base_fixture(root)
    (root / "CONTEXT.md").write_text(
        "See PRD-0001, PRD-0099, ADR-0001 and WO-0003.\n", encoding="utf-8")


def blueprint_drift_defect_fixture(root):
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


def cost_ledger_defect_fixture(root):
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


def staleness_defect_fixture(root):
    """A doc that links to a path which is not on disk."""
    (root / "CONTEXT.md").write_text(
        "The [handbook](docs/handbook.md) moved away.\n", encoding="utf-8")


def standards_drift_defect_fixture(root):
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


def standards_drift_clean_fixture(root):
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


def capture_completeness_defect_fixture(root):
    """A fresh (dated on CAPTURE_ADOPTED, so not grandfathered) defect.md:
    two required sections missing outright, two present as unfilled
    TEMPLATE.md placeholders, and one filled in for real — every shape M
    must tell apart, in one fixture."""
    path = root / "docs" / "fixes" / "demo" / "defect.md"
    path.parent.mkdir(parents=True)
    path.write_text(
        "---\nstage: capture\nrun: maintenance:demo\n"
        f"date: {gates.CAPTURE_ADOPTED}\nre-entry: implement\n---\n\n"
        "# Defect: demo\n\n"
        "## Defect (or Condition)\n\n<What is broken — observed vs"
        " expected behavior.>\n\n"
        "## Reproduction / Evidence\n\nRun `make check`; it fails with"
        " a traceback.\n\n"
        "## Ruled out\n\n- <Dead ends already investigated and why"
        " they're not it — or \"none yet\".>\n",
        encoding="utf-8")


def capture_completeness_grandfathered_fixture(root):
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


def scaffold_sync_fixture(root, rel="Makefile", payload="check:\n"):
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


# The correctly curated state's Makefile: one lifecycle target in the
# pre-verb `lifecycle --label` grammar (#859) — the form a stamped
# Makefile keeps, since update never refreshes it — naming the one label
# the fixtures below prune and restore.
LABEL_WIRING_MAKEFILE = (
    "wo-merged:\n\tpython3 validator.py lifecycle --label wo:merged\n")


def label_taxonomy_json(names):
    return json.dumps([{"name": name, "color": "ededed",
                        "description": name} for name in names])


def label_wiring_wired_fixture(root, makefile=None):
    """Write the correctly curated state — a Makefile plus a taxonomy
    carrying every label the shipped tools and that Makefile name — and
    return the sorted label list, so a caller can derive a pruned
    variant. Derived from declared_labels rather than hand-listed, so
    this fixture cannot drift out of step with the tools it wires."""
    (root / "Makefile").write_text(
        LABEL_WIRING_MAKEFILE if makefile is None else makefile,
        encoding="utf-8")
    named = sorted(gates.declared_labels(root))
    labels = root / ".github" / "labels.json"
    labels.parent.mkdir(parents=True, exist_ok=True)
    labels.write_text(label_taxonomy_json(named), encoding="utf-8")
    return named


def config_shape_defect_fixture(root):
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


def pr_event_fixture(root, payload):
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


def evidence_honesty_defect_fixture(root):
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


def evidence_honesty_clean_fixture(root):
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


def needs_clarification_defect_fixture(root):
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


def prd_coverage_fixture(root, waive_actors):
    """A PRD dated on COVERAGE_ADOPTED whose §Solution a work-order row
    cites and whose §Actors none does — waived or not, per the caller."""
    run = root / "docs" / "features" / "demo"
    run.mkdir(parents=True, exist_ok=True)
    waiver = ("<!-- coverage-waiver: actors are context, not work -->\n\n"
              if waive_actors else "")
    (run / "prd.md").write_text(
        f"---\nstage: prd\nid: PRD-0001\ndate: {gates.COVERAGE_ADOPTED}\n---\n"
        "# PRD\n\n## Solution\n\nBuild it.\n\n## Actors\n\n" + waiver
        + "- **Dev**\n", encoding="utf-8")
    (run / "breakdown.md").write_text(
        "- [ ] **WO-0001** build it (PRD-0001 §Solution)\n", encoding="utf-8")


def clean_repo_fixture(root):
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
    evidence_honesty_clean_fixture(root)
    config = json.dumps(
        {"budgets_usd": {"S": 5, "M": 15, "L": 40},
         "routing": {"mechanical": "m", "implementation": "i",
                     "architecture_review": "a"},
         "wip_cap": 3, "monthly_cap_usd": 300})
    scaffold_sync_fixture(root, rel="factory.json", payload=config)


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
        wo_citation_defect_fixture(root)
        expect("A", gates.check_wo_citation(root), "WO-0002")

    # C
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        link_integrity_defect_fixture(root)
        problems = gates.check_link_integrity(root)
        expect("C", problems, "PRD-0099", "WO-0003")
        if any("PRD-0001 " in p and "dangling" in p for p in problems):
            failures.append(f"C: PRD-0001 should resolve, got {problems}")

    # D: the index disagrees with ADR-0002's file, and an artifact still
    # builds on ADR-0001, which ADR-0002 superseded.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        blueprint_drift_defect_fixture(root)
        expect("D", gates.check_blueprint_drift(root),
               "ADR-0002 index status 'provisional'",
               "cites ADR-0001, superseded by ADR-0002")

    # G: the ledger accounts for an unmerged order and misses a merged
    # one, and one line is not JSON at all.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        cost_ledger_defect_fixture(root)
        expect("G", gates.check_cost_ledger(root),
               "merged work order WO-0001 has no line", "is not valid JSON")

    # I: a doc links to a path that is not on disk.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        staleness_defect_fixture(root)
        expect("I", gates.check_staleness(root), "stale link docs/handbook.md")

    # K: a committed ADR-derived entry has drifted from a fresh regen,
    # and an enforced entry cites a not-accepted ADR — both from one
    # committed docs/standards.json.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        standards_drift_defect_fixture(root)
        expect("K", gates.check_standards_drift(root),
               "docs/standards.json has drifted",
               "enforced statement 'enforced-slug' cites ADR-0002,"
               " status 'provisional' (not in force)")

    # K: the happy path — a regen-matching index, and no ADR standing.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        standards_drift_clean_fixture(root)
        expect_clean("K clean", gates.check_standards_drift(root))

    # K: an absent docs/standards.json is silent — no runs recorded yet,
    # same precedent as detector G.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        expect_clean("K absent", gates.check_standards_drift(root))

    # M: a fresh defect.md missing sections, and one placeholder-only.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        capture_completeness_defect_fixture(root)
        expect("M", gates.check_capture_completeness(root),
               "missing required section 'Root-cause hypothesis'",
               "missing required section 'Blast radius'",
               "required section 'Defect (or Condition)' is present but"
               " placeholder-only",
               "required section 'Ruled out' is present but"
               " placeholder-only")
        if any("Reproduction / Evidence" in p
               for p in gates.check_capture_completeness(root)):
            failures.append("M: Reproduction / Evidence should be clean,"
                            f" got {gates.check_capture_completeness(root)}")

    # M: a defect.md dated before CAPTURE_ADOPTED is grandfathered —
    # missing every section, but M must stay silent (ADR-0073).
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        capture_completeness_grandfathered_fixture(root)
        expect_clean("M grandfathered", gates.check_capture_completeness(root))

    # M: no defect.md at all is out of scope entirely.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "docs" / "features" / "demo").mkdir(parents=True)
        expect_clean("M no defect", gates.check_capture_completeness(root))

    # E
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        scaffold_sync_fixture(root)
        expect_clean("E clean", gates.check_scaffold_sync(root))
        factory = root / "factory" / "templates"
        (factory / "Makefile").write_text("check: tampered\n", encoding="utf-8")
        expect("E", gates.check_scaffold_sync(root), "manifest checksum")

        # E's stamped half (issue #207): an unstamped tree is silent about
        # destinations, a stamped one compares its executable payload — and
        # only that. The Makefile above stays diverged throughout and is
        # never reported as a destination: it is the repo's to adjust.
        tool = factory / "tools" / "factory" / "gates.py"
        tool.parent.mkdir(parents=True)
        tool.write_text("# payload\n", encoding="utf-8")
        (factory / "Makefile").write_text("check:\n", encoding="utf-8")
        (root / "factory" / "manifest.json").write_text(json.dumps(
            {"files": gates.manifest_files(root)}), encoding="utf-8")
        expect_clean("E unstamped", gates.check_scaffold_sync(root))
        stamped = root / "tools" / "factory"
        stamped.mkdir(parents=True)
        (stamped / "gates.py").write_text("# payload\n", encoding="utf-8")
        expect_clean("E stamped clean", gates.check_scaffold_sync(root))
        (stamped / "gates.py").write_text("# hand-edited\n", encoding="utf-8")
        expect("E stamped", gates.check_scaffold_sync(root),
               "tools/factory/gates.py does not match", "hand-edited")
        (stamped / "gates.py").unlink()
        # the discriminator is gates.py itself, so removing it un-stamps the
        # tree — a second tool proves the missing-destination leg instead
        (factory / "tools" / "factory" / "cli.py").write_text(
            "# payload\n", encoding="utf-8")
        (stamped / "gates.py").write_text("# payload\n", encoding="utf-8")
        (root / "factory" / "manifest.json").write_text(json.dumps(
            {"files": gates.manifest_files(root)}), encoding="utf-8")
        expect("E partial", gates.check_scaffold_sync(root),
               "tools/factory/cli.py is in the payload but missing here",
               "partial stamp")

    # J: the taxonomy is the repo's to curate, so a pruned label must be
    # caught here — the alternative is finding out when CI flips it.
    # Silent with no taxonomy at all: nothing stamped to be wrong.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        expect_clean("J unstamped", gates.check_label_wiring(root))
        named = label_wiring_wired_fixture(root)
        expect_clean("J clean", gates.check_label_wiring(root))
        labels = root / ".github" / "labels.json"
        labels.write_text(
            label_taxonomy_json([n for n in named if n != "wo:merged"]),
            encoding="utf-8")
        expect("J", gates.check_label_wiring(root), "Makefile:2 names wo:merged",
               "human_gates.py names wo:merged", "no such label")
        # A taxonomy nobody can read is the same finding one step
        # earlier, and it is the case with no wiring evidence to fall
        # back on — the loader's line is the only thing that gets said.
        labels.write_text("{ not json", encoding="utf-8")
        expect("J unreadable", gates.check_label_wiring(root),
               ".github/labels.json is not valid JSON")
        labels.write_text(label_taxonomy_json(named), encoding="utf-8")
        # the restore the later fixtures depend on, now asserted rather
        # than assumed
        expect_clean("J restored", gates.check_label_wiring(root))

    # F
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        config_shape_defect_fixture(root)
        problems = gates.check_config_shape(root)
        expect("F", problems, "budgets_usd", "routing", "wip_cap",
               "monthly_cap_usd", "effort.mechanical")

    # B
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        env = pr_event_fixture(root, {"pull_request": {
            "title": "fix: something", "body": "no tokens here"}})
        expect("B", gates.check_pr_traceability(root, env),
               "cites no work-order id", "no Closes #N link")
        expect("B unreadable", gates.check_pr_traceability(
            root, {"GITHUB_EVENT_PATH": str(root / "missing.json")}),
            "cannot read GITHUB_EVENT_PATH")
        env = pr_event_fixture(root, {"ref": "refs/heads/main"})
        expect_clean("B non-PR", gates.check_pr_traceability(root, env))
        env = pr_event_fixture(root, {"pull_request": {
            "title": "WO-0003: detector B",
            "body": "WO-0003 (PRD-0001) Fixes: #108"}})
        expect_clean("B clean", gates.check_pr_traceability(root, env))

    # H: the planted-defect side.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        evidence_honesty_defect_fixture(root)
        expect("H", gates.check_evidence_honesty(root),
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
        evidence_honesty_clean_fixture(root)
        expect_clean("H honest", gates.check_evidence_honesty(root))

    # N: a live marker in each gated artifact fires; the quoted one in a
    # code span (prd.md:3) does not.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        needs_clarification_defect_fixture(root)
        problems = gates.check_needs_clarification(root)
        expect("N", problems, "demo/prd.md:4 unresolved",
               "demo/architecture.md:3 unresolved")
        if any("prd.md:3" in p for p in problems):
            failures.append(f"N: a quoted marker fired, got {problems}")

    # O: an uncited, unwaived PRD section fires; the same section with a
    # declared waiver passes.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        prd_coverage_fixture(root, waive_actors=False)
        expect("O", gates.check_prd_coverage(root),
               "PRD-0001 §Actors is cited by no breakdown row")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        prd_coverage_fixture(root, waive_actors=True)
        expect_clean("O waived", gates.check_prd_coverage(root))

    # Every detector's happy path at once — the integration smoke test
    # run_all must stay silent across, beyond any one detector's own
    # fixture.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        clean_repo_fixture(root)
        expect_clean("clean tree", gates.run_all(root, env={}))

    for failure in failures:
        print(failure)
    print(f"selftest: {'FAIL' if failures else 'ok'}")
    return 1 if failures else 0
