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

/**
 * Does this step block actually *assign* `key` as an environment variable?
 *
 * Deliberately not a substring test for "KEY:". These steps carry comments
 * that name the very variables being asserted, so a substring match would let
 * a step pass on the strength of a comment mentioning the variable it is
 * missing — the guard reporting green for the one case it exists to catch.
 * Requires the key at the start of its own line (after indentation) followed
 * by a colon and a value, and skips comment lines outright.
 *
 * The key is compared by exact equality rather than interpolated into a
 * pattern — the same choice pulumi-cli-pin.test.mjs makes, and for the same
 * reason: building a regex from a variable means hand-escaping it, which
 * CodeQL flags (js/incomplete-sanitization).
 */
function assignsEnv(step, key) {
  return step
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .some((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*\S/.exec(line)?.[1] === key);
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

    const absent = REQUIRED_SENTRY_ENV.filter((key) => !assignsEnv(step, key));

    // Named in the failure message on purpose. The defect this guards against
    // (marketing and rialto-web dark since 2026-04-02, while the 2026-05-18 CI
    // wiring covered hospitality only) is invisible from the outside: an app
    // reporting no errors looks exactly like an app with no errors. A bare
    // "expected true to be false" would not say which app went dark.
    expect(absent, `${app} build step is missing: ${absent.join(", ")}`).toEqual([]);
  });
});

/**
 * The value `step` assigns to `key`, trimmed, or null when it assigns none.
 *
 * Same parsing contract as `assignsEnv` — comment lines skipped, key compared
 * by exact equality, never interpolated into a regex (CodeQL
 * js/incomplete-sanitization) — but returns the right-hand side so a test can
 * pin *which* secret or literal an app gets, not merely that it gets one.
 */
function envValue(step, key) {
  const match = step
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(\S.*)$/.exec(line))
    .find((parsed) => parsed?.[1] === key);
  return match ? match[2].trim() : null;
}

/**
 * Which Sentry project each static app reports to, and uploads source maps to.
 *
 * Presence alone is not enough: the presence checks above passed for months
 * while marketing and rialto-web inlined the hospitality project's DSN from the
 * shared `VITE_SENTRY_DSN` secret, so their errors were triaged under
 * `hospitality` and the `mattbutlerengineering` project (where
 * scripts/sentry-heartbeat-targets.mjs expects them) saw zero events
 * (maintenance:static-sentry-dsn-routing, alert #5941). One `SENTRY_PROJECT`
 * value also cannot be right for two different projects' source maps.
 *
 * The project slug is a literal, not a secret: a slug is not a credential, and
 * the org slug is already a literal in scripts/sentry-heartbeat.mjs.
 */
const EXPECTED_SENTRY_ROUTING = {
  marketing: {
    VITE_SENTRY_DSN: "${{ secrets.VITE_SENTRY_DSN_MBE }}",
    SENTRY_PROJECT: "mattbutlerengineering",
  },
  "rialto-web": {
    VITE_SENTRY_DSN: "${{ secrets.VITE_SENTRY_DSN_MBE }}",
    SENTRY_PROJECT: "mattbutlerengineering",
  },
  hospitality: {
    VITE_SENTRY_DSN: "${{ secrets.VITE_SENTRY_DSN }}",
    SENTRY_PROJECT: "${{ secrets.SENTRY_PROJECT }}",
  },
};

describe("deploy-static.yml routes each static app to its own Sentry project", () => {
  it("pins routing for exactly the apps in STATIC_APPS", () => {
    expect(Object.keys(EXPECTED_SENTRY_ROUTING).sort()).toEqual([...STATIC_APPS].sort());
  });

  it.each(STATIC_APPS)("routes the %s build to its expected DSN and project", (app) => {
    const step = buildStepFor(WORKFLOW, app);
    expect(step).not.toBeNull();

    const wrong = Object.entries(EXPECTED_SENTRY_ROUTING[app])
      .map(([key, expected]) => ({ key, expected, actual: envValue(step, key) }))
      .filter(({ expected, actual }) => actual !== expected)
      .map(({ key, expected, actual }) => `${key} is ${actual ?? "(unset)"}, expected ${expected}`);

    expect(wrong, `${app} build step: ${wrong.join("; ")}`).toEqual([]);
  });
});

/**
 * The text of one top-level job (`  <jobId>:` under `jobs:`), or null.
 *
 * Needed so the guard assertion below is scoped per job: a guard step in the
 * marketing job does nothing for the rialto-web build, and a whole-file search
 * would pass on the strength of the wrong job's step.
 */
function jobBlock(yaml, jobId) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1).findIndex((line) => /^ {2}[A-Za-z0-9_-]+:/.test(line));
  const end = rest === -1 ? lines.length : start + 1 + rest;
  return lines.slice(start, end).join("\n");
}

/**
 * Does this step run `require-deploy-secrets.mjs` against `secret`, with the
 * secret actually supplied in the step's env?
 *
 * Token comparison on non-comment lines, so a comment that merely mentions the
 * guard cannot satisfy it.
 */
function runsSecretGuard(step, secret) {
  const invokes = step
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .some((line) => {
      const tokens = line.trim().split(/\s+/);
      return tokens.includes("scripts/require-deploy-secrets.mjs") && tokens.includes(secret);
    });
  return invokes && envValue(step, secret) === `\${{ secrets.${secret} }}`;
}

