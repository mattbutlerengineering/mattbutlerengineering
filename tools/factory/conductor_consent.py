#!/usr/bin/env python3
"""conductor_consent: the standing-consent merge policy (ADR-0086, issue
#679), split from conductor.py by capability (breakdown assumption 6).
It imports conductor.py's row grammar, which keeps one owner.

factory.json's conductor.standing_consent is OFF unless the Owner turns
it on. When on, `next` records a `consent` row for a shipped item that
no Owner merge ask covers, and the merge turn then needs no in-session
answer for it. The policy covers an item only when:

- it changes no gate-path file (conductor_flow.GATE_PATH): a gate-path
  item always needs the Owner's own merge answer (ADR-0085);
- its issue carries one of the tier labels, when tier_labels is
  non-empty.

The rest of what ADR-0086 requires is not this module's to judge, because
every merge already holds it whatever its consent: the merge precondition
refuses an item without a passed review by a reviewer run distinct from
its author runs, with its reviewed head; and the merge turn lands only
after the check runs on the updated head are green.
"""
from cli import gh_read, label_names
from conductor import STANDING, stamp

REASON = "standing consent (ADR-0086): no gate-path file changed"


def standing(rows, item):
    """The item's latest `consent` row, or None."""
    found = [row for row in rows
             if row["kind"] == "consent" and row["item"] == item]
    return found[-1] if found else None


def standing_problems(item, blobs, labels, policy):
    """Why the standing policy does not cover `item`, unprefixed; empty
    when it does. PURE over the gate files the item branch changes
    (`blobs`), its issue's labels (None when no tier list asks for
    them) and the resolved policy."""
    if not policy["enabled"]:
        return ["standing consent is off in factory.json"]
    problems = []
    if blobs:
        problems.append(f"{item} changes gate-path file(s)"
                        f" {', '.join(sorted(blobs))}; standing consent"
                        " never covers a gate-path item")
    tiers = policy["tier_labels"]
    if tiers and labels is not None and not set(tiers) & set(labels):
        problems.append(f"{item}'s issue carries none of the tier labels"
                        f" {', '.join(tiers)}")
    return problems


def consent_row(now, item, labels, policy):
    """The `consent` row `next` writes for a covered item."""
    tiers = sorted(set(policy["tier_labels"]) & set(labels or []))
    reason = REASON + (f"; tier label {', '.join(tiers)}" if tiers else "")
    return {"at": stamp(now), "kind": "consent", "item": item,
            "policy": STANDING, "reason": reason}


def issue_labels(gh, item, policy):
    """(the item's issue labels, problems), read only when the policy
    names tier labels; (None, []) otherwise."""
    if not policy["tier_labels"]:
        return None, []
    result = gh_read(["issue", "view", item[1:], "--json", "labels"],
                     f"gh issue view {item}", "cd", run=gh, expect=dict)
    if result.problems:
        return None, result.problems
    return label_names(result.value), []
