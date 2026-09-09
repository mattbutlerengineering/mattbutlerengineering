#!/usr/bin/env node
/**
 * check-deploy-secret-provisioning.mjs — regression guard for #4064.
 *
 * PR #4026 (#4018) added `UNSUBSCRIBE_TOKEN_SECRET`, a secret that
 * `services/reservations/src/config/unsubscribe-token.ts` throws on when
 * missing in production, but never wired it into either deploy path
 * (`.github/workflows/deploy-services.yml`'s doctl upsert, or
 * `infrastructure/pulumi/index.ts`'s `secretEnv` call) — mirroring
 * `MANAGE_TOKEN_SECRET`'s code half without its deploy half. That broke
 * `reservations-api` on every deploy until fixed.
 *
 * This scans `services/reservations/src/config/*.ts` for any secret a config
 * module throws on when absent in production, and asserts it's provisioned
 * in BOTH deploy paths — so the next config of this shape fails a test
 * instead of a production deploy.
 *
 * Usage: node scripts/check-deploy-secret-provisioning.mjs
 * Exit code: 0 if every required-in-production secret is provisioned in both
 * deploy paths, 1 otherwise. Wired into `pnpm repo-audit` (#4628) — before
 * that, this ran only as a vitest assertion, unlike every other repo-audit
 * check, so a regression would have failed `pnpm test` but not CI's
 * Architecture Audit job the way its siblings do.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findProductionThrowSecretNames } from "./lib/production-throw-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Scans every non-test `.ts` file in `configDir` for `throw new Error(...)`
 * statements reachable under a production-environment guard (e.g. what
 * `getManageTokenConfig` / `getUnsubscribeTokenConfig` do), and returns the
 * distinct secret names referenced in those throws — detected via AST
 * structure, not by matching a specific message phrase (#4067).
 *
 * @param {string} configDir - absolute path to a config directory
 * @returns {string[]}
 */
export function findRequiredProductionSecrets(configDir) {
  const names = new Set();
  for (const file of readdirSync(configDir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(join(configDir, file), "utf8");
    for (const name of findProductionThrowSecretNames(source, file)) {
      names.add(name);
    }
  }
  return [...names];
}

/**
 * True when `name` is provisioned in both deploy paths, mirroring the
 * MANAGE_TOKEN_SECRET pattern:
 *   - workflowSource: passed through from `secrets.<name>` and upserted into
 *     the reservations-api component's envs, guarded on non-empty
 *   - pulumiSource: declared as a `secretEnv("<name>", ...)` call
 *
 * @param {string} name
 * @param {string} workflowSource
 * @param {string} pulumiSource
 * @returns {boolean}
 */
export function isSecretProvisioned(name, workflowSource, pulumiSource) {
  const hasPassthrough = workflowSource.includes(`${name}: \${{ secrets.${name} }}`);
  const hasGuard = workflowSource.includes(`if [ -n "\${${name}}" ]`);
  const hasUpsert = workflowSource.includes(`\\"key\\":\\"${name}\\"`);
  const hasPulumiSecretEnv = new RegExp(`secretEnv\\("${name}"`).test(pulumiSource);

  return hasPassthrough && hasGuard && hasUpsert && hasPulumiSecretEnv;
}

/**
 * @param {{ names: string[], workflowSource: string, pulumiSource: string }} args
 * @returns {string[]} names that are NOT fully provisioned in both deploy paths
 */
export function findUnprovisionedSecrets({ names, workflowSource, pulumiSource }) {
  return names.filter((name) => !isSecretProvisioned(name, workflowSource, pulumiSource));
}

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
const isMain = process.argv[1] && process.argv[1].endsWith("check-deploy-secret-provisioning.mjs");

if (isMain) {
  const configDir = join(DEFAULT_ROOT, "services/reservations/src/config");
  const workflowSource = readFileSync(
    join(DEFAULT_ROOT, ".github/workflows/deploy-services.yml"),
    "utf8"
  );
  const pulumiSource = readFileSync(join(DEFAULT_ROOT, "infrastructure/pulumi/index.ts"), "utf8");

  const names = findRequiredProductionSecrets(configDir);
  const findings = findUnprovisionedSecrets({ names, workflowSource, pulumiSource });

  process.exit(
    runCheck({
      name: "deploy-secret provisioning",
      findings,
      formatFinding: (name) =>
        `${name} — required in production but not provisioned in both deploy-services.yml and infrastructure/pulumi/index.ts`,
      passMessage: `PASS: all ${names.length} required-in-production secret(s) provisioned in both deploy paths`,
      failMessage:
        "FAIL: a secret required in production is not provisioned in both deploy paths.\n" +
        "Wire it into both .github/workflows/deploy-services.yml (doctl upsert) and\n" +
        "infrastructure/pulumi/index.ts (secretEnv call) — see #4064.",
    })
  );
}
/* c8 ignore stop */
