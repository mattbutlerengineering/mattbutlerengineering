#!/usr/bin/env python3
"""orientation_pack: the knowledge-plane context bundle folded into a
dispatched work order's prompt (WO-0015; ADR-0032 dispatch plane).

Named orientation_pack.py, not orientation.py: "orientation" already
names an unrelated concept in this repo — the idea-to-prod pipeline's
"which stage is next" decision table (ADR-0021, protocol.py's
next_stage, pinned by tests/test_protocol_orientation.py against
tests/fixtures/orientation/; the root orientation.py CLI adapter over
it has since been deleted as a zero-caller pass-through). The factory
shares this repo's root namespace with that pipeline, so the two
"orientation" concepts needed different names; see
docs/features/software-factory/breakdown.md's WO-0015 Notes for the
citation.

Same seam discipline as assembler.py: every function takes `root` (a repo
tree, not an injected reader object) and reads real files under it, tested
against tempfile fixture trees. And the same prompt-injection boundary
(ADR-0032): orientation_pack takes root, a work order id, and the
repo-controlled breakdown ROW — never an issue body or GitHub event, so
there is no channel for attacker-controlled text to reach the pack.
"""
import ast
import re
from pathlib import Path

from knowledge_plane import ADR_TOKEN, breakdown_files, row_work_order

# Bare filenames a breakdown row names in prose ("assembler.yml + guards",
# "budget_guard.py + handoff.py + cost ledger") — a best-effort scan of the
# row text, not a path resolver; _resolve_file below turns a match into a
# real repo path.
FILENAME_TOKEN = re.compile(r"\b[\w-]+\.(?:py|yml|yaml|md|json)\b")

# The row grammar is knowledge_plane.row_work_order — the WO a row's FIRST
# token names owns the block that follows until the next work-order row.
# The Accept:/Notes sub-bullets under a row are NOT checkbox rows, so they
# belong to their work order's block, which is where this repo's rows
# actually cite ADRs (the bullet line cites only the PRD section).


def wo_block(root, wo):
    """The full breakdown block a work order owns — its checkbox bullet PLUS
    the indented Accept:/Notes sub-bullets beneath it, up to the next
    work-order bullet or heading — or None when no row names it.

    This is why ADR-bundling actually fires: in this repo's row grammar the
    bullet line cites only `PRD-#### §section`; the ADRs a work order builds
    on are named in the sub-bullets below it (or nowhere). Scanning only the
    bullet, as an earlier cut did, bundled zero ADRs for every real row.
    Still repo-file-sourced (the knowledge plane), never an issue body — the
    ADR-0032 boundary holds: a broader slice of the SAME breakdown.md, not a
    new, attacker-reachable input."""
    for _, lines in breakdown_files(root):
        for index, line in enumerate(lines):
            if row_work_order(line) != wo:
                continue
            block = [line]
            for nxt in lines[index + 1:]:
                if row_work_order(nxt) or nxt.startswith("#"):
                    break
                block.append(nxt)
            return "\n".join(block).strip()
    return None


def cited_adrs(text):
    """ADR numbers a breakdown block cites, in citation order, deduplicated.
    Same grammar knowledge_plane.ADR_TOKEN reads elsewhere in the knowledge
    plane (detector C's link integrity, detector D's blueprint drift) — a
    block that names no ADR cites none; that is a fact about the block, not
    a gap here. Callers pass the work order's full block (see wo_block), not
    just its bullet line, because that is where the citations live."""
    return list(dict.fromkeys(ADR_TOKEN.findall(text)))


def adr_path(root, number):
    """The docs/adr file for a 4-digit ADR number, or None. Same glob
    gates.check_blueprint_drift uses to walk the blueprint plane."""
    adr_dir = Path(root) / "docs" / "adr"
    if not adr_dir.is_dir():
        return None
    matches = sorted(adr_dir.glob(f"{number}-*.md"))
    return matches[0] if matches else None


def _resolve_file(root, name):
    """The canonical repo file matching a bare filename a row names, or
    None. Rows name files without a path ("assembler.yml"), so this is a
    search, not a lookup. Copies under dot-directories (agent worktrees,
    editor state — but not .github, the workflows' real home) or the
    template payload are mirrors, never the file a row means, so they
    are skipped; among the rest the shallowest match wins (the root copy
    over any nested one), with sorted order breaking ties
    deterministically."""
    root = Path(root)
    payload = root / "factory" / "templates"

    def hidden(path):
        return any(part.startswith(".") and part != ".github"
                   for part in path.relative_to(root).parts[:-1])

    matches = [p for p in root.rglob(name)
               if not hidden(p) and not p.is_relative_to(payload)]
    matches.sort(key=lambda p: (len(p.relative_to(root).parts), p))
    return matches[0] if matches else None


