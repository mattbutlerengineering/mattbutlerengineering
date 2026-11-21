/**
 * deploy-services.yml patches the DigitalOcean app spec with yq. Every value
 * it writes (secrets, deploy metadata) must reach yq through `strenv(NAME)`,
 * never by shell-interpolating `${NAME}` into the expression string: a value
 * containing a quote, backslash or other yq syntax would otherwise break (or
 * rewrite) the expression rather than land as a value. The expression itself
 * is single-quoted so the shell cannot expand anything inside it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/deploy-services.yml"), "utf8");

/** Values the "Inject deploy metadata" step writes into the spec. */
const UPSERTED_VALUES = [
  "DEPLOY_SHA",
  "DEPLOY_PR_NUMBER",
  "DEPLOY_AUTHOR",
  "MANAGE_TOKEN_SECRET",
  "UNSUBSCRIBE_TOKEN_SECRET",
  "SENTRY_DSN_USERS_API",
  "SENTRY_DSN_RESERVATIONS_API",
  "SENTRY_DSN_AGENT_API",
];

/** Every `yq ...` invocation, from `yq` up to its spec-file argument. */
function yqInvocations(source) {
  return [...source.matchAll(/\byq\s+-i\s+[\s\S]*?\/tmp\/spec\.yaml/g)].map((m) => m[0]);
}

describe("deploy-services.yml yq upserts read values with strenv()", () => {
  const calls = yqInvocations(WORKFLOW);

  it("finds the yq upserts", () => {
    // 1 deploy-metadata loop + 2 reservations token secrets + 3 per-service DSNs
    expect(calls.length).toBe(6);
  });

  it("single-quotes every yq expression", () => {
    const unquoted = calls.filter((call) => !/^yq\s+-i\s+'/.test(call));
    expect(unquoted).toEqual([]);
  });

  it("interpolates no shell variable into any yq expression", () => {
    const interpolated = calls.filter((call) => call.includes("$"));
    expect(interpolated).toEqual([]);
  });

  it.each(UPSERTED_VALUES)("%s is written via strenv()", (name) => {
    const expr = `"key":"${name.replace(/^SENTRY_DSN_.*/, "SENTRY_DSN")}","value":strenv(${name})`;
    expect(calls.some((call) => call.includes(expr))).toBe(true);
  });

  it.each(UPSERTED_VALUES)("%s is exported in the inject step's env", (name) => {
    const step = WORKFLOW.slice(
      WORKFLOW.indexOf("- name: Inject deploy metadata into app spec"),
      WORKFLOW.indexOf("- name: Trigger deployment")
    );
    expect(step).toMatch(new RegExp(`^\\s+${name}: \\$\\{\\{ [^}]+ \\}\\}$`, "m"));
  });
});
