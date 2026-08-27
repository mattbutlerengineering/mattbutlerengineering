import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const CONFIG_PATH = resolve(__dirname, "../playwright.config.ts");
const WORKFLOW_PATHS = [
  resolve(REPO_ROOT, ".github/workflows/e2e.yml"),
  resolve(REPO_ROOT, ".github/workflows/e2e-screenshots.yml"),
];

/**
 * Regression guard for the #3955 failure class (see rialto-web's
 * e2e/workflow-coverage.test.ts for the original incident: a real,
 * assertion-bearing spec that CI silently never invoked) — adapted here
 * for hospitality's different CI wiring, not copied verbatim.
 *
 * rialto-web-e2e.yml names every spec explicitly, so its guard is "every
 * e2e/*.spec.ts is referenced by literal path in the workflow". Hospitality
 * has no such list: as of #4189, grepping .github/workflows/ for any
 * hospitality e2e spec filename returns zero matches. Both e2e.yml and
 * e2e-screenshots.yml instead run the bare `pnpm --dir apps/hospitality
 * test:e2e` script, which delegates to Playwright's own testDir
 * auto-discovery (playwright.config.ts: testDir "./e2e", testIgnore
 * covering only fixtures/journeys) — every spec dropped into e2e/ is
 * already covered the instant it's added, with no wiring step required.
 *
 * That auto-discovery is itself the invariant worth protecting, so this
 * guards against the two ways it could regress instead of asserting a
 * per-file list that doesn't describe how this app's CI actually works:
 *   1. a workflow step narrowing the bare `test:e2e` invocation to an
 *      explicit file/glob argument (silently dropping every unlisted spec,
 *      including future ones, from CI)
 *   2. playwright.config.ts's testIgnore widening to exclude a real spec
 *
 * Converting e2e.yml/e2e-screenshots.yml to rialto-web's explicit-list
 * model was deliberately left out of #4189's scope (a single-spec issue) —
 * see that PR's body for the full tradeoff.
 */
describe("hospitality e2e workflow coverage", () => {
  it("offline-shell.spec.ts exists in e2e/", () => {
    const specs = readdirSync(__dirname).filter((f) => f.endsWith(".spec.ts"));
    expect(specs).toContain("offline-shell.spec.ts");
  });

  it("offline-shell.spec.ts is not excluded by playwright.config.ts's testIgnore", () => {
    const config = readFileSync(CONFIG_PATH, "utf8");
    const testIgnoreMatch = config.match(/testIgnore:\s*\[([^\]]*)\]/);
    expect(
      testIgnoreMatch,
      "playwright.config.ts must declare testIgnore as an array literal for this check to parse it"
    ).not.toBeNull();

    const patterns = (testIgnoreMatch?.[1] ?? "")
      .split(",")
      .map((p) => p.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);

    const globToRegExp = (glob: string): RegExp =>
      new RegExp(`^${glob.replace(/\*\*/g, ".*").replace(/(?<!\.)\*/g, "[^/]*")}$`);

    const excluded = patterns.some((glob) => globToRegExp(glob).test("e2e/offline-shell.spec.ts"));
    expect(excluded).toBe(false);
  });

  it("every hospitality e2e workflow step runs the bare test:e2e script, not a narrowed file list", () => {
    for (const workflowPath of WORKFLOW_PATHS) {
      const workflow = readFileSync(workflowPath, "utf8");
      const invocationLines = workflow
        .split("\n")
        .filter((line) => line.includes("apps/hospitality test:e2e"));

      expect(
        invocationLines.length,
        `expected at least one "pnpm --dir apps/hospitality test:e2e" step in ${workflowPath}`
      ).toBeGreaterThan(0);

      for (const line of invocationLines) {
        expect(
          line.trim(),
          `${workflowPath} must invoke the bare test:e2e script (relying on Playwright's testDir ` +
            `auto-discovery) — a narrowed invocation silently drops every spec not explicitly listed, ` +
            `including offline-shell.spec.ts and any future spec. Line: "${line.trim()}"`
        ).toMatch(/^run:\s*pnpm --dir apps\/hospitality test:e2e\s*$/);
      }
    }
  });
});

/**
 * The journey suite runs from venue-journey.yml, not the PR-time e2e workflows
 * (playwright.config.ts testIgnores ./e2e/journeys). Its non-admin bootstrap
 * case authenticates as a SEPARATE account and refuses to fall back to the
 * admin credentials, so the workflow must pass those secrets through — without
 * them the step fails on every scheduled run.
 *
 * This guards the wiring, not the secret values: a spec added without its env
 * plumbing is the #3955 failure class in a different disguise.
 */
describe("venue-journey workflow wiring", () => {
  const JOURNEY_WORKFLOW = resolve(REPO_ROOT, ".github/workflows/venue-journey.yml");

  it("passes the non-admin journey credentials to the journey step", () => {
    const workflow = readFileSync(JOURNEY_WORKFLOW, "utf8");
    expect(workflow).toContain("E2E_NONADMIN_AUTH_EMAIL:");
    expect(workflow).toContain("E2E_NONADMIN_AUTH_PASSWORD:");
  });

  it("sources them from secrets rather than literals", () => {
    const workflow = readFileSync(JOURNEY_WORKFLOW, "utf8");
    for (const name of ["E2E_NONADMIN_AUTH_EMAIL", "E2E_NONADMIN_AUTH_PASSWORD"]) {
      const line = workflow.split("\n").find((l) => l.trim().startsWith(`${name}:`));
      expect(line, `${name} must be set in venue-journey.yml`).toBeDefined();
      expect(line).toMatch(new RegExp(`\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`));
    }
  });
});
