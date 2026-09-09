import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const WORKFLOW_FILES = ["preview-deploy.yml", "deploy-static.yml"];

/**
 * The single Wrangler CLI version every workflow that deploys or manages a
 * Cloudflare Worker is allowed to run.
 *
 * `deploy-static.yml` (production) already pinned `npx wrangler@3` — a
 * floating major, not an exact version. `npm view wrangler@3 version`
 * resolves that today to 3.114.17 (the highest published 3.x release,
 * npm's "legacy" dist-tag) — the version production is actually shipping
 * with right now. `preview-deploy.yml` ran bare `npx wrangler` with no pin
 * at all, resolving to whatever `latest` npm serves (4.x at the time this
 * test was written) — a different major than production, silently. This
 * test pins both workflows to the exact version production already
 * resolves to, so the pin change ships zero behavior change to production
 * and only pulls preview back in line with it.
 *
 * Same class as the Pulumi CLI pin in `pulumi-cli-pin.test.mjs`: a tool
 * version can change with a zero-diff push (runner image bump, or here, npm
 * simply publishing a new major) — pin explicitly, and back it with a test
 * that reads the real workflow files.
 */
const PINNED_VERSION = "3.114.17";

describe.each(WORKFLOW_FILES)("%s wrangler CLI pin", (file) => {
  const workflow = readFileSync(resolve(ROOT, ".github/workflows", file), "utf8");

  it("pins every wrangler invocation to the exact production version", () => {
    const invocations = [
      ...workflow.matchAll(/\bnpx\s+wrangler(@\S+)?\s+(deploy|delete|rollback)\b/g),
    ];
    expect(invocations.length).toBeGreaterThan(0);

    for (const [full, pin] of invocations) {
      expect(pin, `expected an exact pin in "${full}"`).toBe(`@${PINNED_VERSION}`);
    }
  });

  it("leaves no wrangler invocation unpinned or on a floating major", () => {
    // A bare `npx wrangler ...` (no `@version` at all) or a floating major
    // pin (`@3`, `@latest`) must never survive — both resolve to whatever
    // npm serves that day, which is exactly the drift this test exists to
    // prevent.
    const bareOrFloating = [
      ...workflow.matchAll(/\bnpx\s+wrangler(@3|@latest)?\s+(deploy|delete|rollback)\b/g),
    ].filter(([, pin]) => pin !== `@${PINNED_VERSION}`);

    expect(bareOrFloating.map(([full]) => full)).toEqual([]);
  });
});
