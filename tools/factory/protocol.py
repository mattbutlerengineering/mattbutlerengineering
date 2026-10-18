"""The pipeline protocol's executable knowledge, in one place.

docs/pipeline-protocol.md is the spec; this module is its one
implementation. It owns the stage/skill taxonomy, the artifact tables
(product/feature and maintenance, ADR-0025), artifact-frontmatter
reading, the skill-file contract (path shape and frontmatter rules,
ADR-0052), the UX conditional, the re-entry conditional, the Ship
outcome (ADR-0101), the checkbox rule, the Operate population
(ADR-0102), the retro short-circuit, and
next-stage derivation (ADR-0021).
Tools — the structural lint, the trigger-eval runner — are thin
callers.
"""
import re
from pathlib import Path

STAGES = ["idea", "prd", "ux-design", "architect", "decompose",
          "implement", "verify", "review", "ship", "operate"]
# Maintenance runs enter at a capture step (ADR-0025). Capture is a
# stage skill — it owns defect.md and the router routes to it — but it
# sits outside the product/feature spine, so it is listed separately.
MAINTENANCE_STAGES = ["capture"]
# implement's artifact is code itself; every other stage ships a template
TEMPLATED_STAGES = [s for s in STAGES + MAINTENANCE_STAGES
                    if s != "implement"]
# Utility skills act on work surrounding the pipeline (ADR-0023); they
# have no stage artifact and the router never routes to them, but they are
# full skills for install, lint, ledger, and trigger-eval purposes.
UTILITY_SKILLS = ["address-pr-review", "animated-diagram",
                  "architecture-diagram", "audit", "automate", "autorun",
                  "conduct", "deepen", "doctor", "factory-init",
                  "implement-queue",
                  "interactive-architecture-diagram", "knowledge-base",
                  "launch-demo", "lean", "mermaid", "pipeline-board",
                  "polish", "prisma-migrations", "ux-patterns",
                  "ux-writing", "work-queue"]
ALL_SKILLS = ["next"] + STAGES + MAINTENANCE_STAGES + UTILITY_SKILLS

# (stage, artifact) rows in pipeline order; implement and the UX
# conditional are handled specially below.
STAGE_ARTIFACTS = [
    ("idea", "idea.md"),
    ("prd", "prd.md"),
    ("ux-design", "ux.md"),
    ("architect", "architecture.md"),
    ("decompose", "breakdown.md"),
    ("implement", "breakdown.md"),
    ("verify", "verification.md"),
    ("review", "review.md"),
    ("ship", "release.md"),
    ("operate", "retro.md"),
]

# (stage, artifact) rows for a maintenance run (ADR-0025), in pipeline
# order. Capture replaces the idea-through-decompose front; re-entry
# depth recorded in defect.md decides whether the architect and decompose
# rows participate; implement's checkboxes live where the
# breakdown-placement rule puts them (see _maintenance_breakdown).
# Verify onward matches the main table — verify is never skippable.
MAINTENANCE_STAGE_ARTIFACTS = [
    ("capture", "defect.md"),
    ("architect", "architecture.md"),
    ("decompose", "breakdown.md"),
    ("implement", "breakdown.md"),
    ("verify", "verification.md"),
    ("review", "review.md"),
    ("ship", "release.md"),
    ("operate", "retro.md"),
]

# Every artifact filename that marks a run dir as *a run at all* — the
# protocol's active-run rule ("at least one artifact") over both
# orientation tables. "code" never appears: implement's artifact is the
# breakdown's checkboxes, already covered by decompose's row.
RUN_ARTIFACTS = sorted({artifact for _, artifact
                        in STAGE_ARTIFACTS + MAINTENANCE_STAGE_ARTIFACTS})

_FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
# Bullet-and-whitespace shape aligned with knowledge_plane.ROW (the
# dispatch-plane row grammar) so completion counting and dispatch agree
# about the same line; separate owner by design — this seam stays
# factory-agnostic and captures the checked state.
_CHECKBOX = re.compile(r"^\s*[-*+]\s+\[([ xX])\]", re.MULTILINE)


def read_frontmatter(path):
    """Parse a `key: value` frontmatter block into a dict.

    Single error contract: returns None when the file has no frontmatter
    block; a present-but-fieldless block is an empty dict. Callers decide
    what a missing block means for them. Values may be `|` literal block
    scalars (following indented lines joined with newlines); CRLF files
    are normalized before matching.
    """
    return parse_frontmatter(path.read_text(encoding="utf-8"))


