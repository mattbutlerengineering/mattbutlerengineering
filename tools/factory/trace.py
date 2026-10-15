#!/usr/bin/env python3
"""trace: one dated view of ticket -> requirement -> decision -> feedback
for a key (ADR-0092).

    python3 trace.py <key> [--json] [--budget BYTES] [--since DATE]
                           [--root DIR]

A key is a run ref (`feature:<slug>`, `maintenance:<slug>`, `product`),
a typed id (`PRD-####`, `ADR-####`, `WO-####`), an issue number (`#N`)
or a `docs/kb/<slug>.md` page. It resolves to one run, and the report
lists that run's history in four chronological sections — TICKETS,
REQUIREMENTS, DECISIONS, FEEDBACK — then CHANGES SINCE, every commit to
the run's artifacts from `--since` (default: the run's first commit).

A derived view, never a store: it is regenerated on every call, never
committed, and draws only edges the existing grammar expresses — the
typed-id tokens, `(tracker: #N)` rows and `Closes #N` lines
knowledge_plane owns, protocol's run refs, and ADR status lines with
both ends' dates. Read-only: it writes nothing.

Everything from files and git runs offline. Issue history (opened and
closed dates, label flips, issues citing the run) is the one online
input; it goes through cli's gh port and human_gates.read_timelines.
With CI set, or when gh fails, the report says in one line that issue
history was not read, and still exits 0.

`--budget` caps the text report in bytes (cut at a line, with a marker
line); `--json` prints the same events uncapped, for renderers that
must not re-derive them (ADR-0062). An unresolvable key is a
label-prefixed problem string and exit 1.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

from cli import CLI_FAILURES, detail, gh_read, gh_runner, report, runner
from human_gates import read_timelines
from knowledge_plane import (ADR_TOKEN, CLOSES_TOKEN, PRD_TOKEN, WO_TOKEN,
                             adr_paths, adr_records, breakdown_rows,
                             parse_run, sanitize, status_head, unfenced,
                             work_orders)
from protocol import (MAINTENANCE_STAGE_ARTIFACTS, STAGE_ARTIFACTS,
                      read_frontmatter, run_ref)

LABEL = "trace"
DEFAULT_BUDGET = 4096
ISSUE_WINDOW = 100
NO_DATE = "-" * 10
VIEW_FIELDS = "number,title,state,createdAt,closedAt,body"
LIST_FIELDS = "number,title,state,createdAt,closedAt"
NAMED_OTHERS = 5
SECTIONS = ("tickets", "requirements", "decisions", "feedback")
DECISION_STAGES = {"architect"}
FEEDBACK_STAGES = {"verify", "review", "ship", "operate"}
# The ADR's own `- Date:` line: the start of its validity window, and
# the end of the window of any ADR it supersedes.
ADR_DATE = re.compile(r"^-\s*Date:\s*(\d{4}-\d{2}-\d{2})\b")
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
ISSUE_KEY = re.compile(r"#(\d+)")
SCALES = ("feature:", "maintenance:")


def artifact_sections():
    """[(artifact, section)] in pipeline order, from protocol's stage
    tables: the architect's artifact is a decision, verify onward is
    feedback, everything before is a requirement."""
    order = []
    for stage, artifact in (MAINTENANCE_STAGE_ARTIFACTS[:1]
                            + STAGE_ARTIFACTS):
        if artifact in dict(order):
            continue
        section = ("decisions" if stage in DECISION_STAGES else
                   "feedback" if stage in FEEDBACK_STAGES else
                   "requirements")
        order.append((artifact, section))
    return order


def _tokens(lines):
    """Every typed id the unfenced lines cite — fenced text is quoted,
    not claimed."""
    found = set()
    for _, line in unfenced(lines):
        found.update(PRD_TOKEN.findall(line))
        found.update(WO_TOKEN.findall(line))
        found.update(f"ADR-{n}" for n in ADR_TOKEN.findall(line))
    return found


def read_runs(root):
    """One record per run_dirs run, from parse_run: its run ref, PRD id,
    breakdown lines, and each present artifact's lines and cited ids."""
    runs = []
    for entry in parse_run(root)["runs"]:
        path = entry["path"]
        artifacts = {}
        for name, _ in artifact_sections():
            file = path / name
            if file.is_file():
                lines = file.read_text(encoding="utf-8").splitlines()
                artifacts[name] = {"lines": lines, "ids": _tokens(lines)}
        runs.append({"path": path, "ref": run_ref(root, path),
                     "prd": entry["prd_id"], "breakdown": entry["breakdown"],
                     "artifacts": artifacts})
    return runs


