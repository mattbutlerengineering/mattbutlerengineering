import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/deploy-static.yml"), "utf8");

/**
 * Every static app this workflow builds and deploys.
 *
 * Enumerated explicitly rather than globbed. A glob fails silently in exactly
 * the direction that hides the bug: an app whose build step is missing is also
 * an app the glob never yields, so the gate would go green on the one case it
 * exists to catch. Adding an app here by hand is the point, not an oversight.
 */
const STATIC_APPS = ["marketing", "hospitality", "rialto-web"];

/**
 * The build-time environment every one of those apps needs for Sentry to work.
 *
 * `VITE_SENTRY_DSN` is inlined into the bundle by Vite, and `packages/sentry`
 * derives enablement from DSN length alone (`enabled: resolvedDsn.length > 0`
 * in config.ts), so an absent DSN makes `initSentry` early-return and
 * `Sentry.init` never runs — the SDK ships and reports nothing, with no error
 * and no warning.
 *
 * The three SENTRY_* variables drive `sentryVitePlugin`, which each app's
 * vite.config.ts disables via `disable: !process.env.SENTRY_AUTH_TOKEN`.
 * Without them source maps are never uploaded, so reports that do arrive carry
 * minified, unreadable stack traces. Supplying the DSN alone looks fixed and
 * is not, which is why all four are asserted together.
 */
const REQUIRED_SENTRY_ENV = [
  "VITE_SENTRY_DSN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
];

/**
 * Split the workflow into step blocks.
 *
 * Parsed textually rather than with a YAML library, matching the precedent in
 * pulumi-cli-pin.test.mjs and ci-node-matrix.test.mjs: nothing in `scripts/`
 * depends on a YAML parser. A step begins at a `- name:` / `- run:` / `- uses:`
 * list item and runs until the next one, so a step's own `env:` block travels
 * with it regardless of whether `env:` precedes or follows `run:`.
 */
function stepBlocks(yaml) {
  const lines = yaml.split("\n");
  const starts = lines.reduce((acc, line, index) => {
    if (/^\s*-\s+(name|run|uses):/.test(line)) acc.push(index);
    return acc;
  }, []);

  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    return lines.slice(start, end).join("\n");
  });
}

/** The step that runs `pnpm build --filter=@mbe/<app>`, or null if there isn't one. */
function buildStepFor(yaml, app) {
  return (
    stepBlocks(yaml).find((block) => block.includes(`pnpm build --filter=@mbe/${app}`)) ?? null
  );
}

describe("deploy-static.yml passes the Sentry build environment to every static app", () => {
  it("builds every app in STATIC_APPS", () => {
    // Guards the enumeration itself: if an app is renamed or its build step is
    // restructured, this fails loudly instead of the per-app assertions below
    // quietly passing over an app they can no longer find.
    const missing = STATIC_APPS.filter((app) => buildStepFor(WORKFLOW, app) === null);
    expect(missing).toEqual([]);
  });

  it.each(STATIC_APPS)("passes the full Sentry env to the %s build", (app) => {
    const step = buildStepFor(WORKFLOW, app);
    expect(step).not.toBeNull();

    const absent = REQUIRED_SENTRY_ENV.filter((key) => !step.includes(`${key}:`));

    // Named in the failure message on purpose. The defect this guards against
    // (marketing and rialto-web dark since 2026-04-02, while the 2026-05-18 CI
    // wiring covered hospitality only) is invisible from the outside: an app
    // reporting no errors looks exactly like an app with no errors. A bare
    // "expected true to be false" would not say which app went dark.
    expect(absent, `${app} build step is missing: ${absent.join(", ")}`).toEqual([]);
  });
});
