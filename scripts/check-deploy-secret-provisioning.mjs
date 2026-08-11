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
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findProductionThrowSecretNames } from "./lib/production-throw-scan.mjs";

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