def _citing(runs, key):
    return [run for run in runs
            if any(key in a["ids"] for a in run["artifacts"].values())]


def _closes(run):
    """[(issue number, artifact)] for each Closes line in the run."""
    return [(int(n), name) for name, a in run["artifacts"].items()
            for _, line in unfenced(a["lines"])
            for n in CLOSES_TOKEN.findall(line)]


# --- issue history through the gh port -------------------------------

def gh_state(environ):
    """The online input's state: `skipped` is why issue history is not
    read (None while it is), `cache` the issues already viewed."""
    return {"skipped": "CI is set" if environ.get("CI") else None,
            "cache": {}, "notes": []}


def _gh(state, args, operation, run, **kwargs):
    """One gh read, or None once gh is skipped; its first failure skips
    every later read, so an absent gh is one stated line."""
    if state["skipped"]:
        return None
    read = gh_read(args, operation, run=run, **kwargs)
    if read.value is None:
        state["skipped"] = read.problems[0]
        return None
    state["notes"].extend(read.problems)
    return read.value


def view_issue(number, state, run):
    if number not in state["cache"]:
        value = _gh(state, ["issue", "view", str(number), "--json",
                            VIEW_FIELDS], f"gh issue view #{number}", run,
                    expect=dict)
        if value is None:
            return None
        state["cache"][number] = value
    return state["cache"][number]


# --- key resolution ---------------------------------------------------

def pick(key, primary, citing):
    """(run, notes): the declaring run, else the first citing one; up to
    NAMED_OTHERS of the other citing runs are named in a note."""
    run = primary or (citing[0] if citing else None)
    others = [r["ref"] for r in citing if r is not run]
    if not run or not others:
        return run, []
    more = len(others) - NAMED_OTHERS
    return run, [f"{key} is also cited by"
                 f" {', '.join(others[:NAMED_OTHERS])}"
                 + (f" and {more} more" if more > 0 else "")]


def resolve_id(root, key, runs):
    primary = None
    if PRD_TOKEN.fullmatch(key):
        primary = next((r for r in runs if r["prd"] == key), None)
    elif WO_TOKEN.fullmatch(key):
        row = work_orders(root)[0]["wo"].get(key)
        primary = row and next(
            (r for r in runs if r["path"] == row["path"].parent), None)
    return pick(key, primary, _citing(runs, key))


def resolve_issue(root, number, runs, state, run):
    row = work_orders(root)[0]["issue"].get(number)
    if row:
        return next(r for r in runs if r["path"] == row["path"].parent), []
    closing = [r for r in runs if number in dict(_closes(r))]
    if closing:
        return pick(f"#{number}", closing[0], closing)
    issue = view_issue(number, state, run)
    if issue is None:
        return None, [f"#{number} has no tracker row or Closes line in any"
                      f" run, and issue history was not read"
                      f" ({state['skipped']})"]
    body = issue.get("body") or ""
    for candidate in runs:
        if candidate["ref"] != "product" and re.search(
                rf"(?<![\w:-]){re.escape(candidate['ref'])}(?![\w-])",
                body):
            return candidate, []
    for key in sorted(_tokens(body.splitlines())):
        found, notes = resolve_id(root, key, runs)
        if found:
            return found, notes
    return None, [f"#{number} has no tracker row or Closes line in any"
                  f" run, and its body cites no run"]


def resolve_kb(root, key, runs):
    page = root / key
    if not page.is_file():
        return None, [f"{key} does not exist"]
    sources = (read_frontmatter(page) or {}).get("sources", "")
    for run in runs:
        rel = run["path"].relative_to(root).as_posix()
        if run["ref"] != "product" and f"{rel}/" in sources:
            return run, []
    for number, path in adr_paths(root):
        if path.relative_to(root).as_posix() in sources:
            found, notes = resolve_id(root, f"ADR-{number}", runs)
            if found:
                return found, notes
    return None, [f"{key} cites no run, and no ADR a run cites, in its"
                  " sources"]


