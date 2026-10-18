#!/usr/bin/env python3
"""conductor_landed: a pull request merged outside the batch (#938,
ADR-0105) — the pure vocabulary and reads over the ledger's rows that
conductor_flow's survey, conductor_next's per-tick read and
conductor_close's reconcile share, split from conductor_flow by
capability at its 800-line ceiling. A consumer's own merge train merged
four item PRs while the items were mid-build, and the ledger never
knew; `_deliver` then opened a second PR under the first's title, and
a blocked item whose PR the Owner merged by hand stayed blocked in the
scorecard.

The item stalls with cause merge-drift — the repo's merge drifted from
the ledger's — behind an ask offering retry (the rest on a fresh PR
that names the merged one), merged (that PR is the item's merge) or
block. A `merged` answer writes stalled → merged; close writes
blocked → merged for an item whose PR merged after its block. Both
carry the PR, its merge commit, and no checks of the Conductor's own.
"""
from conductor import view

MERGED = "merged"
OPTIONS = ["retry", MERGED, "block"]
CAUSE = "merge-drift"
# The states whose item PR `next` reads each tick: between spec and
# reviewed. A shipped item is the merge turn's (#807).
STATES = ("spec", "awaiting-gate", "build", "verify", "review", "reviewed")
REASON = "PR #{pr} merged outside the batch"
MERGE_REASON = "merged outside the batch as PR #{pr}"
REST_WHY = ("the repo merged the item's PR without the Conductor's merge"
            " turn, before its build was done: retry builds the rest on a"
            " fresh PR that names PR #{pr}; merged records PR #{pr} as the"
            " item's merge")
DONE_WHY = ("the repo merged the item's PR without the Conductor's merge"
            " turn, after its build was done: merged records PR #{pr} as"
            " the item's merge; retry reruns {state} on a fresh PR")


def answered_merged(found):
    """True for a stalled item (its view) whose stall was answered
    `merged`: the next survey records the PR as its merge."""
    resumed = found["resumed"]
    return (found["state"] == "stalled" and resumed is not None
            and resumed["choice"] == MERGED)


def due(rows):
    """The items whose merged PR `next` reads this tick: one in STATES
    that is neither in flight nor behind an ask — its next step would
    launch — and a stalled one answered `merged`. A stalled one
    answered retry continues as the Owner chose, unread."""
    read = view(rows)
    found = [(entry["item"], read["items"][entry["item"]])
             for entry in (read["plan"] or {}).get("items", [])]
    return [item for item, one in found
            if one["pending"] is None and not one["in_flight"]
            and (one["state"] in STATES or answered_merged(one))]


def asked(rows, item, pr):
    """True once the item stalled for PR `pr` merged outside the batch:
    the Owner answered that ask, or will; it is never raised twice."""
    return any(row["kind"] == "state" and row["item"] == item
               and row["to"] == "stalled" and row.get("cause") == CAUSE
               and row.get("pr") == pr for row in rows)


def merge(landed):
    """(reason, state-row fields) of the merged row the item gets: the
    PR and its merge commit, and no checks of the Conductor's own."""
    return MERGE_REASON.format(pr=landed["pr"]), {
        "pr": landed["pr"], "sha": landed["sha"], "checks": {}}


def advice(state, unchecked, pr):
    """(recommended, why) for the stall: `merged` once the build is
    done — the item is past build, or no breakdown row is unchecked —
    and `retry` while rows remain, which a fresh PR carries."""
    done = (state not in ("spec", "awaiting-gate", "build")
            or (state == "build" and unchecked == 0))
    why = (DONE_WHY if done else REST_WHY).format(pr=pr, state=state)
    return (MERGED if done else "retry"), why
