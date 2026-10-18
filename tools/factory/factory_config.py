#!/usr/bin/env python3
"""factory_config: the one reader of the factory config (ADR-0034,
ADR-0037) — .github/factory.json when stamped, else the template payload
copy — and the fail-closed accessors over its fields.

Before this seam the config had four runtime homes: assembler.py owned
load_config and the band->model resolver, budget_guard.py and
cost_report.py each grew a sibling resolve_* — and both imported the
DISPATCHER for the privilege of reading a config file. The schema now
lives behind one interface; factory.json stays the single routing source
of truth (ADR-0004), resolved in exactly one place, and detector F
(gates.check_config_shape) remains the CI gate over the whole shape.

This module also owns the vocabularies its accessors resolve over
(ADR-0048): BANDS, the legal routing bands; EFFORTS, the legal values of
the optional effort table (PRD-0013); and ARTIFACT_HOMES /
artifact_paths, the installed-vs-payload location grammar every
dual-home factory artifact is read through.

Conventions match gates.py: functions return (value, problems) with
config:-prefixed problem strings; a field the config does not cover is a
problem, never a silent default.
"""
import math
import re
import shlex
from pathlib import Path

from cli import read_file

# The routing-band vocabulary (ADR-0034): the exact key set factory.json's
# routing table must map. One home (ADR-0048) — gates' detector F and the
# WO-0007 acceptance evidence read this tuple. resolve_model stays
# fail-closed per lookup, so a band outside the vocabulary is already a
# problem there without a second membership check.
BANDS = ("mechanical", "implementation", "architecture_review")

# The effort vocabulary (PRD-0013): the values factory.json's optional
# effort table may map a band to, the harness's own --effort choices.
EFFORTS = ("low", "medium", "high", "xhigh", "max")

# The installed-vs-payload location grammar (ADR-0048): artifact name ->
# (installed rel to the repo root, payload rel to factory/ — the manifest
# key grammar of gates.manifest_files). The .github/ asymmetry is stated
# here once: factory.json sits at the payload root and is mapped at stamp
# time (factory_init.INSTALL_MAP derives from this table); labels.json
# already sits under templates/.github/, so the stamp's default strip
# rule lands it installed.
ARTIFACT_HOMES = {
    "factory.json": (".github/factory.json", "templates/factory.json"),
    "labels.json": (".github/labels.json",
                    "templates/.github/labels.json"),
}


def artifact_paths(root, name):
    """The ordered candidate homes of a dual-home factory artifact:
    ((installed path, True), (payload path, False)) — installed first,
    the read order every runtime loader uses (load here,
    label_sync.load_labels); detector F checks every candidate. `name`
    must be an ARTIFACT_HOMES key — call sites pass literals, so a typo
    is a KeyError at test time, not a runtime state."""
    installed, payload = ARTIFACT_HOMES[name]
    root = Path(root)
    return ((root / installed, True),
            (root / "factory" / payload, False))


def load(root):
    """(the factory config, problems): the installed .github/factory.json
    when stamped, else the template payload copy — the first existing
    candidate in artifact_paths' installed-first order, same fallback
    shape as label_sync.load_labels."""
    root = Path(root)
    candidates = artifact_paths(root, "factory.json")
    # The first home that is there decides, broken or not: only absence
    # moves on to the next. dict, because every accessor below subscripts
    # the config — detector F asks read_file the same question, so the
    # runtime reader and the CI gate cannot disagree about it (ADR-0075).
    for path, _ in candidates:
        config, problem = read_file(
            path, path.relative_to(root).as_posix(), dict)
        if problem:
            return None, [f"config: {problem}"]
        if config is not None:
            return config, []
    homes = " or ".join(p.relative_to(root).as_posix() for p, _ in candidates)
    return None, [f"config: missing factory.json ({homes})"]


def resolve_model(band, config):
    """(the model id for this band, problems) through factory.json's routing
    table — the single routing source of truth (ADR-0004/0034). A band the
    table does not cover is a problem, never a silent default."""
    routing = config.get("routing")
    if not isinstance(routing, dict):
        return None, ["config: factory.json has no routing table"]
    model = routing.get(band)
    if not isinstance(model, str) or not model:
        return None, [
            f"config: factory.json routes no model to the {band} band"]
    return model, []


def resolve_effort(band, config):
    """(the effort for this band, problems) through factory.json's effort
    table, which sits beside routing (PRD-0013). Fail-closed like
    resolve_model: no table, or a band it does not map to an EFFORTS
    value, is a problem, never a silent default."""
    efforts = config.get("effort")
    if not isinstance(efforts, dict):
        return None, ["config: factory.json has no effort table"]
    effort = efforts.get(band)
    if effort not in EFFORTS:
        return None, [
            f"config: factory.json names no effort for the {band} band"]
    return effort, []