def _read_or_note(path, what):
    """The file's text, or a parenthesised note naming why it could not
    be read.

    _python_structure below states this rule for the codegraph half of
    the pack: a file that cannot be read "degrades to (message, None)
    rather than raising ... one unparseable file a row names must not
    crash the assembler CLI (the repo's problem-string/degrade
    convention, not a traceback)". CONTEXT.md and the cited ADRs are
    read by the same function, into the same prompt, on the same
    best-effort terms, so they degrade the same way. This module is
    mirrored into the factory payload, which means those two are files
    in whatever product repo adopted the factory — not this one, where
    they all happen to be ASCII.

    OSError and ValueError are the two that matter: a file the process
    may not read, and one that is not UTF-8. An `is_file()` guard
    answers neither; it is a different question asked a moment earlier,
    and the mode or the bytes can still refuse after it has said yes.

    A note rather than a silent drop: a reader who cannot see a cited
    ADR's text should be told it was cited and why the body is missing.
    """
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, ValueError) as err:
        return f"({what} could not be read: {err.__class__.__name__})"


def _python_structure(path):
    """(docstring headline, [top-level def/class names]) for a .py file,
    read via ast so nothing executes. A file that cannot be read or parsed
    (syntax error, non-UTF-8) degrades to (message, None) rather than
    raising — the codegraph is best-effort orientation, and one unparseable
    file a row names must not crash the assembler CLI (the repo's
    problem-string/degrade convention, not a traceback)."""
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except (OSError, ValueError, SyntaxError) as err:
        return f"(could not be parsed: {err.__class__.__name__})", None
    doc = ast.get_docstring(tree)
    headline = doc.strip().splitlines()[0] if doc else "(no module docstring)"
    names = [node.name for node in tree.body
             if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                                   ast.ClassDef))]
    return headline, names


def codegraph_summary(root, text):
    """A lightweight structural map of the repo files a breakdown block
    names: for a .py file, its module docstring headline and top-level
    def/class names (via ast — nothing executes; an unparseable file
    degrades to a note, never a crash); for anything else, just that it
    exists in the tree. Pure over `root` + `text`, stdlib-only, no
    dependency graph — the minimum that lets a dispatched agent orient
    before reading blind."""
    root = Path(root)
    lines = []
    for name in dict.fromkeys(FILENAME_TOKEN.findall(text)):
        path = _resolve_file(root, name)
        if path is None:
            continue
        rel = path.relative_to(root).as_posix()
        if path.suffix == ".py":
            headline, names = _python_structure(path)
            if names is None:
                lines.append(f"- {rel} — {headline}")
            else:
                listing = ", ".join(names) if names else "(no top-level defs)"
                lines.append(f"- {rel} — {headline}\n  {listing}")
        else:
            lines.append(f"- {rel}")
    if not lines:
        return "(no repo files named on this block were found)"
    return "\n".join(lines)


def orientation_pack(root, wo, row):
    """The orientation pack for a dispatched work order: CONTEXT.md, the ADRs
    the work order's breakdown block cites, and a codegraph summary of the
    files it names — the knowledge-plane context WO-0015 promises the
    assembler prompt. Pure over `root` + `wo` + `row`: every byte is a repo
    file reached from the repo-controlled breakdown, never an issue body
    (ADR-0032's prompt-injection boundary — this function does not even
    accept one).

    The ADR/codegraph scan reads the work order's full block (bullet PLUS
    its Accept:/Notes sub-bullets, via wo_block) rather than the bullet
    `row` alone, because that block is where this repo's rows cite ADRs. The
    bullet `row` remains the fallback when no breakdown names this WO (e.g.
    a hand call), so the pack still degrades cleanly."""
    root = Path(root)
    block = wo_block(root, wo) or row
    context_path = root / "CONTEXT.md"
    context = (_read_or_note(context_path, "CONTEXT.md")
               if context_path.is_file() else "(no CONTEXT.md at repo root)")
    parts = [f"## Orientation pack: {wo}\n", "### CONTEXT.md\n", context]
    for number in cited_adrs(block):
        path = adr_path(root, number)
        if path is None:
            continue
        parts.append(f"### ADR-{number}: {path.stem}\n")
        parts.append(_read_or_note(path, f"ADR-{number}"))
    parts.append("### Codegraph summary\n")
    parts.append(codegraph_summary(root, block))
    return "\n".join(parts)
