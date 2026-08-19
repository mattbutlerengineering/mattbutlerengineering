#!/usr/bin/env node

/**
 * pulumi-r2-validation-guard.mjs — safety guard for the
 * `pulumi-r2-checksum-validation.yml` `workflow_dispatch`-only harness (#4119).
 *
 * That workflow exists to empirically answer whether Pulumi CLI >= 3.256.0
 * works against this repo's Cloudflare R2 state backend once
 * `AWS_REQUEST_CHECKSUM_CALCULATION`/`AWS_RESPONSE_CHECKSUM_VALIDATION` are
 * set to `when_required` (see #4117/#4118: the runner image bumped Pulumi
 * 3.253.0 -> 3.256.0 and R2 started rejecting the lock-file `PutObject` with
 * `InvalidDigest`). The validation necessarily performs a REAL state write —
 * that is the whole point, a trivial `pulumi up`/`refresh` doesn't reproduce
 * the bug otherwise. It must NEVER perform that write against production
 * Pulumi state.
 *
 * `assertScratchBucketSafe` is the single most important function in this
 * file: it fails loudly (throws) if the resolved bucket is blank, missing,
 * or the production bucket (including any case/whitespace variant of it) —
 * never silently falling back to the prod backend. The production bucket
 * name is parsed out of `pulumi-up.yml`'s own `s3://` cloud-url rather than
 * hardcoded here, so a bucket rename in the real deploy workflow can't
 * silently desync this guard from what it's supposed to protect.
 *
 * `meetsMinimumPulumiVersion` is the version-floor check backing the
 * workflow's "install 3.256.0 or newer" requirement (numeric, not
 * lexicographic — "3.9.0" < "3.10.0").
 *
 * Usage (from the workflow's `run:` steps):
 *   node scripts/pulumi-r2-validation-guard.mjs check-bucket --input "$INPUT_BUCKET" --secret "$SECRET_BUCKET"
 *   node scripts/pulumi-r2-validation-guard.mjs check-version --version "$PULUMI_VERSION"
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PULUMI_UP_WORKFLOW = resolve(ROOT, ".github/workflows/pulumi-up.yml");

export const DEFAULT_MINIMUM_PULUMI_VERSION = "3.256.0";

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

/**
 * Extracts the production Pulumi state bucket name from `pulumi-up.yml`'s
 * `s3://<bucket>?...` cloud-url — the single source of truth for which
 * bucket deploys prod, so this guard can't drift from a bucket rename made
 * only in the real deploy workflow.
 *
 * @param {string} [workflowYaml] — injectable for testing; defaults to
 *   reading the real `.github/workflows/pulumi-up.yml`.
 * @returns {string}
 * @throws {Error} when no `s3://` url is found (fail loud, never guess)
 */
export function productionStateBucket(workflowYaml = readFileSync(PULUMI_UP_WORKFLOW, "utf8")) {
  const match = workflowYaml.match(/s3:\/\/([a-z0-9.-]+)\?/);
  if (!match) {
    throw new Error(
      "Could not find an s3:// state bucket in pulumi-up.yml — has the backend URL format changed?"
    );
  }
  return match[1];
}

function normalizeBucketName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Resolves which bucket the validation workflow should target, preferring
 * an explicit `workflow_dispatch` input over the fallback secret. Pure — no
 * env/secret reads happen here, the caller passes both candidates in.
 *
 * @param {{inputBucket?: string, secretBucket?: string}} [opts]
 * @returns {string}
 * @throws {Error} when neither candidate has a non-blank value
 */
export function resolveScratchBucket({ inputBucket, secretBucket } = {}) {
  const resolved = [inputBucket, secretBucket]
    .map((value) => String(value ?? "").trim())
    .find((value) => value.length > 0);

  if (!resolved) {
    throw new Error(
      "No scratch bucket resolved: provide the `scratch_bucket` workflow_dispatch input or set the " +
        "PULUMI_SCRATCH_STATE_BUCKET secret."
    );
  }
  return resolved;
}

/**
 * The core safety guard. Throws when `bucket` is blank, or is the
 * production Pulumi state bucket (or a case-/whitespace-variant of it).
 * This is deliberately case-/whitespace-insensitive in the reject
 * direction: a variant of the prod name is far more likely a typo or
 * copy-paste of the real bucket than a genuinely different one that
 * happens to differ only by case, so it is treated as the same bucket
 * rather than trusted.
 *
 * @param {string} bucket — resolved scratch bucket candidate
 * @param {string} prodBucket — production state bucket (see productionStateBucket)
 * @throws {Error} when bucket is blank or resolves to prodBucket
 */
export function assertScratchBucketSafe(bucket, prodBucket) {
  const normalizedBucket = normalizeBucketName(bucket);
  const normalizedProd = normalizeBucketName(prodBucket);

  if (!normalizedBucket) {
    throw new Error(
      "Scratch bucket is blank — refusing to run the validation workflow against no target."
    );
  }
  if (normalizedBucket === normalizedProd) {
    throw new Error(
      `Scratch bucket "${bucket}" resolves to the PRODUCTION Pulumi state bucket ("${prodBucket}"). ` +
        "Refusing to run — this validation must never write to production state."
    );
  }
}

function parseVersionParts(version, label) {
  const parts = String(version ?? "")
    .trim()
    .split(".")
    .map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Could not parse ${label} "${version}" as a dotted major.minor.patch version.`);
  }
  return parts;
}

/**
 * True when `version` is >= `minimum`, compared numerically component by
 * component (never lexicographically — "3.9.0" < "3.10.0").
 *
 * @param {string} version
 * @param {string} [minimum]
 * @returns {boolean}
 * @throws {Error} when either version can't be parsed as major.minor.patch
 */
export function meetsMinimumPulumiVersion(version, minimum = DEFAULT_MINIMUM_PULUMI_VERSION) {
  const actual = parseVersionParts(version, "version");
  const floor = parseVersionParts(minimum, "minimum version");

  for (let i = 0; i < 3; i += 1) {
    if (actual[i] !== floor[i]) {
      return actual[i] > floor[i];
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  try {
    if (subcommand === "check-bucket") {
      const bucket = resolveScratchBucket({
        inputBucket: readFlag(rest, "--input"),
        secretBucket: readFlag(rest, "--secret"),
      });
      assertScratchBucketSafe(bucket, productionStateBucket());
      console.log(bucket);
      return;
    }

    if (subcommand === "check-version") {
      const version = readFlag(rest, "--version") ?? "";
      const minimum = readFlag(rest, "--minimum") ?? DEFAULT_MINIMUM_PULUMI_VERSION;
      if (!meetsMinimumPulumiVersion(version, minimum)) {
        throw new Error(`Pulumi version "${version}" is below the required minimum "${minimum}".`);
      }
      console.log(version);
      return;
    }

    console.error(
      "Usage: pulumi-r2-validation-guard.mjs check-bucket --input <bucket> --secret <bucket>\n" +
        "       pulumi-r2-validation-guard.mjs check-version --version <version> [--minimum <version>]"
    );
    process.exit(1);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
