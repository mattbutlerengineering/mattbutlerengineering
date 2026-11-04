import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

// A `pull_request_target` job holds a write-capable token and runs the BASE
// workflow file. It must never check out, switch to, build or execute PR-head
// content (the "pwn request"). tier-classifier-workflow.test.mjs (c) pins this
// for the classifier; this suite applies the same invariant to every
// `pull_request_target` workflow, including the auto-merge / merge-queue
// arming workflows, by parsing the YAML and scanning every step.
//
// The scanner is exercised against mutated copies below so a regression in
// the scanner itself (a rule that stops firing) fails here, not silently.

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = resolve(__dirname, "../../.github/workflows");

/**
 * Violations of "no step uses PR-head content", one string per finding.
 *
 * Rules, per step of every job:
 *  - `actions/checkout` with `with.ref` or `with.repository` (the default
 *    checkout under pull_request_target is the base repo; any override can
 *    select the head),
 *  - `gh pr checkout`, `git clone`, `gh repo clone`,
 *  - `git checkout|switch|merge|rebase|cherry-pick|pull|read-tree|am|apply`,
 *    `git worktree add`, `git restore --source` (they move PR objects into the
 *    working tree; `git fetch`/`diff`/`show` as data stay allowed),
 *  - package-manager runs (`pnpm|npm|npx|yarn|bun`) — they execute repo
 *    scripts and lifecycle hooks,
 *  - `node` on anything but a base-checkout `scripts/` file, `-`, or `-e`.
 *
 * @param {string} yamlText
 * @returns {string[]}
 */
function findHeadExecution(yamlText) {
  const doc = load(yamlText);
  const findings = [];
  for (const [jobName, job] of Object.entries(doc?.jobs ?? {})) {
    (job?.steps ?? []).forEach((step, i) => {
      const where = `${jobName}[${i}] ${step.name ?? step.uses ?? "(unnamed)"}`;
      const uses = typeof step.uses === "string" ? step.uses : "";
      if (/^actions\/checkout@/.test(uses)) {
        for (const key of ["ref", "repository"]) {
          if (step.with?.[key] !== undefined) {
            findings.push(`${where}: actions/checkout sets with.${key}`);
          }
        }
      }
      const run = typeof step.run === "string" ? step.run : "";
      const code = run.replace(/^\s*#.*$/gm, "");
      const check = (re, what) => {
        if (re.test(code)) findings.push(`${where}: ${what}`);
      };
      check(/\bgh\s+pr\s+checkout\b/, "gh pr checkout");
      check(/\bgh\s+repo\s+clone\b|\bgit\s+clone\b/, "clones a repository");
      check(
        /\bgit\s+(?:-\S+\s+)*(?:checkout|switch|merge|rebase|cherry-pick|pull|read-tree|am|apply)(?![\w-])/,
        "git switches/merges PR objects into the working tree"
      );
      check(/\bgit\s+(?:-\S+\s+)*worktree\s+add\b/, "git worktree add");
      check(/\bgit\s+(?:-\S+\s+)*restore\b[^\n]*--source/, "git restore --source");
      check(/(?:^|[\s;&|(])(?:pnpm|npm|npx|yarn|bun)\s/m, "package-manager run");
      for (const line of code.split("\n")) {
        const m = line.match(/(?:^|[\s;&|(])node\s+(\S+)/);
        if (!m) continue;
        if (m[1] === "-" || m[1] === "-e" || /^scripts\/[\w./-]+\.mjs$/.test(m[1])) continue;
        findings.push(`${where}: node runs ${m[1]}`);
      }
    });
  }
  return findings;
}

const triggersOnPullRequestTarget = (text) => {
  const on = load(text)?.on;
  if (typeof on === "string") return on === "pull_request_target";
  if (Array.isArray(on)) return on.includes("pull_request_target");
  return Boolean(on) && Object.hasOwn(on, "pull_request_target");
};

const WORKFLOWS = readdirSync(WORKFLOW_DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((file) => ({ file, text: readFileSync(resolve(WORKFLOW_DIR, file), "utf8") }))
  .filter(({ text }) => triggersOnPullRequestTarget(text));

describe("pull_request_target workflows never use PR-head content", () => {
  it("covers the classifier, both arming workflows and the dependabot workflow", () => {
    expect(WORKFLOWS.map((w) => w.file).sort()).toEqual(
      expect.arrayContaining([
        "auto-merge.yml",
        "dependabot-auto-merge.yml",
        "merge-queue.yml",
        "tier-classifier.yml",
      ])
    );
  });

  it.each(WORKFLOWS.map((w) => [w.file, w.text]))(
    "%s has no head-executing step",
    (_file, text) => {
      expect(findHeadExecution(text)).toEqual([]);
    }
  );
});

describe("findHeadExecution flags a step added to a real workflow", () => {
  const base = WORKFLOWS.find((w) => w.file === "auto-merge.yml").text;
  // Append a step to the job's `steps:` list (the last list in the file's
  // first job); the mutation is applied to an in-memory copy only.
  const withStep = (stepYaml) => {
    const doc = load(base);
    const job = Object.values(doc.jobs)[0];
    job.steps.push(load(stepYaml));
    return JSON.stringify(doc); // JSON is valid YAML
  };

  it("passes the unmutated copy", () => {
    expect(findHeadExecution(base)).toEqual([]);
  });

  it.each([
    ["gh pr checkout", `run: gh pr checkout "$PR_NUMBER"`],
    ["git switch", `run: git switch --detach FETCH_HEAD`],
    [
      "git checkout of a fetched head",
      `run: |\n  git fetch origin pull/1/head\n  git checkout FETCH_HEAD`,
    ],
    ["git worktree add", `run: git worktree add /tmp/pr FETCH_HEAD`],
    ["git merge", `run: git merge --no-edit FETCH_HEAD`],
    ["git clone of the fork", `run: git clone "$HEAD_REPO_URL" pr`],
    ["checkout with a head ref", `uses: actions/checkout@abc\nwith:\n  ref: refs/pull/1/head`],
    ["checkout of the fork", `uses: actions/checkout@abc\nwith:\n  repository: fork/repo`],
    ["node on a checked-out file", `run: node pr/scripts/anything.mjs`],
    ["pnpm install", `run: pnpm install --frozen-lockfile`],
    ["npm run", `run: npm run build`],
  ])("%s", (_label, stepYaml) => {
    expect(findHeadExecution(withStep(stepYaml)).length).toBeGreaterThan(0);
  });

  it("allows data-only git use and base-checkout node scripts", () => {
    const text = withStep(
      `run: |\n  git fetch --no-tags origin "refs/pull/\${PR}/head"\n  git diff --name-only a b\n  node scripts/merge-queue-eligibility.mjs check\n  node - <<'EOF'\n  EOF`
    );
    expect(findHeadExecution(text)).toEqual([]);
  });
});
