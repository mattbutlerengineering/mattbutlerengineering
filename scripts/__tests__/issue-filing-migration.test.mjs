import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const read = (relPath) => readFileSync(resolve(ROOT, relPath), "utf8");

/**
 * Workflows migrated (#3675) to call the shared file-issue-cli.mjs wrapper
 * directly instead of hand-rolling `gh issue list`/`gh issue create` dedup.
 * `revert-watchdog.yml` is deliberately excluded: it already had its own
 * Node entrypoint (`scripts/revert-watchdog.mjs`), so only that module's
 * internals changed — the workflow step's CLI invocation shape is unchanged
 * (see the separate revert-watchdog assertions below).
 */
const MIGRATED_WORKFLOWS = [
  "ai-audit.yml",
  "auto-rollback.yml",
  "backup-verify.yml",
  "claude-md-sync.yml",
  "dependency-freshness.yml",
  "mutation-testing.yml",
  "nightly-compliance.yml",
  "post-deploy-check.yml",
  "production-feedback.yml",
  "reflection-review.yml",
  "revert-rca-detection.yml",
  "synthetic-monitoring.yml",
];

describe("issue-filing migration (#3675): workflows route through file-issue-cli.mjs", () => {
  it.each(MIGRATED_WORKFLOWS)("%s calls scripts/lib/file-issue-cli.mjs", (file) => {
    const workflow = read(`.github/workflows/${file}`);
    expect(workflow).toMatch(/node scripts\/lib\/file-issue-cli\.mjs/);
  });

  it("none of the migrated workflows hand-roll a `gh issue list ... gh issue create` dedup anymore", () => {
    for (const file of MIGRATED_WORKFLOWS) {
      const workflow = read(`.github/workflows/${file}`);
      // The old pattern always paired a raw `gh issue create` with a raw
      // `gh issue list` search a few lines earlier in the same step. Any
      // remaining raw `gh issue create` call would mean a migration was missed.
      expect(workflow, `${file} should not contain a raw 'gh issue create'`).not.toMatch(
        /^\s*gh issue create/m
      );
    }
  });

  it("circuit-breaker.yml routes through a scoped second checkout of the issue-filing module, since its main checkout is sparse against the orphaned circuit-breaker-state ref", () => {
    const workflow = read(".github/workflows/circuit-breaker.yml");
    expect(workflow).toMatch(/node _issue-filing\/scripts\/lib\/file-issue-cli\.mjs/);
    expect(workflow).toMatch(/scripts\/lib\/file-issue-cli\.mjs/);
    expect(workflow).toMatch(/scripts\/lib\/issue-filing\.mjs/);
    expect(workflow).toMatch(/path: _issue-filing/);
    expect(workflow).not.toMatch(/^\s*gh issue create/m);
  });

  it("synthetic-monitoring.yml's sparse checkout picks up scripts/lib alongside docs/runbooks", () => {
    const workflow = read(".github/workflows/synthetic-monitoring.yml");
    expect(workflow).toMatch(/scripts\/lib\/file-issue-cli\.mjs/);
    expect(workflow).toMatch(/scripts\/lib\/issue-filing\.mjs/);
    expect(workflow).not.toMatch(/^\s*gh issue create/m);
  });
});

describe("issue-filing migration (#3675): revert-watchdog.yml + revert-watchdog.mjs", () => {
  it("the workflow still calls the unchanged revert-watchdog.mjs create-issue CLI shape", () => {
    const workflow = read(".github/workflows/revert-watchdog.yml");
    expect(workflow).toMatch(
      /node scripts\/revert-watchdog\.mjs create-issue --sha "\$SHA" --pr "\$PR"/
    );
  });

  it("the workflow now parses the JSON {action,issueNumber} result instead of grepping a raw URL", () => {
    const workflow = read(".github/workflows/revert-watchdog.yml");
    expect(workflow).toMatch(/jq -r '\.issueNumber'/);
    // The "Open Broken Main Issue" step (the primary node path) must parse
    // JSON now. Its sibling "Fallback" step is deliberately untouched — it's
    // a backstop for when the node path itself fails, so it still uses a raw
    // `gh issue create` + `grep -oE` (see that step's block comment).
    const primaryStep = workflow.slice(
      workflow.indexOf("- name: Open Broken Main Issue"),
      workflow.indexOf("- name: Fallback - file broken-main issue via gh CLI")
    );
    expect(primaryStep).not.toMatch(/grep -oE/);
  });

  it("revert-watchdog.mjs's createIssue routes through the shared fileIssue() module", () => {
    const mod = read("scripts/revert-watchdog.mjs");
    expect(mod).toMatch(/import \{ fileIssue \} from "\.\/lib\/issue-filing\.mjs"/);
    expect(mod).toMatch(/findPriorBrokenMainIssue/);
  });
});

describe("issue-filing migration (#3675): live-sweep.sh", () => {
  it("delegates dedup/create to file-issue-cli.mjs instead of raw gh calls", () => {
    const script = read("scripts/audit/live-sweep.sh");
    expect(script).toMatch(/node scripts\/lib\/file-issue-cli\.mjs/);
    expect(script).not.toMatch(/gh issue list/);
    expect(script).not.toMatch(/gh issue create/);
  });

  it("still respects the MAX_ISSUES cap and reports via ::notice::/::warning::", () => {
    const script = read("scripts/audit/live-sweep.sh");
    expect(script).toMatch(/MAX_ISSUES/);
    expect(script).toMatch(/::notice::Filed audit issue/);
    expect(script).toMatch(/::notice::Duplicate open audit issue exists/);
    expect(script).toMatch(/::warning::Failed to file audit issue/);
  });
});

describe("issue-filing migration (#3675): the 4 previously-undeduped producers now dedupe", () => {
  it("backup-verify.yml searches across all states so a closed dupe gets reopened, not re-created", () => {
    const workflow = read(".github/workflows/backup-verify.yml");
    expect(workflow).toMatch(/--search-label "ci-fix"/);
    expect(workflow).toMatch(/--search-state all/);
  });

  it("dependency-freshness.yml searches across all states, keyed by month", () => {
    const workflow = read(".github/workflows/dependency-freshness.yml");
    expect(workflow).toMatch(/--search-label "dependencies"/);
    expect(workflow).toMatch(/--search-state all/);
    expect(workflow).toMatch(/--contains "\$DATE"/);
  });

  it("post-deploy-check.yml searches across all states, keyed by the short commit SHA", () => {
    const workflow = read(".github/workflows/post-deploy-check.yml");
    expect(workflow).toMatch(/--search-label "ci-fix"/);
    expect(workflow).toMatch(/--search-state all/);
  });

  it("revert-watchdog.mjs's createIssue searches state=all by the priority:critical label", () => {
    const mod = read("scripts/revert-watchdog.mjs");
    expect(mod).toMatch(/"priority:critical"/);
    expect(mod).toMatch(/"--state",\s*\n?\s*"all"/);
  });
});