def _positive_number(value):
    """True for a finite positive int/float that is not a bool — True is
    an int in Python, and a bool where a dollar amount belongs is a typo.

    Finite because an infinite amount is not a ceiling: `total >= inf` is
    false at every spend, so an infinite monthly_cap_usd would leave
    ADR-0034's breaker returning CONTINUE forever, and json.loads accepts
    a bare Infinity literal straight from factory.json. cost_report.decide
    already refuses a non-finite SPEND with that reasoning; the comparison
    has two sides. NaN needs no clause — `nan > 0` is already false."""
    return (not isinstance(value, bool)
            and isinstance(value, (int, float))
            and math.isfinite(value) and value > 0)


def resolve_budget(size, config):
    """(budget_usd, problems): <size>'s dollar ceiling from factory.json's
    budgets_usd table (ADR-0034). A size the table does not cover, or a
    non-positive budget, is a problem, never a silent default."""
    budgets = config.get("budgets_usd")
    if not isinstance(budgets, dict):
        return None, ["config: factory.json has no budgets_usd table"]
    if not _positive_number(budgets.get(size)):
        return None, [
            f"config: factory.json names no positive budget for size {size!r}"]
    return budgets[size], []


def resolve_cap(config):
    """(cap_usd, problems): factory.json's monthly_cap_usd — the single
    repo-wide ceiling ADR-0034's circuit breaker checks total spend
    against, same fail-closed shape as resolve_budget's per-size lookup."""
    if not _positive_number(config.get("monthly_cap_usd")):
        return None, ["config: factory.json names no positive monthly_cap_usd"]
    return config["monthly_cap_usd"], []


# The Conductor's optional table (issue #678): the gate command its
# Workers may run and its merge turn runs, in the item worktree. Absent,
# it is this repo's own gate. One command, run without a shell: it is
# also the Worker's one Bash(...) permission, so a shell operator would
# widen what that permission covers.
#
# It also holds the standing-consent merge policy (ADR-0086, #679),
# OFF unless the table says otherwise: a Conductor merge with no Owner
# answer, for an item that changes no gate-path file and, when
# tier_labels is non-empty, whose issue carries one of them.
#
# And it holds the consumer's issue-label map (#700): `type_labels` maps
# a label the repo already uses to the item type it plans as. Absent,
# the Conductor's own type: rule applies unchanged; present, it replaces
# that rule. The order type stays the ready label's alone, so the map's
# values are the two issue-sized types. `size_labels` does the same for
# the budget sizes, and `default_size` sizes an issue that carries no
# size label at all. `defer_labels` (#711) lists labels the repo uses to
# say "not now" (blocked, needs-review): an issue carrying one is
# deferred with the label named, whatever else it carries. Absent,
# nothing defers for its labels alone.
#
# `step_weights` (#724) weights how an item's size budget splits across
# its steps as their ceilings. The default weighs a step by the band its
# charter declares (factory/agents): spec and review, the two steps at
# the top band, get three shares each and every other step one. Spec
# drives the whole run from idea to breakdown there, and an even share
# ran out of budget on 3 runs of 3; review reads everything the build
# rows produced at the same band's price, and verify's one share ended
# 2 review runs of 2 before the reviewer reviewed (#936). The band is
# read here by step name rather than resolved per step: weights are
# config that `calibrate` scales with no agents directory in hand, so a
# charter a consumer re-bands keeps its step's weight until the Owner
# sets it. A configured weight replaces that step's default; the rest
# keep theirs.
#
# `calibrate_floor` (#940) is the fewest samples `calibrate` suggests a
# step weight or a size budget from, a positive integer. Five is many
# batches for a single-owner repo, so the Owner sets it; below it the
# counters still warn (conductor_calibrate.ceiling_warnings).
CONDUCTOR_KEYS = ("gate_command", "standing_consent", "type_labels",
                  "size_labels", "default_size", "defer_labels",
                  "step_weights", "worktree_setup", "calibrate_floor")
DEFAULT_STEP_WEIGHTS = {"spec": 3, "build": 1, "verify": 1, "review": 3,
                        "ship": 1}
DEFAULT_CALIBRATE_FLOOR = 5
LABEL_ITEM_TYPES = ("feature", "fix")
SIZES = ("S", "M", "L")


def _one_of(values):
    """`a or b`, `a, b or c`: a vocabulary as a problem string spells it."""
    return " or ".join(filter(None, (", ".join(values[:-1]), values[-1])))
STANDING_KEYS = ("enabled", "tier_labels")
DEFAULT_GATE_COMMAND = "make check"
SHELL_OPERATOR = re.compile(r"[;&|<>`$\n]")


