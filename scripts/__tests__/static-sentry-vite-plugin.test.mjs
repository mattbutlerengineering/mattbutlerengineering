import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/**
 * The static apps deploy-static.yml builds with a Sentry auth token.
 *
 * Enumerated, not globbed, for the same reason as STATIC_APPS in
 * deploy-static-sentry-env.test.mjs: a glob silently drops the app it can no
 * longer find. `apps/gen` also uses sentryVitePlugin but is not deployed by
 * deploy-static.yml, so it is out of scope here.
 */
const STATIC_APPS = ["marketing", "hospitality", "rialto-web"];

/**
 * The text of the `sentryVitePlugin({ ... })` call in a vite config, with
 * comment lines removed, or null when there is no such call.
 *
 * Brace-counted from the call's opening `(` so nested option objects
 * (`sourcemaps: { ... }`) stay inside the block. Comment lines are dropped so a
 * comment that merely mentions `errorHandler` cannot satisfy the assertion.
 */
function sentryPluginCall(source) {
  const start = source.indexOf("sentryVitePlugin({");
  if (start === -1) return null;
  const open = source.indexOf("(", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    if (source[i] === ")") depth -= 1;
    if (depth === 0) {
      return source
        .slice(start, i + 1)
        .split("\n")
        .filter((line) => !/^\s*\/\//.test(line))
        .join("\n");
    }
  }
  return null;
}

/** `errorHandler: (e) => { throw e; }` — the handler must rethrow what it was given. */
const RETHROWING_HANDLER = /errorHandler:\s*\((\w+)\)\s*=>\s*\{\s*throw\s+\1;?\s*\}/;

describe("sentryVitePlugin fails the build when a source-map upload fails", () => {
  /**
   * Without `errorHandler`, @sentry/bundler-plugins' handleRecoverableError
   * only calls `logger.error(...)` for a failed debug-ID upload or release
   * step, and the build goes green — a bad or under-scoped token would ship
   * unsymbolicated bundles with nothing red anywhere
   * (maintenance:static-sourcemaps-confirm, Evidence E7).
   */
  it.each(STATIC_APPS)("apps/%s/vite.config.ts supplies a rethrowing errorHandler", (app) => {
    const call = sentryPluginCall(
      readFileSync(resolve(ROOT, `apps/${app}/vite.config.ts`), "utf8")
    );
    expect(call, `apps/${app}/vite.config.ts has no sentryVitePlugin call`).not.toBeNull();
    expect(call).toMatch(RETHROWING_HANDLER);
  });

  /**
   * The handler only runs when the plugin is enabled. Keeping the
   * token-gated `disable` is what lets a local or CI build with no token still
   * succeed instead of failing on a missing credential.
   */
  it.each(STATIC_APPS)(
    "apps/%s/vite.config.ts still disables the plugin without a token",
    (app) => {
      const call = sentryPluginCall(
        readFileSync(resolve(ROOT, `apps/${app}/vite.config.ts`), "utf8")
      );
      expect(call).toContain("disable: !process.env.SENTRY_AUTH_TOKEN");
    }
  );
});
