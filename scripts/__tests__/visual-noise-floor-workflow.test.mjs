/**
 * Shape guard for .github/workflows/visual-noise-floor.yml's `app` dispatch
 * input (docs/features/ui-quality-loop breakdown M5).
 *
 * The instrument that measured rialto-web's tolerance now measures marketing
 * and hospitality too, one app per dispatch. What must not move while it
 * learns that: the `measure/**` push path stays a rialto-web measurement
 * (visual-diff-ref-trigger-safety.test.mjs asserts only this workflow fires
 * there), and the Auth0 E2E credential reaches only hospitality's legs.
 *
 * Text-level, like the other *-workflow tests here.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/visual-noise-floor.yml"), "utf8");

const E2E_SECRETS = [
  "E2E_AUTH0_DOMAIN",
  "E2E_AUTH0_CLIENT_ID",
  "E2E_AUTH0_AUDIENCE",
  "E2E_AUTH_EMAIL",
  "E2E_AUTH_PASSWORD",
];

/** The `on:` block, up to the next top-level key. */
const onBlock = WORKFLOW.match(/^on:\n([\s\S]*?)^\S/m)?.[1] ?? "";

describe("visual-noise-floor.yml — the `app` dispatch input", () => {
  it("declares `app` as a choice of the three apps, defaulting to rialto-web", () => {
    const input = onBlock.match(/workflow_dispatch:\n\s+inputs:\n\s+app:\n([\s\S]*?)(?=\n {2}\S)/);
    expect(input, "workflow_dispatch.inputs.app is missing").not.toBeNull();
    const body = input[1];
    expect(body).toMatch(/type:\s*choice/);
    expect(body).toMatch(/default:\s*rialto-web/);
    const options = [...body.matchAll(/^\s+-\s+(\S+)\s*$/gm)].map((m) => m[1]);
    expect(options).toEqual(["rialto-web", "marketing", "hospitality"]);
  });

  it("leaves the push trigger's branches exactly `measure/**`", () => {
    expect(onBlock).toMatch(/push:\n\s+branches:\s*\["measure\/\*\*"\]\n/);
    expect([...onBlock.matchAll(/branches:/g)]).toHaveLength(1);
  });

  it("resolves the app to rialto-web when there is no input (the push path)", () => {
    expect(WORKFLOW).toMatch(/APP:\s*\$\{\{\s*inputs\.app\s*\|\|\s*'rialto-web'\s*\}\}/);
  });

  it("resolves every leg's config, spec and screenshot dir through visual-noise-floor.mjs paths", () => {
    expect(WORKFLOW).toMatch(
      /node scripts\/visual-noise-floor\.mjs paths --app "\$APP" --leg "\$\{\{ matrix\.leg \}\}" >> "\$GITHUB_OUTPUT"/
    );
    expect(WORKFLOW).not.toMatch(/apps\/rialto-web\/\$\{\{ matrix\.config \}\}/);
  });

  it.each(E2E_SECRETS)("hands %s to hospitality legs only", (name) => {
    const re = new RegExp(
      `${name}:\\s*\\$\\{\\{\\s*env\\.APP == 'hospitality' && secrets\\.${name} \\|\\| ''\\s*\\}\\}`
    );
    expect(WORKFLOW).toMatch(re);
    // Never unconditionally.
    expect(WORKFLOW).not.toMatch(
      new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`)
    );
  });

  it("keys the concurrency group on the app too, so two apps on one ref measure in parallel", () => {
    expect(WORKFLOW).toMatch(
      /group:\s*visual-noise-floor-\$\{\{ github\.ref \}\}-\$\{\{ inputs\.app \|\| 'rialto-web' \}\}/
    );
  });

  it("differences drift against the app's own committed screenshots", () => {
    expect(WORKFLOW).toMatch(/--committed "apps\/\$APP\/e2e\/screenshots"/);
  });
});
