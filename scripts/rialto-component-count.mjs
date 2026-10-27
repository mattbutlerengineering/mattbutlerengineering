/**
 * The one definition of "how many components Rialto ships".
 *
 * A component is an entry in Rialto's compiled manifest
 * (`@mattbutlerengineering/rialto/manifest`, generated from the library's
 * documented public exports by `packages/rialto/scripts/generate-manifest.ts`).
 * Folder counts, nav-page counts, and hand-written marketing copy are NOT the
 * definition — they drift (#7548). Every advertised count reads this value:
 * rialto-web's overview (`apps/rialto-web/component-count.config.ts`) and the
 * marketing site (`apps/marketing/scripts/write-rialto-component-count.mjs`).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Repo-relative path of the compiled manifest (needs a rialto build). */
export const RIALTO_MANIFEST_PATH = "packages/rialto/dist/manifest.json";

/**
 * @param {unknown} manifest - Parsed manifest JSON.
 * @returns {number}
 */
export function countManifestComponents(manifest) {
  const components =
    typeof manifest === "object" && manifest !== null
      ? /** @type {{ components?: unknown }} */ (manifest).components
      : undefined;
  if (!Array.isArray(components)) {
    throw new Error("Rialto manifest has no `components` array");
  }
  return components.length;
}

/**
 * What the surface-agreement guard does given the manifest's presence: CI must
 * never skip it silently (an unbuilt manifest there is a broken pipeline).
 *
 * @param {{ manifestBuilt: boolean, ci: boolean }} state
 * @returns {"run" | "skip" | "fail"}
 */
export function surfaceGuardMode({ manifestBuilt, ci }) {
  if (manifestBuilt) return "run";
  return ci ? "fail" : "skip";
}

/**
 * @param {string} root - Repo root.
 * @returns {number}
 */
export function readRialtoComponentCount(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, RIALTO_MANIFEST_PATH), "utf8"));
  return countManifestComponents(manifest);
}