def resolve(root, key, runs, state, run):
    """(run record, notes, problems) for a key."""
    by_ref = {r["ref"]: r for r in runs}
    if key in by_ref:
        return by_ref[key], [], []
    if key.startswith(SCALES) or key == "product":
        return None, [], [f"{LABEL}: {key} names no run directory"]
    issue = ISSUE_KEY.fullmatch(key)
    if issue:
        found, said = resolve_issue(root, int(issue.group(1)), runs, state,
                                    run)
    elif any(t.fullmatch(key) for t in (PRD_TOKEN, ADR_TOKEN, WO_TOKEN)):
        found, said = resolve_id(root, key, runs)
        if not found:
            said = [f"{key} is declared or cited by no run"]
    elif key.startswith("docs/kb/") and key.endswith(".md"):
        found, said = resolve_kb(root, key, runs)
    else:
        return None, [], [f"{LABEL}: {key} is not a run ref, typed id,"
                          " issue number (#N) or docs/kb/ page"]
    if not found:
        return None, [], [f"{LABEL}: {problem}" for problem in said]
    return found, said, []


# --- events -----------------------------------------------------------

def event(sort, date, text, commit=None, ref=None):
    return {"sort": sort, "date": date, "text": text, "commit": commit,
            "ref": ref}


def history(root, rel, git):
    """[(short sha, ISO author date, subject)] for one file, oldest
    first, following renames."""
    out = git(["-C", str(root), "log", "--follow",
               "--format=%h%x09%aI%x09%s", "--", rel])
    return [tuple(line.split("\t", 2)) for line in reversed(out.splitlines())
            if line.count("\t") >= 2]


def artifact_events(root, run, git):
    """{section: events}, plus every commit as a change event."""
    sections = {name: [] for name in SECTIONS}
    changes = []
    for name, section in artifact_sections():
        if name not in run["artifacts"]:
            continue
        rel = (run["path"] / name).relative_to(root).as_posix()
        commits = history(root, rel, git)
        if not commits:
            sections[section].append(
                event("", None, f"{name} not committed", ref=rel))
            continue
        sha, when, _ = commits[0]
        label = (f" ({run['prd']})" if name == "prd.md" and run["prd"]
                 else "")
        sections[section].append(event(when, when[:10],
                                       f"{name} created{label}", sha, rel))
        if len(commits) > 1:
            sha, when, _ = commits[-1]
            sections[section].append(event(
                when, when[:10], f"{name} changed, {len(commits)} commits",
                sha, rel))
        changes += [event(when, when[:10], f"{name}: {subject}", sha, rel)
                    for sha, when, subject in commits]
    return sections, changes


def _adr_date(record):
    return next((m.group(1) for m in map(ADR_DATE.match, record["lines"])
                 if m), None)


def adr_events(root, run):
    """Each ADR the run cites, at its own date, with its status and the
    date of the ADR that superseded or amended it."""
    records = {f"ADR-{r['number']}": r for r in adr_records(root)[0]}
    events = []
    for key in sorted({i for a in run["artifacts"].values()
                       for i in a["ids"] if i.startswith("ADR-")}):
        record = records.get(key)
        if record is None:
            continue
        head = status_head(record["status"]) or record["status"] \
            or "no status"
        later = ADR_TOKEN.search(head)
        if later and f"ADR-{later.group(1)}" in records:
            other = _adr_date(records[f"ADR-{later.group(1)}"])
            head += f" ({other})" if other else ""
        cited = ", ".join(name for name, a in run["artifacts"].items()
                          if key in a["ids"])
        date = _adr_date(record)
        events.append(event(date or "", date,
                            f"{key} {head}, cited by {cited}", ref=key))
    return events


def ticket_numbers(run):
    """{issue number: how the run names it}: tracker rows, then Closes."""
    found = {}
    for row in breakdown_rows(run["breakdown"] or []):
        if row["issue"] is not None:
            found.setdefault(row["issue"], f"tracker of {row['wo']}"
                             if row["wo"] else "tracker row")
    for number, name in _closes(run):
        found.setdefault(number, f"Closes line in {name}")
    return dict(sorted(found.items()))


def ticket_events(tickets, state, run):
    """Dated ticket events when issue history is read, else one undated
    event per ticket."""
    issues = {n: view_issue(n, state, run) for n in tickets}
    if state["skipped"]:
        return [event("", None, f"#{n} {via}", ref=f"#{n}")
                for n, via in tickets.items()]
    events = []
    for n, via in tickets.items():
        issue = issues[n]
        events.append(event(issue["createdAt"], issue["createdAt"][:10],
                            f"#{n} opened ({via}):"
                            f" {sanitize(issue.get('title'))}", ref=f"#{n}"))
        if issue.get("closedAt"):
            events.append(event(issue["closedAt"], issue["closedAt"][:10],
                                f"#{n} closed", ref=f"#{n}"))
    timelines, problems = read_timelines(list(tickets), run, LABEL)
    state["notes"].extend(problems)
    events += [event(ts, ts[:10], f"#{n} {kind} {name}", ref=f"#{n}")
               for n, flips in timelines.items() for ts, kind, name in flips]
    return events