def _gate_argv(command):
    """The gate command as argv, or None when it is not one command."""
    if not isinstance(command, str) or SHELL_OPERATOR.search(command):
        return None
    try:
        argv = shlex.split(command)
    except ValueError:
        return None
    return argv or None


def conductor_problems(config):
    """Value-grammar problems for factory.json's optional `conductor`
    table, unprefixed: the one home of its rules, which config_problems
    (detector F) and the resolvers below both apply."""
    if "conductor" not in config:
        return []
    table = config["conductor"]
    if not isinstance(table, dict):
        return ["conductor must be an object"]
    problems = []
    unknown = sorted(set(table) - set(CONDUCTOR_KEYS))
    if unknown:
        problems.append(f"conductor has unknown key(s): {', '.join(unknown)}")
    if "gate_command" in table and _gate_argv(table["gate_command"]) is None:
        problems.append("conductor.gate_command must be one command with no"
                        " shell operators")
    if "standing_consent" in table:
        problems += _standing_problems(table["standing_consent"])
    if "type_labels" in table:
        problems += _label_map_problems("type_labels", table["type_labels"],
                                        LABEL_ITEM_TYPES)
    if "size_labels" in table:
        problems += _label_map_problems("size_labels", table["size_labels"],
                                        SIZES)
    if "default_size" in table and table["default_size"] not in SIZES:
        problems.append(f"conductor.default_size must be {_one_of(SIZES)}")
    if ("defer_labels" in table
            and not _label_list(table["defer_labels"])):
        problems.append("conductor.defer_labels must be a list of distinct"
                        " label names")
    if "step_weights" in table:
        problems += _step_weight_problems(table["step_weights"])
    if "worktree_setup" in table and not _argv(table["worktree_setup"]):
        problems.append("conductor.worktree_setup must be a non-empty list"
                        " of non-blank argument strings")
    if ("calibrate_floor" in table
            and not _positive_integer(table["calibrate_floor"])):
        problems.append("conductor.calibrate_floor must be a positive"
                        " integer")
    return problems


def _positive_integer(value):
    """True for an int of 1 or more that is not a bool: a count, where
    True (an int in Python) would be a typo, as _positive_number rules
    for a dollar amount."""
    return (not isinstance(value, bool) and isinstance(value, int)
            and value >= 1)


def _argv(value):
    """True when `value` is a non-empty list of non-blank strings."""
    return (isinstance(value, list) and bool(value)
            and all(isinstance(arg, str) and arg.strip() for arg in value))


def _step_weight_problems(weights):
    """Problems for conductor.step_weights: known steps to positive
    numbers."""
    prefix, steps = "conductor.step_weights", tuple(DEFAULT_STEP_WEIGHTS)
    if not isinstance(weights, dict):
        return [f"{prefix} must map {_one_of(steps)} to positive numbers"]
    unknown = sorted(set(weights) - set(steps))
    if unknown:
        return [f"{prefix} has unknown step(s): {', '.join(unknown)}"]
    return [f"{prefix}.{step} must be a positive number"
            for step, weight in weights.items()
            if not _positive_number(weight)]


def _label_list(value):
    """True when `value` is a list of distinct non-blank label names."""
    return (isinstance(value, list)
            and all(isinstance(name, str) and name.strip()
                    for name in value)
            and len(set(value)) == len(value))


def _label_map_problems(key, table, values):
    """Problems for a conductor map from label names to `values`."""
    prefix, kinds = f"conductor.{key}", _one_of(values)
    if not isinstance(table, dict):
        return [f"{prefix} must map label names to {kinds}"]
    if not all(isinstance(label, str) and label.strip() for label in table):
        return [f"{prefix} keys must be non-blank label names"]
    return [f"{prefix}.{label} must be {kinds}"
            for label, kind in table.items() if kind not in values]


def _standing_problems(policy):
    prefix = "conductor.standing_consent"
    if not isinstance(policy, dict):
        return [f"{prefix} must be an object"]
    problems = []
    unknown = sorted(set(policy) - set(STANDING_KEYS))
    if unknown:
        problems.append(f"{prefix} has unknown key(s): {', '.join(unknown)}")
    if not isinstance(policy.get("enabled", False), bool):
        problems.append(f"{prefix}.enabled must be true or false")
    if not _label_list(policy.get("tier_labels", [])):
        problems.append(f"{prefix}.tier_labels must be a list of distinct"
                        " label names")
    return problems


def resolve_standing_consent(config):
    """({"enabled", "tier_labels"}, problems): factory.json's
    conductor.standing_consent, OFF when absent. A malformed table is a
    problem, never a default, so a typo cannot read as consent."""
    problems = conductor_problems(config)
    if problems:
        return None, [f"config: factory.json {problem}"
                      for problem in problems]
    policy = config.get("conductor", {}).get("standing_consent", {})
    return {"enabled": policy.get("enabled", False),
            "tier_labels": list(policy.get("tier_labels", []))}, []