/**
 * Apps whose build depends on a secret that does not exist until someone
 * creates it. An absent secret interpolates as "", which builds an SDK that
 * reports nothing with no error — the silent failure
 * maintenance:backend-observability-blackout was about. The guard makes that
 * deploy fail loudly instead.
 */
const SECRET_GUARDED_APPS = ["marketing", "rialto-web"];

describe("deploy-static.yml fails closed when VITE_SENTRY_DSN_MBE is absent", () => {
  it.each(SECRET_GUARDED_APPS)(
    "deploy-%s runs require-deploy-secrets.mjs ahead of its build",
    (app) => {
      const job = jobBlock(WORKFLOW, `deploy-${app}`);
      expect(job, `job deploy-${app} not found`).not.toBeNull();

      const steps = stepBlocks(job);
      const guardIndex = steps.findIndex((step) => runsSecretGuard(step, "VITE_SENTRY_DSN_MBE"));
      const buildIndex = steps.findIndex((step) =>
        step.includes(`pnpm build --filter=@mbe/${app}`)
      );

      expect(guardIndex, `deploy-${app} has no VITE_SENTRY_DSN_MBE guard step`).not.toBe(-1);
      expect(buildIndex, `deploy-${app} has no build step`).not.toBe(-1);
      expect(guardIndex, `deploy-${app} guard runs after its build`).toBeLessThan(buildIndex);
    }
  );
});

/**
 * The SENTRY_* variables sentryVitePlugin reads at build time.
 *
 * Setting them on the workflow step (asserted above) is not enough. Each build
 * runs `pnpm build` -> `turbo run build`, and turbo 2 runs in strict env mode:
 * a variable reaches the task's process only if turbo.json allowlists it. The
 * build task allowlisted `VITE_*` and `PUBLIC_*` only, so the DSN arrived and
 * these three were stripped, `disable: !process.env.SENTRY_AUTH_TOKEN` was
 * true, and the plugin ran as a no-op on every deploy: no debug IDs, no upload,
 * `.map` files shipped (maintenance:static-sourcemaps-confirm, E1-E4).
 *
 * `passThroughEnv`, not `env`: these change a side effect (the upload), not the
 * bytes in dist/, and `env` would fold the auth token into the task hash.
 */
const SENTRY_PLUGIN_ENV = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"];

describe("turbo.json lets the Sentry plugin env reach the build task", () => {
  const turbo = JSON.parse(readFileSync(resolve(ROOT, "turbo.json"), "utf8"));
  const build = turbo.tasks?.build ?? {};

  it.each(SENTRY_PLUGIN_ENV)("passes %s through to the build task", (key) => {
    const reachable = [...(build.passThroughEnv ?? []), ...(turbo.globalPassThroughEnv ?? [])];
    expect(reachable, `${key} is filtered out of turbo run build`).toContain(key);
  });

  it.each(SENTRY_PLUGIN_ENV)("keeps %s out of the build task hash", (key) => {
    const hashed = [...(build.env ?? []), ...(turbo.globalEnv ?? [])];
    expect(hashed).not.toContain(key);
  });
});

/**
 * The secrets sentryVitePlugin needs to upload, per app, checked for presence
 * before the build.
 *
 * An empty SENTRY_AUTH_TOKEN disables the plugin outright, and
 * verify-sentry-sourcemaps.mjs catches that (no debug IDs). An empty org or
 * project does not: canUploadSourceMaps() and createRelease() in
 * @sentry/bundler-plugins only `logger.warn` and return, never reaching
 * `errorHandler`, while debug-ID injection and `filesToDeleteAfterUpload` still
 * run. The dist then passes the post-build guard and deploys with nothing
 * uploaded (maintenance:static-sourcemaps-confirm, Review). Hospitality's
 * project slug comes from a secret; the other two apps use a literal, so only
 * hospitality guards SENTRY_PROJECT.
 */
const UPLOAD_SECRETS = {
  marketing: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG"],
  "rialto-web": ["SENTRY_AUTH_TOKEN", "SENTRY_ORG"],
  hospitality: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"],
};

describe("deploy-static.yml fails closed when a Sentry upload secret is absent", () => {
  it("covers exactly the apps in STATIC_APPS", () => {
    expect(Object.keys(UPLOAD_SECRETS).sort()).toEqual([...STATIC_APPS].sort());
  });

  it.each(STATIC_APPS)("deploy-%s presence-checks its upload secrets ahead of its build", (app) => {
    const job = jobBlock(WORKFLOW, `deploy-${app}`);
    expect(job, `job deploy-${app} not found`).not.toBeNull();

    const steps = stepBlocks(job);
    const buildIndex = steps.findIndex((step) => step.includes(`pnpm build --filter=@mbe/${app}`));
    expect(buildIndex, `deploy-${app} has no build step`).not.toBe(-1);

    const unguarded = UPLOAD_SECRETS[app].filter((secret) => {
      const guardIndex = steps.findIndex((step) => runsSecretGuard(step, secret));
      return guardIndex === -1 || guardIndex > buildIndex;
    });
    expect(unguarded, `deploy-${app} does not require: ${unguarded.join(", ")}`).toEqual([]);
  });
});
