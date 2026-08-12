import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/pulumi-up.yml"), "utf8");

/**
 * The single Pulumi CLI version this workflow is allowed to run.
 *
 * Parsed textually rather than with a YAML library, matching the precedent in
 * ci-node-matrix.test.mjs and drift-fix-workflow.test.mjs: nothing in `scripts/`
 * depends on a YAML parser, and these are plain scalars with no anchors or flow
 * mappings to get wrong.
 */
const PINNED_VERSION = "3.253.0";

describe("pulumi-up.yml Pulumi CLI pin", () => {
  it("installs an explicit CLI version instead of inheriting the runner image's", () => {
    // The runner image ships a preinstalled Pulumi at /usr/local/bin/pulumi, and the
    // `Pulumi Cancel + Clear Pending Operations` step is a raw `run:` that calls it
    // straight off PATH. On 2026-08-11 the ubuntu24 image went 20260720.247 →
    // 20260810.271, taking Pulumi 3.253.0 → 3.256.0, whose S3 blob layer sends upload
    // checksums Cloudflare R2 rejects (`InvalidDigest` on the lock-file PutObject).
    // Production infra deploys went down for hours with zero repo changes. Pinning is
    // what stops the runner image deciding which Pulumi deploys production.
    expect(WORKFLOW).toMatch(new RegExp(`--version\\s+${PINNED_VERSION.replace(/\./g, "\\.")}`));
    expect(WORKFLOW).toMatch(/\$HOME\/\.pulumi\/bin"? >> "?\$GITHUB_PATH/);
  });

  it("pins every pulumi/actions step to the same version", () => {
    const actionSteps = WORKFLOW.split("\n").filter((l) => /uses:\s*pulumi\/actions@/.test(l));
    expect(actionSteps.length).toBeGreaterThan(0);

    const pins = WORKFLOW.split("\n").filter((l) => /^\s*pulumi-version:/.test(l));

    // Every `pulumi/actions` step needs its own `pulumi-version:`; the action's
    // default is `^3`, which resolves to latest and reintroduces the exact float
    // this pin exists to remove.
    expect(pins).toHaveLength(actionSteps.length);
    for (const pin of pins) {
      expect(pin).toMatch(
        new RegExp(`pulumi-version:\\s*["']?${PINNED_VERSION.replace(/\./g, "\\.")}["']?\\s*$`)
      );
    }
  });

  it("installs the pin before anything that shells out to pulumi", () => {
    // Presence of the pin is not sufficient: `GITHUB_PATH` only affects steps
    // *after* the one that writes it. A `Pin Pulumi CLI` step sitting below the
    // Cancel step would satisfy every other assertion here while the Cancel step
    // still resolved the runner image's floating pulumi off PATH — silently
    // reproducing the outage this guard exists to prevent.
    const lines = WORKFLOW.split("\n");
    const stepIndex = (name) => {
      const i = lines.findIndex((l) => l.trim() === `- name: ${name}`);
      if (i === -1) throw new Error(`pulumi-up.yml has no step named ${name}`);
      return i;
    };

    const pinIndex = stepIndex("Pin Pulumi CLI");
    for (const consumer of [
      "Pulumi Cancel + Clear Pending Operations",
      "Pulumi Refresh (Sync state with cloud)",
      "Pulumi Up",
    ]) {
      expect(pinIndex).toBeLessThan(stepIndex(consumer));
    }
  });

  it("leaves no Pulumi invocation resolving to a floating version", () => {
    expect(WORKFLOW).not.toMatch(/pulumi-version:\s*["']?\^?3["']?\s*$/);
    expect(WORKFLOW).not.toMatch(/pulumi-version:\s*["']?latest["']?\s*$/);
  });
});
