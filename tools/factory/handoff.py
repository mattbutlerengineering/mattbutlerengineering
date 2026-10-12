#!/usr/bin/env python3
"""handoff: composes the structured handoff a hard-stopped run leaves behind
(ADR-0034) — why it stopped, which acceptance criteria are done, which
remain, and how to resume. Pure compose function, no IO: callers decide
where the text goes (print, or their own gh/issue call).

Deliberately takes STRUCTURED fields — short criterion strings the run
itself tracked, never a raw issue or PR body. The ADR-0032 boundary is
drawn by the CALLER: budget_guard.hard_stop passes only structured
done/remaining criteria, the same discipline as assembler's
repo-controlled prompt substrate. compose() is a formatter behind that
boundary — it enforces nothing itself.

  python3 handoff.py <wo> <reason> <done_csv> <remaining_csv> <resume>
        Compose and print a handoff for <wo>. <done_csv>/<remaining_csv>
        are comma-separated acceptance criteria (empty string for none), a
        quick hand check outside the agent loop.
"""
import sys


def _bullets(items):
    return [f"- {item}" for item in items] if items else ["- (none)"]


def compose(wo, reason, done, remaining, resume):
    """The handoff text for `wo`'s stopped run: `reason` it stopped (last
    state, may include spend — e.g. budget_guard.decide's reason string),
    `done`/`remaining` sequences of short acceptance-criterion strings, and
    `resume` instructions for whoever (human or next dispatch) picks it up.
    Deterministic text, easy to assert on and easy to skim."""
    lines = [f"## Handoff: {wo}", "", reason.strip(), "", "### Done"]
    lines.extend(_bullets(done))
    lines += ["", "### Remaining"]
    lines.extend(_bullets(remaining))
    lines += ["", "### Resume", resume.strip()]
    return "\n".join(lines) + "\n"


def main(argv):
    if len(argv) != 5:
        print(__doc__.strip())
        return 2
    wo, reason, done_csv, remaining_csv, resume = argv
    done = [item for item in done_csv.split(",") if item]
    remaining = [item for item in remaining_csv.split(",") if item]
    print(compose(wo, reason, done, remaining, resume))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
