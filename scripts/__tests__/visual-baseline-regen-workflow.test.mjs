import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflow, getJob } from "../lib/workflow.mjs";
import { TARGETS } from "../visual-baseline-regen.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const RAW = read(".github/workflows/visual-baseline-regen.yml");
const wf = loadWorkflow("visual-baseline-regen.yml");
const steps = getJob(wf, "regen").steps;
const indexOfStep = (re) => steps.findIndex((s) => re.test(s.name ?? ""));

describe("visual-baseline-regen workflow", () => {
  it("fires on workflow_dispatch only, with the exported app list as its choices", () => {
    expect(Object.keys(wf.on)).toEqual(["workflow_dispatch"]);
    expect(wf.on.workflow_dispatch.inputs.app.options).toEqual(Object.keys(TARGETS));
  });

  it("skips the dependency and marketing builds for the rialto target", () => {
    // The dependency build used to be rialto-only; it now builds the target
    // app's whole closure, because `@mbe/types`/`@mbe/api-client` resolve their
    // runtime export condition to `dist/` and rialto alone left those unbuilt
    // (#7042). Located by its `run` rather than its name so a future rename
    // cannot silently make this `undefined` and throw instead of asserting.
    const depBuild = steps.find((s) => /pnpm build --filter "@mbe\//.test(s.run ?? ""));
    expect(depBuild, "the app's dependency-closure build step is missing").toBeDefined();
    // The closure itself, not merely that some @mbe/ package is built. Without
    // this the step could be narrowed back to a single package — the exact
    // shape of #7042 — with the suite still green.
    expect(depBuild.run).toMatch(/pnpm build --filter "@mbe\/\$APP\^\.\.\."/);
    expect(depBuild.if).toMatch(/inputs\.app != 'rialto'/);
    const marketingBuild = steps.find((s) => /^Build marketing/.test(s.name ?? ""));
    expect(marketingBuild.if).toBe("inputs.app == 'marketing'");
  });

  it("installs Playwright browsers in the planned package dir", () => {
    const install = steps.find((s) => /^Install Playwright/.test(s.name ?? ""));
    expect(install.env.PACKAGE_JSON).toBe("${{ steps.plan.outputs.package_json }}");
    expect(install.run).toMatch(/dirname "\$PACKAGE_JSON"/);
  });

  it("takes capture and verify args from the plan, verify after capture", () => {
    const capture = indexOfStep(/^Capture/);
    const verify = indexOfStep(/^Verify/);
    expect(capture).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(capture);
    expect(steps[capture].env.PW_ARGS).toBe("${{ steps.plan.outputs.capture_args }}");
    expect(steps[verify].env.PW_ARGS).toBe("${{ steps.plan.outputs.verify_args }}");
  });

  it("only labels needs-review and never merges", () => {
    expect(RAW).toMatch(/labels: needs-review$/m);
    expect(RAW).not.toMatch(/auto-merge|gh pr merge/);
    const pr = steps.find((s) => s.uses?.startsWith("peter-evans/create-pull-request@"));
    expect(pr.with["add-paths"]).toBe("${{ steps.plan.outputs.add_paths }}");
  });

  it("dispatches CI with actions:write, pinning create-pull-request like drift-fix", () => {
    expect(RAW).toMatch(/gh workflow run ci\.yml --ref/);
    expect(wf.permissions.actions).toBe("write");
    const pin = (text) => text.match(/peter-evans\/create-pull-request@([0-9a-f]{40})/)[1];
    expect(pin(RAW)).toBe(pin(read(".github/workflows/drift-fix.yml")));
  });

  it("never writes provenance.json under a screenshots path", () => {
    const writers = steps.filter((s) => s.run?.includes("provenance.json"));
    expect(writers.length).toBeGreaterThan(0);
    for (const s of writers) expect(s.run).not.toMatch(/screenshots/);
  });
});
