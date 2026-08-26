import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REF_PREFIX, buildRefName } from "../visual-diff-refs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW_DIR = resolve(ROOT, ".github/workflows");

/**
 * A concrete ref this feature will actually push. Every matcher below is asked
 * one question: could this workflow fire for THIS ref?
 */
const SAMPLE_REF = buildRefName({ prNumber: 4567, runId: 32873184619, runAttempt: 2 });

/**
 * Parsed textually rather than with a YAML library. `@mbe/scripts` declares no
 * YAML dependency and adding one would touch `pnpm-lock.yaml`, which is a turbo
 * `globalDependencies` entry — every task in the monorepo cache-busts for a
 * parser this guard can do without.
 *
 * The price of that choice is paid HERE, once: the normaliser below must accept
 * every shape `on:` can legally take, and must treat a shape it does not
 * recognise as a **violation** rather than as an absence. A textual parser that
 * silently answers "no push trigger found" for a spelling it never learned is
 * precisely how the first version of this guard passed `on: [push]`,
 * `on: push`, `push: { branches: ['**'] }` and any indentation other than two
 * spaces.
 */

/** Lines nested under `lines[startIdx]`, by indentation. */
function blockAt(lines, startIdx) {
  const indent = lines[startIdx].match(/^(\s*)/)[1].length;
  const out = [];
  for (const line of lines.slice(startIdx + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (line.match(/^(\s*)/)[1].length <= indent) break;
    out.push(line);
  }
  return out;
}

/** `a, b, 'c'` -> `["a", "b", "c"]`. */
function splitFlow(text) {
  return text
    .split(",")
    .map((v) => v.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function unquote(text) {
  return text.trim().replace(/^["']|["']$/g, "");
}

/**
 * A filter key that is present but in a form this parser cannot turn into a
 * list of globs — a YAML alias, a nested mapping, an empty block. Never
 * conflated with "absent": absent means the trigger is unfiltered (a hazard),
 * unreadable means the guard has no opinion (also a hazard). Both are
 * violations; neither is silence.
 */
const UNREADABLE = Symbol("unreadable");

/**
 * The `on:` section, normalised to `trigger name -> config`.
 *
 * Handles: block mapping at any indent, block sequence (`- push`), flow
 * sequence (`on: [push, …]`), bare scalar (`on: push`), a quoted `"on":` key,
 * and a per-trigger flow mapping (`push: { branches: [main] }`). Anything else
 * comes back as `{ unreadable }`.
 */
export function parseOnSection(source) {
  const lines = source.split("\n");
  const onIdx = lines.findIndex((l) => /^(?:on|"on"|'on'):/.test(l));
  if (onIdx === -1) return { triggers: new Map() };

  const inline = lines[onIdx].slice(lines[onIdx].indexOf(":") + 1).trim();

  if (inline.startsWith("{")) {
    return { unreadable: "`on:` is a flow mapping this parser does not read" };
  }
  if (inline.startsWith("[")) {
    const names = splitFlow(inline.replace(/^\[|\]$/g, ""));
    return { triggers: new Map(names.map((n) => [n, { kind: "none" }])) };
  }
  if (inline !== "" && !inline.startsWith("#")) {
    return { triggers: new Map([[unquote(inline), { kind: "none" }]]) };
  }

  const block = blockAt(lines, onIdx);
  if (block.length === 0) return { triggers: new Map() };

  const base = block[0].match(/^(\s*)/)[1].length;
  const triggers = new Map();

  for (let i = 0; i < block.length; i++) {
    if (block[i].match(/^(\s*)/)[1].length !== base) continue;
    const item = block[i].trim();

    if (item.startsWith("- ")) {
      triggers.set(unquote(item.slice(2)), { kind: "none" });
      continue;
    }

    const keyed = /^(?:([A-Za-z_][\w-]*)|"([^"]+)"|'([^']+)'):(.*)$/.exec(item);
    if (!keyed) return { unreadable: `unrecognised line under \`on:\`: ${item}` };

    const name = keyed[1] ?? keyed[2] ?? keyed[3];
    const rest = keyed[4].trim();

    if (rest.startsWith("{")) triggers.set(name, { kind: "flow", text: rest });
    else if (rest === "" || rest.startsWith("#")) {
      triggers.set(name, { kind: "block", lines: blockAt(block, i) });
    } else return { unreadable: `\`${name}:\` carries a scalar this parser does not read` };
  }

  return { triggers };
}

/** The globs listed for `key`, `null` when absent, `UNREADABLE` when unjudgeable. */
function filterValues(config, key) {
  if (config.kind === "none") return null;

  if (config.kind === "flow") {
    const bracket = new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(config.text);
    if (bracket) return splitFlow(bracket[1]);
    const scalar = new RegExp(`\\b${key}\\s*:\\s*(["'][^"']*["']|[^,}\\s]+)`).exec(config.text);
    if (scalar) return scalar[1].startsWith("*") ? UNREADABLE : [unquote(scalar[1])];
    return null;
  }

  const lines = config.lines;
  const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}:`).test(l));
  if (idx === -1) return null;

  const inline = lines[idx].slice(lines[idx].indexOf(":") + 1).trim();
  if (inline.startsWith("[")) return splitFlow(inline.replace(/^\[|\]$/g, ""));
  if (inline !== "" && !inline.startsWith("#")) {
    // A YAML alias or anchor is a reference this parser cannot resolve.
    return inline.startsWith("*") || inline.startsWith("&") ? UNREADABLE : [unquote(inline)];
  }

  const items = blockAt(lines, idx);
  if (items.length === 0) return UNREADABLE;
  if (!items.every((l) => l.trim().startsWith("- "))) return UNREADABLE;
  return items.map((l) => unquote(l.trim().slice(2)));
}

/**
 * GitHub branch-filter glob -> RegExp.
 *
 * `*` matches any character except `/`; `**` matches any character including
 * `/` — which is exactly the difference between a filter that can and cannot
 * reach `visual-diffs/pr-<N>/run-<id>-attempt-<n>`.
 */
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
    } else if (glob[i] === "*") {
      out += "[^/]*";
    } else if (glob[i] === "?") {
      out += "[^/]";
    } else {
      out += glob[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

function matchesSample(patterns) {
  const positive = patterns.filter((p) => !p.startsWith("!"));
  const negative = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
  if (!positive.some((p) => globToRegExp(p).test(SAMPLE_REF))) return false;
  return !negative.some((p) => globToRegExp(p).test(SAMPLE_REF));
}

/**
 * The guard. Returns a list of human-readable violations for one workflow
 * source — empty means this workflow cannot fire for a `visual-diffs/` ref.
 *
 * Deliberately does NOT flag a `tags:`/`tags-ignore:` filter. A tag push does
 * not create a branch ref and this feature never writes a tag, so flagging one
 * would red CI on a future release workflow for a hazard that cannot occur —
 * and a guard that fires wrongly is worse than no guard. Their *values* are
 * never read for the same reason: the presence of a tag filter is what scopes
 * the trigger away from branch refs.
 */
export function findTriggerViolations(source, fileName = "<source>") {
  const violations = [];
  const parsed = parseOnSection(source);

  if (parsed.unreadable) {
    violations.push(`${fileName}: ${parsed.unreadable} — cannot be shown safe`);
    return violations;
  }

  if (parsed.triggers.has("create")) {
    // `create` fires on every branch and tag creation and takes no filters —
    // the first push to a run-scoped ref IS a branch creation.
    violations.push(`${fileName}: a \`create:\` trigger fires for every new branch`);
  }

  const push = parsed.triggers.get("push");
  if (push === undefined) return violations;

  const branches = filterValues(push, "branches");
  const branchesIgnore = filterValues(push, "branches-ignore");

  if (branches === UNREADABLE || branchesIgnore === UNREADABLE) {
    violations.push(`${fileName}: \`push\`'s branch filter is in a form the guard cannot read`);
    return violations;
  }

  if (branches) {
    if (matchesSample(branches)) {
      violations.push(
        `${fileName}: \`push.branches\` [${branches.join(", ")}] matches ${SAMPLE_REF}`
      );
    }
    return violations;
  }

  if (branchesIgnore) {
    if (!branchesIgnore.some((p) => globToRegExp(p).test(SAMPLE_REF))) {
      violations.push(
        `${fileName}: \`push.branches-ignore\` [${branchesIgnore.join(", ")}] does not exclude ${SAMPLE_REF}`
      );
    }
    return violations;
  }

  // A push trigger scoped to tags only never fires for a branch ref.
  if (filterValues(push, "tags") || filterValues(push, "tags-ignore")) return violations;

  violations.push(`${fileName}: \`push:\` has no branch filter, so it fires for every branch`);
  return violations;
}

// ---------------------------------------------------------------------------
// The guard, against the repo as it stands
// ---------------------------------------------------------------------------

describe("visual-diffs ref namespace cannot start a CI run", () => {
  const files = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));

  it("reads every workflow file in .github/workflows/", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("finds no trigger that could fire for a visual-diffs/ ref", () => {
    // Without this guard, a later `push: branches: ['**']` would silently turn
    // every failing visual run into a CI storm — and the design's whole
    // trigger-safety argument is a fact about the repo today, not a property of
    // the design.
    const violations = files.flatMap((file) =>
      findTriggerViolations(readFileSync(resolve(WORKFLOW_DIR, file), "utf8"), file)
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("parses every workflow — an unreadable file is a violation, never silence", () => {
    // The normaliser fails closed, so a shape it cannot read reds this scan.
    // Asserting zero unreadable files here is what makes the empty violation
    // list above mean "no hazard" rather than "gave up on 40 files".
    const unreadable = files.filter(
      (file) => parseOnSection(readFileSync(resolve(WORKFLOW_DIR, file), "utf8")).unreadable
    );
    expect(unreadable, unreadable.join("\n")).toEqual([]);
  });

  it("actually finds push triggers to judge, in more than one workflow", () => {
    // A parser that recognised no `push:` at all would also report no
    // violations. This is the count that separates the two.
    const withPush = files.filter((file) =>
      parseOnSection(readFileSync(resolve(WORKFLOW_DIR, file), "utf8")).triggers?.has("push")
    );
    expect(withPush.length).toBeGreaterThan(5);
  });

  it("keys on the exported ref prefix, so the namespace and the guard cannot drift", () => {
    expect(SAMPLE_REF.startsWith(`${REF_PREFIX}/`)).toBe(true);
  });

  it("actually reaches the real push triggers rather than passing vacuously", () => {
    // A green scan is only evidence if the parser found something to judge.
    // Strip the branch filter out of a REAL workflow and the same call must go
    // red — otherwise "no violations" means "parsed nothing".
    const real = readFileSync(resolve(WORKFLOW_DIR, "rialto-web-e2e.yml"), "utf8");
    expect(findTriggerViolations(real, "rialto-web-e2e.yml")).toEqual([]);

    const unfiltered = real.replace(/^ {4}branches: \[main\]$/m, "    branches: ['**']");
    expect(unfiltered).not.toBe(real);
    expect(findTriggerViolations(unfiltered, "rialto-web-e2e.yml")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The guard can fail — without this half it is decorative
// ---------------------------------------------------------------------------

describe("findTriggerViolations detects the hazards it exists for", () => {
  it("flags push: branches: ['**']", () => {
    const source = "name: X\non:\n  push:\n    branches: ['**']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a block-sequence branches list containing **", () => {
    const source = "name: X\non:\n  push:\n    branches:\n      - main\n      - '**'\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a branch filter naming the prefix directly", () => {
    const source = "name: X\non:\n  push:\n    branches: ['visual-diffs/**']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a push: trigger with no branch filter at all", () => {
    const source = "name: X\non:\n  push:\n    paths:\n      - 'src/**'\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags branches-ignore that does not exclude the prefix", () => {
    const source = "name: X\non:\n  push:\n    branches-ignore: ['gh-pages']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a create: trigger", () => {
    const source = "name: X\non:\n  create:\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("does NOT flag branches: [main] — a single-segment glob cannot cross a /", () => {
    const source = "name: X\non:\n  push:\n    branches: [main]\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });

  it("does NOT flag branches: ['*'] — * stops at a slash", () => {
    const source = "name: X\non:\n  push:\n    branches: ['*']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });

  it("does NOT flag branches-ignore that excludes the prefix", () => {
    const source = "name: X\non:\n  push:\n    branches-ignore: ['visual-diffs/**']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });

  it("does NOT flag a tags-only push trigger", () => {
    const source = "name: X\non:\n  push:\n    tags: ['v*']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });

  it("does NOT flag a workflow with no push trigger", () => {
    const source = "name: X\non:\n  pull_request:\n    branches: ['**']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Every way an unfiltered push trigger can be written.
//
// The guard originally recognised `push:` only as a block key at EXACTLY two
// spaces of indentation, under an `on:` whose value was empty. Probing it with
// the three likeliest alternative spellings — a flow sequence, a scalar, a flow
// mapping — returned no violations for all three: a workflow that fires on
// every branch would have sailed past a guard whose entire purpose is to catch
// exactly that. A guard that passes the hazard it exists for is worse than no
// guard, because the design's trigger-safety argument cites it as evidence.
// ---------------------------------------------------------------------------

describe("findTriggerViolations normalises every shape `on:` can take", () => {
  it("flags a flow-sequence on: [push, pull_request]", () => {
    const source = "name: X\non: [push, pull_request]\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a scalar on: push", () => {
    const source = "name: X\non: push\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a block-sequence on: with a push item", () => {
    const source = "name: X\non:\n  - push\n  - pull_request\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a flow-mapping push: { branches: ['**'] }", () => {
    const source = "name: X\non:\n  push: { branches: ['**'] }\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("reads a flow-mapping push whose filter IS safe", () => {
    const source = "name: X\non:\n  push: { branches: [main] }\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });

  it("flags a push: block indented four spaces", () => {
    const source = "name: X\non:\n    push:\n        branches: ['**']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags an unfiltered push: block indented four spaces", () => {
    const source = "name: X\non:\n    push:\n        paths: ['src/**']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a create: indented four spaces", () => {
    const source = "name: X\non:\n    create:\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a top-level flow mapping — a shape it cannot judge is a violation", () => {
    const source = "name: X\non: { push: { branches: ['**'] } }\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("flags a branches filter it cannot read rather than assuming it is safe", () => {
    const source = "name: X\non:\n  push:\n    branches: *default_branches\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it('reads a quoted "on": key', () => {
    const source = "name: X\n\"on\":\n  push:\n    branches: ['**']\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toHaveLength(1);
  });

  it("does NOT flag a flow sequence with no push", () => {
    const source = "name: X\non: [pull_request, workflow_dispatch]\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });

  it("does NOT flag the scalar on: pull_request_target this repo actually uses", () => {
    const source = "name: X\non: pull_request_target\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });

  it("does NOT flag a scalar branches: main — a plain string is still a filter", () => {
    const source = "name: X\non:\n  push:\n    branches: main\njobs: {}\n";
    expect(findTriggerViolations(source, "synthetic.yml")).toEqual([]);
  });
});