def _conductor_value(config, key):
    """(conductor.<key>, problems): None when absent. A malformed
    conductor table is a problem, never a default, so a typo cannot
    silently plan or defer an issue."""
    problems = conductor_problems(config)
    if problems:
        return None, [f"config: factory.json {problem}"
                      for problem in problems]
    return config.get("conductor", {}).get(key), []


def resolve_type_labels(config):
    """(label -> item type, problems): factory.json's
    conductor.type_labels, None when absent (the caller's type: rule
    applies)."""
    table, problems = _conductor_value(config, "type_labels")
    return (dict(table) if table is not None else None), problems


def resolve_size_labels(config):
    """(label -> size, problems): factory.json's conductor.size_labels,
    None when absent (the caller's size: rule applies)."""
    table, problems = _conductor_value(config, "size_labels")
    return (dict(table) if table is not None else None), problems


def resolve_default_size(config):
    """(the size for an issue with no size label, problems): factory.json's
    conductor.default_size, None when absent (such an issue defers)."""
    return _conductor_value(config, "default_size")


def resolve_defer_labels(config):
    """(label names, problems): factory.json's conductor.defer_labels,
    None when absent (no issue defers for its labels alone)."""
    names, problems = _conductor_value(config, "defer_labels")
    return (list(names) if names is not None else None), problems


def resolve_step_weights(config):
    """(step -> weight, problems): DEFAULT_STEP_WEIGHTS with factory.json's
    conductor.step_weights laid over it."""
    table, problems = _conductor_value(config, "step_weights")
    if problems:
        return None, problems
    return {**DEFAULT_STEP_WEIGHTS, **(table or {})}, []


def resolve_calibrate_floor(config):
    """(the fewest samples calibrate suggests from, problems):
    factory.json's conductor.calibrate_floor, DEFAULT_CALIBRATE_FLOOR
    when absent (#940)."""
    floor, problems = _conductor_value(config, "calibrate_floor")
    if problems:
        return None, problems
    return (DEFAULT_CALIBRATE_FLOOR if floor is None else floor), []


def resolve_worktree_setup(config):
    """(argv, problems): factory.json's conductor.worktree_setup, the
    command run in each item worktree before its Worker launches (#850),
    None when absent (no setup runs)."""
    argv, problems = _conductor_value(config, "worktree_setup")
    return (list(argv) if argv is not None else None), problems


def resolve_gate_command(config):
    """(the gate command as argv, problems): factory.json's
    conductor.gate_command, DEFAULT_GATE_COMMAND when absent. A malformed
    table is a problem, never a silent default."""
    problems = conductor_problems(config)
    if problems:
        return None, [f"config: factory.json {problem}"
                      for problem in problems]
    table = config.get("conductor", {})
    return _gate_argv(table.get("gate_command", DEFAULT_GATE_COMMAND)), []


def config_problems(config):
    """Field-grammar problems for a parsed factory config, unprefixed.

    The one home for what a valid field VALUE is (twin of
    cost_ledger.line_problems): the resolve_* accessors above apply the
    same rules fail-closed per lookup, and gates' detector F prefixes
    these problems and layers its whole-shape key-set cross-checks
    (exactly S/M/L, exactly the routed bands) on top. Key-set
    completeness stays with the gate — a missing entry is a shape
    concern, not a value one.
    """
    problems = []
    budgets = config.get("budgets_usd")
    if isinstance(budgets, dict):
        problems += [f"budgets_usd.{size} must be a positive number"
                     for size, value in budgets.items()
                     if not _positive_number(value)]
    routing = config.get("routing")
    if isinstance(routing, dict):
        problems += [f"routing.{route} must name a model id"
                     for route, model in routing.items()
                     if not isinstance(model, str) or not model]
    wip = config.get("wip_cap")
    if isinstance(wip, bool) or not isinstance(wip, int) or wip < 1:
        problems.append("wip_cap must be a positive integer")
    if not _positive_number(config.get("monthly_cap_usd")):
        problems.append("monthly_cap_usd must be a positive number")
    efforts = config.get("effort")
    if isinstance(efforts, dict):
        problems += [f"effort.{band} is not a band ({', '.join(BANDS)})"
                     for band in efforts if band not in BANDS]
        problems += [f"effort.{band} must be one of {', '.join(EFFORTS)}"
                     for band, effort in efforts.items()
                     if effort not in EFFORTS]
    elif "effort" in config:
        problems.append("effort must map bands to efforts")
    return problems + conductor_problems(config)
