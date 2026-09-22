import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { assertScratchBucketSafe, productionStateBucket } from "../pulumi-r2-validation-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/pulumi-r2-checksum-validation.yml"),
  "utf8"
);

/**
 * Guards the self-provisioning scratch bucket added for #4119.
 *
 * The harness could never produce its verdict before that change: a scratch
 * bucket had to exist beforehand and never did, so its only dispatch (run
 * 35517677729) hard-failed at the resolve step with "No scratch bucket
 * resolved" and both arms were `skipped`. Parsed textually rather than with a
 * YAML library, matching the precedent in pulumi-cli-pin.test.mjs — nothing in
 * `scripts/` depends on a YAML parser.
 */
/**
 * The `default:` for `scratch_bucket` specifically — scoped to that input's own
 * block on purpose. A bare /default:/ match over the whole file returns
 * `pulumi_version`'s "3.256.0", which is declared first; asserting against that
 * by mistake makes every check here pass while testing nothing.
 */
function declaredScratchBucketDefault() {
  const start = WORKFLOW.indexOf("      scratch_bucket:");
  if (start === -1) return undefined;
  const block = WORKFLOW.slice(start, WORKFLOW.indexOf("concurrency:"));
  return block.match(/^\s*default:\s*(\S+)\s*$/m)?.[1];
}

describe("pulumi-r2-checksum-validation.yml scratch bucket", () => {
  it("declares a non-blank default so no bucket has to be pre-provisioned by hand", () => {
    const declared = declaredScratchBucketDefault();

    expect(declared).toBeTruthy();
    expect(declared).not.toBe('""');
    // Guards the mis-scoped-regex trap described above.
    expect(declared).not.toContain("3.256");
  });

  it("defaults to a bucket the safety guard accepts as non-production", () => {
    const declared = declaredScratchBucketDefault();

    // Compared against the bucket parsed out of the REAL pulumi-up.yml, so a
    // rename there cannot silently leave this default pointing at prod.
    expect(() => assertScratchBucketSafe(declared, productionStateBucket())).not.toThrow();
    expect(declared).toMatch(/scratch/);
  });

  it("creates the bucket only after the guard has rejected the production bucket", () => {
    const resolveIdx = WORKFLOW.indexOf("Resolve scratch bucket and validate Pulumi version floor");
    const ensureIdx = WORKFLOW.indexOf("Ensure the scratch bucket exists");

    expect(resolveIdx).toBeGreaterThan(-1);
    expect(ensureIdx).toBeGreaterThan(-1);
    // Ordering is the whole safety property: a create-bucket call placed
    // before assertScratchBucketSafe is the one way this harness could reach
    // production state.
    expect(ensureIdx).toBeGreaterThan(resolveIdx);

    // ...and it must still live in the guard job, ahead of either arm.
    const firstArmIdx = WORKFLOW.indexOf("validate-with-fix:");
    expect(firstArmIdx).toBeGreaterThan(-1);
    expect(ensureIdx).toBeLessThan(firstArmIdx);
  });

  it("acts on the guard's validated output, never the raw input or secret", () => {
    const step = WORKFLOW.slice(
      WORKFLOW.indexOf("Ensure the scratch bucket exists"),
      WORKFLOW.indexOf("validate-with-fix:")
    );

    expect(step).toContain("steps.resolve.outputs.bucket");
    expect(step).not.toContain("inputs.scratch_bucket");
    expect(step).not.toContain("secrets.PULUMI_SCRATCH_STATE_BUCKET");
  });

  it("fails the step on a create error instead of letting the arms run bucketless", () => {
    const step = WORKFLOW.slice(
      WORKFLOW.indexOf("Ensure the scratch bucket exists"),
      WORKFLOW.indexOf("validate-with-fix:")
    );

    // GitHub's default shell is `bash -e` with no pipefail; the exit code of
    // this step is the point, so it sets the strict flags itself.
    expect(step).toContain("set -euo pipefail");
    expect(step).toContain("aws s3api create-bucket");
  });
});
