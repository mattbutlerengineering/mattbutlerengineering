#!/usr/bin/env python3
"""label-sync: detector L (LABEL-SYNC) — the GitHub label taxonomy must
match .github/labels.json (PRD-0001; ADR-0033 lifecycle labels).

A NETWORK detector: it reads the live label set through the gh CLI, so it
runs in scheduled sweeps only and is NEVER wired into gates.py CHECKERS
(those stay offline). Conventions match gates.py/lint.py: functions return
L:-prefixed problem strings; the CLI prints them and exits nonzero.

  python3 label_sync.py           report drift (gh label list)
  python3 label_sync.py --apply   also create/update each drifted label
                                  (gh label create --force)

Drift is one-way: labels outside the taxonomy are ignored (GitHub's
default labels are not drift), so --apply never deletes anything.
"""
import json
import sys
from pathlib import Path

from cli import CLI_FAILURES as GH_FAILURES
from cli import detail as gh_detail
from cli import gh_read, gh_runner, report
from factory_config import artifact_paths
from knowledge_plane import repo_root

LABEL_FIELDS = ("name", "color", "description")


def taxonomy_path(root):
    """The labels.json this repo's taxonomy lives in, or None when none
    of the candidate homes holds one.

    Split out of load_labels so the question "is there a taxonomy at
    all?" can be asked without also parsing it. Detector J needs exactly
    that: an absent taxonomy is an unstamped repo, which has nothing to
    be wrong about, while an unreadable one is the finding. Walking the
    candidates a second time to tell them apart would give the gate and
    the sync tool two answers to a question that must have one.
    """
    return next((path for path, _
                 in artifact_paths(Path(root), "labels.json")
                 if path.is_file()), None)


def load_labels(root):
    """Desired taxonomy for a repo: the installed .github/labels.json when
    stamped, else the template payload copy — the first existing candidate
    in factory_config.artifact_paths' installed-first order (ADR-0048).
    Returns (labels, problems); malformed entries are excluded from labels
    and reported."""
    root = Path(root)
    path = taxonomy_path(root)
    if path is None:
        homes = " or ".join(
            candidate.relative_to(root).as_posix()
            for candidate, _ in artifact_paths(root, "labels.json"))
        return [], [f"L: missing labels.json ({homes})"]
    rel = path.relative_to(root).as_posix()
    # ADR-0075's wording rule, applied by hand: bytes that are not UTF-8
    # are a defect in a JSON document, so they join the parse failure's
    # wording, not the read failure's. Hand-written rather than
    # cli.read_file because the shape wording below is this loader's own
    # and covers null.
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as err:
        return [], [f"L: cannot read {rel}: {err}"]
    except UnicodeDecodeError as err:
        return [], [f"L: {rel} is not valid JSON: {err}"]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as err:
        return [], [f"L: {rel} is not valid JSON: {err}"]
    if not isinstance(data, list) or not data:
        return [], [f"L: {rel} must be a non-empty JSON array"
                    " of label entries"]
    labels, problems, seen = [], [], set()
    for index, entry in enumerate(data):
        fields = entry if isinstance(entry, dict) else {}
        lacking = [field for field in LABEL_FIELDS
                   if not isinstance(fields.get(field), str)
                   or not fields.get(field)]
        if lacking:
            problems.append(
                f"L: {rel}[{index}] entry lacks {', '.join(lacking)}")
        elif fields["name"] in seen:
            problems.append(
                f"L: {rel}[{index}] duplicate label name {fields['name']}")
        else:
            seen.add(fields["name"])
            labels.append({field: fields[field] for field in LABEL_FIELDS})
    return labels, problems


def plan(current, desired):
    """PURE drift computation: the L: problems that make current match
    desired. Labels outside the taxonomy are ignored (GitHub defaults are
    not drift), so an empty desired plans nothing. Color compares
    case-insensitively — GitHub stores hex either way (this repo already
    carries `0E8A16`), and case alone is not drift."""
    have = {label.get("name"): label for label in current}
    problems = []
    for want in desired:
        got = have.get(want["name"])
        if got is None:
            problems.append(f"L: missing label {want['name']}")
            continue
        if str(got.get("color") or "").lower() != want["color"].lower():
            problems.append(f"L: label {want['name']} color"
                            f" {got.get('color')}, want {want['color']}")
        if got.get("description") != want["description"]:
            problems.append(
                f"L: label {want['name']} description"
                f" {got.get('description')!r}, want {want['description']!r}")
    return problems


# How far back the label listing can see. cli.gh_read owns the window —
# the limit it sends gh and the truncation it reports are the same
# number, so the two can no longer drift apart.
LIST_WINDOW = 1000
LIST_ARGS = ("label", "list", "--json", "name,color,description")


def live_labels(run=gh_runner):
    """(live label set, problem-suffixes) through gh. The suffixes carry
    the operation but no label (the cost_ledger.line_problems
    convention): each caller — sync here, the label-drift and
    ensure-labels sweeps in sweeps.py — owns its own prefix, so this
    reader passes no label to the seam. A missing, unauthenticated or
    rate-limited gh is a suffix like any other, never a raise; the catch
    is cli.gh_read's. (None, suffixes) when the listing is unusable —
    comparing the taxonomy against nonsense would report the whole
    taxonomy as drift. A full window is a suffix too, but the labels
    stay usable."""
    read = gh_read(list(LIST_ARGS), "gh label list", run=run,
                   window=LIST_WINDOW)
    return read.value, list(read.problems)


def sync(root, apply=False, run=gh_runner):
    """Report drift between the live label set and the taxonomy; with
    apply=True, force-create each drifted label (gh treats create --force
    on an existing name as an update). A broken labels.json short-circuits
    before any network call; a failing gh call becomes an L: problem string
    (this detector runs in a scheduled sweep, where a traceback is noise)."""
    desired, problems = load_labels(root)
    if problems:
        return problems
    current, suffixes = live_labels(run)
    problems = [f"L: {suffix}" for suffix in suffixes]
    if current is None:
        return problems
    for want in desired:
        drift = plan(current, [want])
        problems.extend(drift)
        if apply and drift:
            try:
                run(["label", "create", want["name"], "--force",
                     "--color", want["color"],
                     "--description", want["description"]])
            except GH_FAILURES as err:
                problems.append(f"L: gh label create {want['name']} failed:"
                                f" {gh_detail(err)}")
    return problems


def main(argv, run=gh_runner):
    apply = "--apply" in argv
    if [arg for arg in argv if arg != "--apply"]:
        print(__doc__.strip())
        return 2
    return report("label-sync", sync(repo_root(), apply=apply, run=run))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
