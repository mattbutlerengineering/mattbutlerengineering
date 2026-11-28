import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** A file every rialto consumer resolves through `default` -> dist/ (#10179). */
export const RIALTO_DIST_MARKER = "packages/rialto/dist/lib/providers/index.js";

/** rialto plus the workspace packages it depends on, built from the repo root. */
export const RIALTO_BUILD_ARGS = [
  "build",
  "--filter",
  "@mattbutlerengineering/rialto^...",
  "--filter",
  "@mattbutlerengineering/rialto",
];

/**
 * Build rialto's closure when its dist/ is absent (a fresh cloud session); a
 * no-op when it is present, as in CI where the Build job runs first. Throws,
 * never skips, when the artifact still is not there afterwards.
 */
export function ensureWorkspaceBuild({ root, exists = existsSync, run = spawnSync }) {
  const marker = join(root, RIALTO_DIST_MARKER);
  if (exists(marker)) return "present";
  const result = run("pnpm", RIALTO_BUILD_ARGS, { cwd: root, stdio: "inherit" });
  if (result.status !== 0 || !exists(marker)) {
    throw new Error(
      `packages/rialto/dist is missing and building it failed. ` +
        `Run from the repo root: pnpm ${RIALTO_BUILD_ARGS.join(" ")}`
    );
  }
  return "built";
}
