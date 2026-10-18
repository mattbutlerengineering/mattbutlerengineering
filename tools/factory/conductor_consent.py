#!/usr/bin/env python3
"""conductor_consent: the standing-consent merge policy (ADR-0086, issue
#679), split from conductor.py by capability (breakdown assumption 6).
It imports conductor.py's row grammar, which keeps one owner. It also
owns cover(), the one reading of what covers an item's merge — an own
answer, a train answer or standing consent — that `next` and the merge
precondition both consult (issue #734).

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
from conductor import (STANDING, answer, answers, ask, current_state,
                       item_view, stamp)

REASON = "standing consent (ADR-0086): no gate-path file changed"
# The consenting choice of a merge ask: an item's own ask, and a train
# ask that covers several items in order.
MERGE_CHOICE = "merge"
TRAIN_CHOICE = "train"
# cover()'s readings: ready to merge; behind an unmerged item on its
# train; or a merge answer the Owner owes (ADR-0086).
COVERED, WAITING, OWED = "covered", "waiting", "owed"


def standing(rows, item):
    """The item's latest `consent` row, or None."""
    found = [row for row in rows
             if row["kind"] == "consent" and row["item"] == item]
    return found[-1] if found else None


def _consents(rows, item):
    """(own, trains): the merge asks covering the item whose answer
    consents — its own asks answered `merge`, and train asks listing it
    answered `train` — in ledger order."""
    given = answers(rows)
    own, trains = [], []
    for row in rows:
        if row["kind"] != "ask" or row["ask_kind"] != "merge":
            continue
        choice = (given.get(row["id"]) or {}).get("choice")
        if row["item"] == item and choice == MERGE_CHOICE:
            own.append(row)
        elif item in row.get("covers", []) and choice == TRAIN_CHOICE:
            trains.append(row)
    return own, trains


def _approved_blobs(rows, item):
    """{gate path: blob id} approved at the item's gate asks, the later
    approval winning for a path approved twice."""
    given = answers(rows)
    approved = {}
    for row in item_view(rows, item)["asks"]:
        if row["ask_kind"] == "gate" \
                and (given.get(row["id"]) or {}).get("choice") == "approve":
            approved.update(row.get("gate_blobs") or {})
    return approved


def _train_cover(rows, item, train, blobs):
    covers = train["covers"]
    for earlier in covers[:covers.index(item)]:
        state = current_state(rows, earlier)
        if state != "merged":
            return WAITING, [f"{item} rides train {train['id']} behind"
                             f" {earlier}, which is {state}, not merged"]
    approved = _approved_blobs(rows, item)
    for path in sorted(blobs):
        if approved.get(path) != blobs[path]:
            return OWED, [f"{item}'s gate file {path} is not the one"
                          " approved at its gate ask; it needs its own"
                          " merge ask"]
    return COVERED, []


def cover(rows, item, blobs, policy=None):
    """(reading, reasons): what covers the item's merge, the one reading
    `next` and the merge precondition share (issue #734). PURE over the
    ledger's rows, `blobs` ({gate path: blob id} the item branch changes)
    and the resolved policy (None: off). Its own merge answer covers it;
    else its latest train answer, once every earlier item merged
    (WAITING until then) and with the gate blobs as approved; else a
    standing consent the policy, as it reads now, still covers. Anything
    else is OWED. The unprefixed reasons say why it is not COVERED."""
    own, trains = _consents(rows, item)
    if own:
        return COVERED, []
    if trains:
        return _train_cover(rows, item, trains[-1], blobs)
    if standing(rows, item) is None:
        return OWED, [f"no merge answer covers {item}"]
    problems = standing_problems(item, blobs, None,
                                 policy or {"enabled": False})
    return (OWED, problems) if problems else (COVERED, [])


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


# The `ask` and `answer` argv, parsed here for conductor.main (#941):
# the rows they append are conductor's, as every row is; the parsing
# sits beside the policy that reads answers back so that conductor.py
# stays under its 800-line ceiling.
def _flags(args, repeatable):
    """{flag: value or [values]} for `--flag value` pairs, or None when
    the args are not such pairs."""
    if len(args) % 2:
        return None
    flags = {}
    for flag, value in zip(args[::2], args[1::2]):
        if not flag.startswith("--"):
            return None
        if flag in repeatable:
            flags.setdefault(flag, []).append(value)
        elif flag in flags:
            return None
        else:
            flags[flag] = value
    return flags


def ask_cli(root, batch, args, now):
    """`ask`: append the ask row its flags describe and print its id;
    None (usage) when the flags are not an ask's."""
    flags = _flags(args, ("--option", "--covers"))
    needed = ("--kind", "--question", "--option", "--recommended", "--why")
    if flags is None or any(flag not in flags for flag in needed) or set(
            flags) - set(needed) - {"--item", "--covers"}:
        return None
    row, problems = ask(root, batch, now, flags.get("--item"),
                        flags["--kind"], flags["--question"],
                        flags["--option"], flags["--recommended"],
                        flags["--why"], covers=flags.get("--covers"))
    if row is not None:
        print(row["id"])
    return problems


def answer_cli(root, batch, args, now, env):
    """`answer <ask-id> <choice> [--note TEXT]`; None (usage) otherwise."""
    if len(args) < 2:
        return None
    flags = _flags(args[2:], ())
    if flags is None or set(flags) - {"--note"}:
        return None
    _, problems = answer(root, batch, now, args[0], args[1],
                         flags.get("--note", ""), env)
    return problems