def citing_events(record, tickets, state, run):
    """Issues whose text cites the run ref or its PRD id — feedback the
    citation rule (ADR-0092 clause 7) ties to the run."""
    terms = [t for t in (record["ref"], record["prd"]) if t]
    found = _gh(state, ["issue", "list", "--state", "all", "--search",
                        " OR ".join(f'"{t}"' for t in terms), "--json",
                        LIST_FIELDS], "gh issue list", run,
                window=ISSUE_WINDOW)
    return [event(i["createdAt"], i["createdAt"][:10],
                  f"#{i['number']} cites the run"
                  f" ({str(i.get('state', '')).lower()}):"
                  f" {sanitize(i.get('title'))}", ref=f"#{i['number']}")
            for i in found or [] if i.get("number") not in tickets]


def _ordered(events):
    return [{k: v for k, v in e.items() if k != "sort"}
            for _, e in sorted(enumerate(events),
                               key=lambda pair: (pair[1]["sort"], pair[0]))]


def build(root, key, record, notes, state, run, since, git):
    sections, changes = artifact_events(root, record, git)
    sections["decisions"] += adr_events(root, record)
    tickets = ticket_numbers(record)
    sections["tickets"] = ticket_events(tickets, state, run)
    sections["feedback"] += citing_events(record, tickets, state, run)
    start = since or min((c["date"] for c in changes), default=None)
    return {
        "key": key, "run": record["ref"], "prd": record["prd"],
        "head": git(["-C", str(root), "rev-parse", "--short",
                     "HEAD"]).strip(),
        "since": start,
        "issue_history": (f"not read ({state['skipped']})"
                          if state["skipped"] else "read"),
        "notes": notes + ([f"issue history not read ({state['skipped']})"]
                          if state["skipped"] else []) + state["notes"],
        **{name: _ordered(sections[name]) for name in SECTIONS},
        "changes": _ordered([c for c in changes
                             if start is None or c["date"] >= start]),
    }


# --- rendering --------------------------------------------------------

def _line(e):
    tail = f"  {e['commit']}" if e["commit"] else ""
    return f"  {e['date'] or NO_DATE}  {e['text']}{tail}"


def render(view):
    prd = f" ({view['prd']})" if view["prd"] else ""
    lines = [f"{view['run']}{prd} as of {view['head']}"]
    lines += [f"note: {n}" for n in view["notes"]]
    for name in SECTIONS:
        lines.append(name.upper())
        lines += [_line(e) for e in view[name]]
    lines.append(f"CHANGES SINCE {view['since'] or 'the start'}")
    lines += [_line(e) for e in view["changes"]]
    return lines


def cap(lines, budget):
    """The lines that fit in `budget` bytes, newline-terminated; when
    they do not all fit, the last line kept is a marker saying so."""
    text = "".join(f"{line}\n" for line in lines)
    if len(text.encode("utf-8")) <= budget:
        return text
    marker = f"... cut at {budget} bytes; raise --budget\n"
    kept, size = [], len(marker.encode("utf-8"))
    for line in lines:
        size += len(f"{line}\n".encode("utf-8"))
        if size > budget:
            break
        kept.append(f"{line}\n")
    return "".join(kept) + marker


def _git(args):
    return runner("git")(args).stdout


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="trace.py", description="One dated view of ticket ->"
        " requirement -> decision -> feedback for a key (ADR-0092).")
    parser.add_argument("key")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--budget", type=int, default=DEFAULT_BUDGET)
    parser.add_argument("--since")
    parser.add_argument("--root", default=".")
    return parser.parse_args(argv)


def main(argv, run=gh_runner, environ=os.environ, git=_git):
    args = parse_args(argv)
    if args.since is not None and not DAY.fullmatch(args.since):
        return report(LABEL, [f"{LABEL}: --since takes YYYY-MM-DD, not"
                              f" {args.since!r}"])
    root = Path(args.root).resolve()
    state = gh_state(environ)
    runs = read_runs(root)
    record, notes, problems = resolve(root, args.key, runs, state, run)
    if problems:
        return report(LABEL, problems)
    try:
        view = build(root, args.key, record, notes, state, run, args.since,
                     git)
    except CLI_FAILURES as err:
        return report(LABEL, [f"{LABEL}: git is unavailable:"
                              f" {detail(err)}"])
    if args.json:
        print(json.dumps(view, indent=2))
    else:
        sys.stdout.write(cap(render(view), args.budget))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