def parse_frontmatter(text):
    """read_frontmatter's parse of text a caller already read (ADR-0094:
    parse_run reads prd.md once, guarded, and parses its frontmatter
    from that text)."""
    text = text.replace("\r\n", "\n")
    match = _FRONTMATTER.match(text)
    if not match:
        return None
    fields = {}
    key = None
    block_lines = None
    for line in match.group(1).splitlines():
        if block_lines is not None and (line.startswith("  ") or not line.strip()):
            block_lines.append(line[2:])
            continue
        if key is not None and block_lines is not None:
            fields[key] = "\n".join(block_lines).rstrip("\n")
        key = None
        block_lines = None
        if ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        if value == "|":
            block_lines = []
        else:
            fields[key] = value
    if key is not None and block_lines is not None:
        fields[key] = "\n".join(block_lines).rstrip("\n")
    return fields


# Pi (oh-my-pi) caps a skill description at 1024 chars; a longer one
# loads on Claude but silently drops the skill on omp (ADR-0027).
SKILL_DESCRIPTION_LIMIT = 1024
# YAML 1.2 indicator characters, plus the reserved backtick: a plain
# scalar may not begin with one. With `: ` and ` #` (which end a plain
# scalar mid-line) these are the shapes under which a strict YAML loader
# reads a description differently from read_frontmatter's plain
# `key: value` split — and may drop the skill outright (PRD-0007).
_YAML_INDICATORS = "-?:,[]{}#&*!|>'\"%@`"


def skill_path(root, slug):
    """skills/<slug>/SKILL.md under a plugin root — the one place the
    skill-file path shape lives (ADR-0052)."""
    return Path(root) / "skills" / slug / "SKILL.md"


def _bare_scalar_problems(label, description):
    """The three shapes that stop a description being one bare YAML
    scalar, as problem strings in a fixed order (contains `: `, contains
    ` #`, starts with an indicator). Substring tests only — no YAML
    parser. [] for a bare scalar, and for a missing description, whose
    own string has already fired."""
    if not description:
        return []
    prefix = f"{label} description is not a bare YAML scalar: "
    return (
        ([prefix + "contains ': '"] if ": " in description else [])
        + ([prefix + "contains ' #'"] if " #" in description else [])
        + ([prefix + f"starts with {description[0]!r}"]
           if description[0] in _YAML_INDICATORS else [])
    )


def skill_frontmatter_problems(root, slug):
    """Problem strings for one skill's SKILL.md frontmatter — the single
    error contract behind lint's skill checker and the trigger-eval
    loader (ADR-0052): the file exists, has a frontmatter block, its
    name matches the slug, and its description is present, within Pi's
    limit, and one bare YAML scalar (so a strict loader reads what the
    plain split read). [] when conformant."""
    path = skill_path(root, slug)
    label = f"skills/{slug}/SKILL.md"
    if not path.is_file():
        return [f"missing {label}"]
    fields = read_frontmatter(path)
    if fields is None:
        return [f"{label} has no frontmatter block"]
    description = fields.get("description")
    return (
        ([f"{label} frontmatter name is {fields.get('name')!r}, "
          f"expected {slug!r}"]
         if fields.get("name") != slug else [])
        + ([f"{label} frontmatter has no description"]
           if not description else [])
        + ([f"{label} description exceeds Pi's "
            f"{SKILL_DESCRIPTION_LIMIT}-char limit"]
           if description
           and len(description) > SKILL_DESCRIPTION_LIMIT else [])
        + _bare_scalar_problems(label, description)
    )


def _ux_skipped(run_dir):
    """UX Design is skipped only when prd.md records ux: not-applicable.
    A missing prd.md or missing ux: field means the decision hasn't been
    made, so the stage still counts as pending."""
    prd = run_dir / "prd.md"
    if not prd.is_file():
        return False
    return (read_frontmatter(prd) or {}).get("ux") == "not-applicable"


# What Ship actually reached, recorded in release.md frontmatter
# (ADR-0101). `released` and `rolled-back` are reached outcomes — the
# ship skill's failed ship whose rollback plan ran is a complete
# release.md. `prepared` is a prepare-and-stop release waiting on the
# pull request its `pending-merge:` names, written back to `released`
# once that merges.
SHIP_OUTCOMES = ("released", "rolled-back", "prepared")
_SHIP_REACHED = SHIP_OUTCOMES[:2]


def _ship_reached(run_dir):
    """Ship is complete when release.md records an outcome the stage
    actually reached (ADR-0101): `outcome: released` or `rolled-back`.
    `prepared` — and any value outside SHIP_OUTCOMES, which fails
    closed — leaves the stage pending, so a run never reaches Operate
    over a release artifact that disagrees with production. A
    release.md with no `outcome:` field predates the field and still
    counts: every release written before ADR-0101 would otherwise fall
    back to Ship."""
    release = run_dir / "release.md"
    if not release.is_file():
        return False
    outcome = (read_frontmatter(release) or {}).get("outcome")
    return outcome is None or outcome in _SHIP_REACHED


