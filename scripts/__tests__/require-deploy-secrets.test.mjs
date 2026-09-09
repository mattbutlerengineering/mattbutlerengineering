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

/** One Sentry project per service, so one secret per service. */
const SERVICE_DSN_BY_NAME = {
  "users-api": "SENTRY_DSN_USERS_API",
  "reservations-api": "SENTRY_DSN_RESERVATIONS_API",
  "agent-api": "SENTRY_DSN_AGENT_API",
};
const SERVICE_DSN_SECRETS = Object.values(SERVICE_DSN_BY_NAME);

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

  it("triggers on the packages whose code the deployed services boot with", () => {
    // Found at Review of maintenance:backend-observability-blackout. The merge
    // that ended the blackout (#4927, packages/sentry only) matched no entry in
    // this filter, so it deployed NOTHING -- the fix sat on main, green, and
    // unshipped until a manual `gh workflow run`. A merged fix that silently
    // never reaches production is the same shape as the blackout it fixed.
    //
    // scripts/check-workflow-paths-coverage.mjs cannot catch this: it derives
    // the exercised surface from path tokens in `run:` blocks, and explicitly
    // does not model transitive dependencies. These packages are never NAMED by
    // this workflow -- they arrive inside the Docker images it deploys.
    const trigger = DEPLOY_WORKFLOW.slice(0, DEPLOY_WORKFLOW.indexOf("workflow_dispatch"));
    for (const pkg of ["packages/observability", "packages/sentry", "packages/service-bootstrap"]) {
      expect(trigger, `${pkg} can change without redeploying the services that run it`).toContain(
        `"${pkg}/**"`
      );
    }
  });

  it("runs the guard before patching the app spec", () => {
    const guardAt = DEPLOY_WORKFLOW.indexOf("require-deploy-secrets.mjs");
    const patchAt = DEPLOY_WORKFLOW.indexOf("Inject deploy metadata into app spec");
    expect(guardAt).toBeGreaterThan(-1);
    expect(patchAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(patchAt);
  });

  it("passes all three per-service DSNs into the guard step's environment", () => {
    const guardAt = DEPLOY_WORKFLOW.indexOf("require-deploy-secrets.mjs");
    const stepStart = DEPLOY_WORKFLOW.lastIndexOf("- name:", guardAt);
    const step = DEPLOY_WORKFLOW.slice(stepStart, guardAt);
    for (const name of SERVICE_DSN_SECRETS) {
      expect(step).toContain(`${name}: \${{ secrets.${name} }}`);
    }
  });

  it("requires all three DSNs, not just one", () => {
    // A guard that checks one of three would let two services deploy blind --
    // the same partial-coverage failure, just narrower.
    const guardAt = DEPLOY_WORKFLOW.indexOf("require-deploy-secrets.mjs");
    const invocation = DEPLOY_WORKFLOW.slice(guardAt, DEPLOY_WORKFLOW.indexOf("\n", guardAt));
    for (const name of SERVICE_DSN_SECRETS) {
      expect(invocation).toContain(name);
    }
  });

  it("opens the guard's run block with pipefail", () => {
    // GitHub's default shell is `bash -e` with no pipefail, so a piped gate
    // reports the pipe's exit code and goes green no matter what it found.
    const guardAt = DEPLOY_WORKFLOW.indexOf("require-deploy-secrets.mjs");
    const stepStart = DEPLOY_WORKFLOW.lastIndexOf("- name:", guardAt);
    expect(DEPLOY_WORKFLOW.slice(stepStart, guardAt)).toContain("set -euo pipefail");
  });

  it("upserts each service's own DSN, unconditionally", () => {
    // No `if [ -n ... ]` skip like MANAGE_TOKEN_SECRET has: the guard above
    // already proved every value is present, so a silent skip here would only
    // re-create the blackout one layer down.
    expect(DEPLOY_WORKFLOW).toContain('{\\"key\\":\\"SENTRY_DSN\\"');
    for (const name of SERVICE_DSN_SECRETS) {
      expect(DEPLOY_WORKFLOW).toContain(`\${${name}}`);
      expect(DEPLOY_WORKFLOW).not.toMatch(new RegExp(`if \\[ -n "\\$\\{${name}\\}" \\]`));
    }
  });

  it("routes each secret to its own service, never one value to all three", () => {
    // Getting this wrong would send every service's events to one project,
    // which is exactly the option that was considered and rejected.
    for (const [service, secret] of Object.entries(SERVICE_DSN_BY_NAME)) {
      const selectAt = DEPLOY_WORKFLOW.indexOf(
        `select(.name == \\"${service}\\").envs) |=\n              (map(select(.key != \\"SENTRY_DSN\\"))`
      );
      expect(selectAt, `no SENTRY_DSN upsert for ${service}`).toBeGreaterThan(-1);
      const block = DEPLOY_WORKFLOW.slice(selectAt, selectAt + 400);
      expect(block).toContain(`\${${secret}}`);
    }
  });
});
