import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isKnownMarketingPath } from "../../infrastructure/worker/marketing-routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/post-deploy-check.yml"), "utf8");

/**
 * Regression guard for the "Poll for deploy to land" step's poll budget and
 * trigger-scoping fix (#5124; see #5098, #5123, #5133, #5134, #5153 for the
 * duplicate chain). Parsed textually rather than with a YAML library, matching
 * the precedent in pulumi-cli-pin.test.mjs: these are plain scalars with no
 * anchors or flow mappings to get wrong.
 */
describe("post-deploy-check.yml 'Poll for deploy to land' step", () => {
  it("keeps the 12-minute poll budget (48 attempts x 15s)", () => {
    // Pins the numbers directly in the workflow, alongside
    // check-deploy-sha.test.mjs's "defaults to a budget of at least 12
    // minutes" test which pins the script's own default. Both must move
    // together -- see that test's comment for why 12 minutes was chosen.
    expect(WORKFLOW).toMatch(/MAX_ATTEMPTS:\s*48\b/);
    expect(WORKFLOW).toMatch(/SLEEP_SECS:\s*15\b/);
  });

  it("scopes SHA confirmation to the trigger that can actually satisfy it", () => {
    // Widening MAX_ATTEMPTS/SLEEP_SECS further would not have fixed #5124 --
    // every occurrence was a "Deploy Services"/"Pulumi Deploy" trigger, and
    // the marketing homepage's build-id is only ever set by "Deploy Static
    // Sites". Losing this wiring silently reintroduces the flake even with an
    // unchanged (or larger) budget, so it is pinned as its own assertion.
    expect(WORKFLOW).toMatch(/TRIGGER_NAME:\s*\$\{\{\s*github\.event\.workflow_run\.name\s*\}\}/);
    expect(WORKFLOW).toMatch(/--trigger-name\s+"\$TRIGGER_NAME"/);
  });

  it("scopes the poll to a redeployed marketing site (#8720)", () => {
    expect(WORKFLOW).toMatch(/actions\/runs\/\$RUN_ID\/jobs/);
    expect(WORKFLOW).toMatch(/--marketing-deployed\s+"\$MARKETING_DEPLOYED"/);
    expect(WORKFLOW).toMatch(/actions:\s*read/);
  });
});

describe("post-deploy-check.yml smoke checks", () => {
  it("only smoke-checks marketing pages the edge router serves (#9985)", () => {
    // #9985 made unknown marketing paths 404; a stale "/about" check then failed
    // every post-deploy run and auto-rollback reverted an unrelated commit (#10080).
    const marketingPaths = [
      ...WORKFLOW.matchAll(
        /smoke_check\s+"[^"]*"\s+"https:\/\/mattbutlerengineering\.com(\/[^"]*)?"/g
      ),
    ].map((m) => m[1] ?? "/");
    expect(marketingPaths.length).toBeGreaterThan(0);
    const unknown = marketingPaths.filter(
      (path) => !path.startsWith("/hospitality") && !isKnownMarketingPath(path)
    );
    expect(unknown).toEqual([]);
  });
});
