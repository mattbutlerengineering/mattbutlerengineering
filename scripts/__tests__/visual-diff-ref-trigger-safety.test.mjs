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
const SAMPLE_REF = buildRefName({ prNumber: 4567, runId: 32873184619 });

/**
 * Parsed textually rather than with a YAML library, matching the precedent in
 * `ci-node-matrix.test.mjs` and `drift-fix-workflow.test.mjs`: nothing in
 * `scripts/` depends on one, and the shapes here are plain block/flow
 * sequences with no anchors or merges.
 */
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

/** Values of `key:` inside `lines` — inline `[a, b]` or a following `- x` list. */
function listValue(lines, key) {
  const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}:`).test(l));
  if (idx === -1) return null;

  const inline = lines[idx].slice(lines[idx].indexOf(":") + 1).trim();
  if (inline.startsWith("[")) {
    return inline
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((v) => v.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  return blockAt(lines, idx)
    .filter((l) => l.trim().startsWith("- "))
    .map((l) =>
      l
        .trim()
        .slice(2)
        .trim()
        .replace(/^["']|["']$/g, "")
    );
}

/**
 * GitHub branch-filter glob -> RegExp.
 *
 * `*` matches any character except `/`; `**` matches any character including
 * `/` — which is exactly the difference between a filter that can and cannot
 * reach `visual-diffs/pr-<N>/run-<id>`.
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
 * and a guard that fires wrongly is worse than no guard.
 */
export function findTriggerViolations(source, fileName = "<source>") {
  const lines = source.split("\n");
  const violations = [];

  const onIdx = lines.findIndex((l) => /^on:\s*$/.test(l) || /^on:\s*\S/.test(l));
  if (onIdx === -1) return violations;
  const onBlock = blockAt(lines, onIdx);

  if (onBlock.some((l) => /^\s{2}create:\s*$/.test(l))) {
    // `create` fires on every branch and tag creation and takes no filters —
    // the first push to a run-scoped ref IS a branch creation.
    violations.push(`${fileName}: a \`create:\` trigger fires for every new branch`);
  }

  const pushIdx = onBlock.findIndex((l) => /^\s{2}push:\s*$/.test(l));
  if (pushIdx === -1) return violations;
  const pushBlock = blockAt(onBlock, pushIdx);

  const branches = listValue(pushBlock, "branches");
  const branchesIgnore = listValue(pushBlock, "branches-ignore");
  const tags = listValue(pushBlock, "tags");
  const tagsIgnore = listValue(pushBlock, "tags-ignore");

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
  if (tags || tagsIgnore) return violations;

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
