import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyRequiredSecret, checkRequiredSecrets } from "../require-deploy-secrets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DEPLOY_WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/deploy-services.yml"),
  "utf8"
);

// A syntactically well-formed Sentry DSN. Not a real project — the guard never
// dials it, it only decides whether a value is present enough to deploy with.
const WELL_FORMED_DSN = "https://0123456789abcdef@o12345.ingest.sentry.io/6789";

describe("classifyRequiredSecret", () => {
  it("accepts a well-formed DSN", () => {
    expect(classifyRequiredSecret("SENTRY_DSN", WELL_FORMED_DSN)).toEqual({
      ok: true,
      name: "SENTRY_DSN",
    });
  });

  it("rejects an empty string", () => {
    // This is the exact shape `gh secret set NAME` (no --body) leaves behind,
    // and the shape an unset secret interpolates to inside a workflow.
    expect(classifyRequiredSecret("SENTRY_DSN", "")).toEqual({
      ok: false,
      name: "SENTRY_DSN",
      reason: "empty",
    });
  });

  it("rejects a whitespace-only value", () => {
    expect(classifyRequiredSecret("SENTRY_DSN", "   \n\t ")).toEqual({
      ok: false,
      name: "SENTRY_DSN",
      reason: "blank",
    });
  });

  it("rejects an unset value, distinguishing it from an empty one", () => {
    expect(classifyRequiredSecret("SENTRY_DSN", undefined)).toEqual({
      ok: false,
      name: "SENTRY_DSN",
      reason: "unset",
    });
  });

  it("does not trim the accepted value into existence", () => {
    // A value that is only significant after trimming still counts as present;
    // the guard decides presence, never format.
    expect(classifyRequiredSecret("SENTRY_DSN", `  ${WELL_FORMED_DSN}  `).ok).toBe(true);
  });
});

describe("checkRequiredSecrets", () => {
  it("passes when every required name is present", () => {
    const result = checkRequiredSecrets(["SENTRY_DSN"], { SENTRY_DSN: WELL_FORMED_DSN });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when any one required name is empty", () => {
    const result = checkRequiredSecrets(["SENTRY_DSN", "OTHER"], {
      SENTRY_DSN: WELL_FORMED_DSN,
      OTHER: "",
    });
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.name)).toEqual(["OTHER"]);
  });

  it("reports every failure, not just the first", () => {
    const result = checkRequiredSecrets(["A", "B"], { A: "", B: "  " });
    expect(result.failures.map((f) => f.reason)).toEqual(["empty", "blank"]);
  });
});

describe("deploy-services.yml wiring", () => {
  // The guard only protects a deploy if the deploy actually runs it. A pure
  // function nobody calls is the exact failure this whole run is about.
  it("checks out the repo in the deploy job so the guard script exists", () => {
    const deployJob = DEPLOY_WORKFLOW.slice(
      DEPLOY_WORKFLOW.indexOf("\n  deploy:"),
      DEPLOY_WORKFLOW.indexOf("\n  verify:")
    );
    expect(deployJob).toContain("actions/checkout");
  });

  it("runs the guard before patching the app spec", () => {
    const guardAt = DEPLOY_WORKFLOW.indexOf("require-deploy-secrets.mjs");
    const patchAt = DEPLOY_WORKFLOW.indexOf("Inject deploy metadata into app spec");
    expect(guardAt).toBeGreaterThan(-1);
    expect(patchAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(patchAt);
  });

  it("passes SENTRY_DSN into the guard step's environment", () => {
    const guardAt = DEPLOY_WORKFLOW.indexOf("require-deploy-secrets.mjs");
    const stepStart = DEPLOY_WORKFLOW.lastIndexOf("- name:", guardAt);
    const step = DEPLOY_WORKFLOW.slice(stepStart, guardAt);
    expect(step).toContain("SENTRY_DSN: ${{ secrets.SENTRY_DSN }}");
  });

  it("opens the guard's run block with pipefail", () => {
    // GitHub's default shell is `bash -e` with no pipefail, so a piped gate
    // reports the pipe's exit code and goes green no matter what it found.
    const guardAt = DEPLOY_WORKFLOW.indexOf("require-deploy-secrets.mjs");
    const stepStart = DEPLOY_WORKFLOW.lastIndexOf("- name:", guardAt);
    expect(DEPLOY_WORKFLOW.slice(stepStart, guardAt)).toContain("set -euo pipefail");
  });

  it("upserts SENTRY_DSN into every service unconditionally", () => {
    // No `if [ -n ... ]` skip like MANAGE_TOKEN_SECRET has: the guard above
    // already proved the value is present, so a silent skip here would only
    // re-create the blackout one layer down.
    expect(DEPLOY_WORKFLOW).toContain('{\\"key\\":\\"SENTRY_DSN\\"');
    expect(DEPLOY_WORKFLOW).not.toMatch(/if \[ -n "\$\{SENTRY_DSN\}" \]/);
  });
});
