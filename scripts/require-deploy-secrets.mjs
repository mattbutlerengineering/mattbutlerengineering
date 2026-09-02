#!/usr/bin/env node

/**
 * require-deploy-secrets.mjs — refuse a deploy that would ship a service
 * without a secret the service needs to function.
 *
 * Written for the maintenance:backend-observability-blackout run. `SENTRY_DSN`
 * was never present in the DigitalOcean app spec, so `initSentry` took its
 * `!config.enabled` early return on every boot for roughly five months. Nothing
 * anywhere went red: an unconfigured error reporter and a working one that
 * simply has not seen an error yet produce byte-identical evidence.
 *
 * `deploy-services.yml` bridges secrets past Pulumi's `ignoreChanges: ["spec"]`
 * with `yq` patches guarded by `if [ -n "${VALUE}" ]`. That guard skips
 * silently, which is the same shape of failure one layer down — a deploy that
 * quietly omits a secret looks exactly like a deploy that did not need one. So
 * this module is the fail-closed half: values that must be present are checked
 * before the spec is patched, and an absent one stops the deploy loudly.
 *
 * Presence, never format. A DSN this guard accepts can still be the wrong
 * project or a revoked key — that is what the round-trip check exists for. The
 * failure this catches is the one that was actually observed: `gh secret set
 * NAME` with no `--body` reads empty stdin and silently stores "", and an
 * unset secret interpolates into a workflow as "" too. Both are indexed here
 * as real answers rather than as absence of an answer.
 *
 * Usage:
 *   node scripts/require-deploy-secrets.mjs SENTRY_DSN [MORE_NAMES...]
 *
 * Values are read from the environment by name, never passed as arguments —
 * argv is visible in the process table to anything else on the runner.
 */

import { fileURLToPath } from "node:url";

/**
 * Decide whether one required secret is present enough to deploy with.
 *
 * The three rejection reasons are kept distinct because they mean different
 * things to whoever has to fix it: `unset` is "nothing defined this at all",
 * `empty` is the `gh secret set` footgun, and `blank` is a value someone
 * pasted with only whitespace in it.
 *
 * @param {string} name Environment variable name, used only for reporting.
 * @param {string | undefined | null} value The raw value as read from the env.
 * @returns {{ ok: true, name: string } | { ok: false, name: string, reason: "unset" | "empty" | "blank" }}
 */
export function classifyRequiredSecret(name, value) {
  if (value === undefined || value === null) return { ok: false, name, reason: "unset" };
  if (value === "") return { ok: false, name, reason: "empty" };
  if (value.trim() === "") return { ok: false, name, reason: "blank" };
  return { ok: true, name };
}

/**
 * Check every required name, collecting all failures rather than stopping at
 * the first. One deploy-blocking run should report every missing secret, so a
 * fix does not have to be discovered one re-run at a time.
 *
 * @param {readonly string[]} names
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: boolean, failures: Array<{ name: string, reason: string }> }}
 */
export function checkRequiredSecrets(names, env) {
  const failures = names
    .map((name) => classifyRequiredSecret(name, env[name]))
    .filter((result) => !result.ok);

  return { ok: failures.length === 0, failures };
}

/** Human-readable explanation for each rejection reason. */
const REASON_DETAIL = {
  unset: "not defined in the step's env block",
  empty: 'defined but empty — check `gh secret set NAME --body "value"`',
  blank: "defined but contains only whitespace",
};

/* c8 ignore start -- CLI entrypoint, exercised by the deploy workflow's own guard step; the decision logic it calls is unit-tested above */
function main() {
  const names = process.argv.slice(2);

  if (names.length === 0) {
    console.error("Usage: require-deploy-secrets.mjs <ENV_NAME> [ENV_NAME...]");
    process.exit(1);
  }

  const { ok, failures } = checkRequiredSecrets(names, process.env);

  if (ok) {
    console.log(`All ${names.length} required deploy secret(s) present: ${names.join(", ")}`);
    return;
  }

  for (const { name, reason } of failures) {
    console.error(`::error::${name} is ${REASON_DETAIL[reason]}. Refusing to deploy.`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
/* c8 ignore stop */