def checkbox_progress(path):
    """(checked, total) counts of the file's checkboxes under this
    seam's own grammar; a missing file counts (0, 0)."""
    path = Path(path)
    if not path.is_file():
        return (0, 0)
    boxes = _CHECKBOX.findall(path.read_text(encoding="utf-8"))
    return (sum(1 for box in boxes if box in "xX"), len(boxes))


def _all_boxes_checked(path):
    """Every checkbox in the file is checked. Zero checkboxes counts as
    incomplete — no checkboxes is no evidence of implementation, and the
    breakdown (wherever the run keeps it) always emits them."""
    checked, total = checkbox_progress(path)
    return total > 0 and checked == total


# Operate's population line (ADR-0102): how many people the retro
# actually observed, from a named source, in retro.md frontmatter. `0`
# is a valid count — it changes the retro's verdict vocabulary, never
# its validity.
RETRO_POPULATION_FIELDS = ("users-observed", "signal-source")
_COUNT = re.compile(r"[0-9]+")


def _retro_populated(run_dir):
    """Operate is complete when retro.md carries its population line
    (ADR-0102): `users-observed:` a count of zero or more and
    `signal-source:` naming where it came from. A placeholder, a
    negative or non-integer count, or either field without the other
    leaves the stage pending. A retro.md with neither field predates
    the line and still counts, as every retro written before ADR-0102
    does — otherwise every finished run would reopen as active."""
    retro = run_dir / "retro.md"
    if not retro.is_file():
        return False
    fields = read_frontmatter(retro) or {}
    count = fields.get("users-observed")
    source = fields.get("signal-source")
    if count is None and source is None:
        return True
    return (count is not None and _COUNT.fullmatch(count) is not None
            and bool(source))


def run_ref(root, run_dir):
    """The protocol run-ref for a run directory: docs/ is the product
    run; docs/features/<slug> and docs/fixes/<slug> carry their scale
    in the parent name."""
    rel = Path(run_dir).relative_to(Path(root))
    if rel == Path("docs"):
        return "product"
    scale = "feature" if rel.parent.name == "features" else "maintenance"
    return f"{scale}:{rel.name}"


def is_maintenance_run(run_dir):
    """A maintenance run is recognized without a manifest: it lives under
    docs/fixes/<slug>/ (the run-discovery rule) or already holds the
    capture seed defect.md. Either signal suffices, so an empty fixes
    directory orients to capture before any artifact exists."""
    run_dir = Path(run_dir)
    return (run_dir.parent.name == "fixes"
            or (run_dir / "defect.md").is_file())


def _re_entry_architect(run_dir):
    """Re-entry depth is decided at capture time and recorded in
    defect.md frontmatter (re-entry: implement | architect). Only an
    explicit architect re-entry brings the architecture.md +
    breakdown.md chain into the run; otherwise those stages are
    skipped."""
    defect = run_dir / "defect.md"
    if not defect.is_file():
        return False
    return (read_frontmatter(defect) or {}).get("re-entry") == "architect"


def _maintenance_breakdown(run_dir):
    """The breakdown-placement rule: checkboxes live inline in defect.md
    with re-entry: implement, and in breakdown.md with re-entry:
    architect. There is no third option."""
    name = "breakdown.md" if _re_entry_architect(run_dir) else "defect.md"
    return run_dir / name


def breakdown_path(run_dir):
    """Where this run's implement checkboxes live: breakdown.md, except
    a re-entry: implement maintenance run keeps them inline in
    defect.md (the breakdown-placement rule, ADR-0025)."""
    run_dir = Path(run_dir)
    if is_maintenance_run(run_dir):
        return _maintenance_breakdown(run_dir)
    return run_dir / "breakdown.md"


def _stage_complete(stage, artifact, run_dir):
    if stage == "implement":
        return _all_boxes_checked(run_dir / "breakdown.md")
    if stage == "ux-design":
        return (run_dir / artifact).is_file() or _ux_skipped(run_dir)
    if stage == "ship":
        return _ship_reached(run_dir)
    if stage == "operate":
        return _retro_populated(run_dir)
    return (run_dir / artifact).is_file()


def _maintenance_stage_complete(stage, artifact, run_dir):
    if stage == "implement":
        return _all_boxes_checked(_maintenance_breakdown(run_dir))
    if stage in ("architect", "decompose"):
        return ((run_dir / artifact).is_file()
                or not _re_entry_architect(run_dir))
    if stage == "ship":
        return _ship_reached(run_dir)
    if stage == "operate":
        return _retro_populated(run_dir)
    return (run_dir / artifact).is_file()


