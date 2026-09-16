import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
});