def next_stage(run_dir):
    """First stage in pipeline order that is not complete. A populated
    retro.md marks the whole run complete regardless of earlier gaps
    (the protocol's run-discovery rule and the router's step 6 both
    key on it); a retro.md without its population line is Operate not
    yet complete, whatever lies before it (ADR-0102). Maintenance runs
    walk their own rows (ADR-0025); every other run walks the
    product/feature table."""
    run_dir = Path(run_dir)
    if (run_dir / "retro.md").is_file():
        return "complete" if _retro_populated(run_dir) else "operate"
    if is_maintenance_run(run_dir):
        rows = MAINTENANCE_STAGE_ARTIFACTS
        complete = _maintenance_stage_complete
    else:
        rows = STAGE_ARTIFACTS
        complete = _stage_complete
    for stage, artifact in rows:
        if not complete(stage, artifact, run_dir):
            return stage
    return "complete"


def _stage_skipped(stage, artifact, run_dir):
    """Completion excused by rule rather than by artifact: the ux:
    conditional, with no ux.md actually written."""
    return (stage == "ux-design"
            and not (run_dir / artifact).is_file()
            and _ux_skipped(run_dir))


def _maintenance_stage_skipped(stage, artifact, run_dir):
    """Completion excused by rule rather than by artifact: re-entry:
    implement drops the architect + decompose chain (ADR-0025), unless
    the artifact was written anyway."""
    return (stage in ("architect", "decompose")
            and not (run_dir / artifact).is_file()
            and not _re_entry_architect(run_dir))


def stage_states(run_dir):
    """Every stage of this run's own ladder, in order, with its state:
    done | current | ahead | skipped. The full form of the next_stage
    walk — the one "current" row IS next_stage (a complete run has no
    current row), "skipped" marks completion excused by rule rather
    than by artifact, and a stage after current whose artifact exists
    anyway reads "done" so a gapped run shows its gap."""
    run_dir = Path(run_dir)
    if is_maintenance_run(run_dir):
        rows = MAINTENANCE_STAGE_ARTIFACTS
        complete = _maintenance_stage_complete
        skipped = _maintenance_stage_skipped
    else:
        rows = STAGE_ARTIFACTS
        complete = _stage_complete
        skipped = _stage_skipped
    current = next_stage(run_dir)  # "complete" matches no row
    states = []
    for stage, artifact in rows:
        if complete(stage, artifact, run_dir):
            state = ("skipped" if skipped(stage, artifact, run_dir)
                     else "done")
        elif stage == current:
            state = "current"
        else:
            state = "ahead"
        states.append((stage, state))
    return states


# The seed-backlog entry grammar (ADR-0029): docs/backlog.md is an
# advisory bullet list, one seed per line, each carrying its origin
# run-ref and optionally the run that claimed it. Only `- ` bullets are
# held to the grammar; the run-ref forms mirror the protocol doc's
# "Seed backlog (optional)" section.
_BACKLOG_RUN_REF = re.compile(
    r"product|feature:[a-z0-9-]+|maintenance:[a-z0-9-]+"
    r"|session:\d{4}-\d{2}-\d{2}")
_BACKLOG_ENTRY = re.compile(
    r"- (?P<text>.+?) \(from: (?P<origin>[^()]+)\)"
    r"(?: \(claimed: (?P<claimed>[^()]+)\))?")


def _backlog_refs(match):
    """The (marker, run-ref) pairs a matched entry carries; claimed may
    be absent."""
    return [(marker, match.group(marker))
            for marker in ("origin", "claimed")
            if match.group(marker) is not None]


def parse_backlog(text):
    """Parse backlog text into entries {line, text, origin, claimed}
    (line is the 1-based file line, claimed is None on unclaimed
    seeds). Never raises: malformed bullets and non-bullet lines are
    skipped — check_backlog is where they become problems."""
    entries = []
    for number, line in enumerate(text.splitlines(), 1):
        match = _BACKLOG_ENTRY.fullmatch(line)
        if not match or not all(_BACKLOG_RUN_REF.fullmatch(ref)
                                for _, ref in _backlog_refs(match)):
            continue
        entries.append({"line": number,
                        "text": match.group("text"),
                        "origin": match.group("origin"),
                        "claimed": match.group("claimed")})
    return entries


def check_backlog(text):
    """Problem strings (`backlog: line N: ...`) for every bullet line
    that breaks the entry grammar; [] when conformant. Non-bullet lines
    (header, blanks, prose) are ignored, and malformed input yields
    problem strings, never exceptions."""
    problems = []
    for number, line in enumerate(text.splitlines(), 1):
        if not line.startswith("- "):
            continue
        match = _BACKLOG_ENTRY.fullmatch(line)
        if not match:
            problems.append(f"backlog: line {number}: entry does not "
                            "match '- <seed text> (from: <run-ref>)'")
            continue
        problems.extend(
            f"backlog: line {number}: invalid run-ref {ref!r}"
            for _, ref in _backlog_refs(match)
            if not _BACKLOG_RUN_REF.fullmatch(ref))
    return problems
