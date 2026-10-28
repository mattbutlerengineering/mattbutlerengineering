/**
 * The ui-quality per-fire work dir: the one place that knows where things live.
 *
 * `.ui-quality/` is gitignored and holds one fire's inputs and outputs
 * (docs/features/ui-quality-loop/architecture.md § Components). The capture
 * layer (packages/ui-quality-capture/src/ui-quality-capture.ts) writes
 * `captures/<app>/manifest.jsonl` beside the plan it is handed; every script
 * in this directory reads it back through `readManifests` here.
 *
 * Zero-manifest policy: `readManifests` returns `{}` — "nothing captured" is
 * data, and `ledger.mjs record` must still run on it. A caller for which that is
 * an input error (`detect.mjs`) passes `{ required: true }` and gets a throw.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const WORK_DIR = ".ui-quality";
export const CAPTURES_DIR = "captures";
const MANIFEST_FILE = "manifest.jsonl";
export const JUDGE_STATUS_FILE = "judge-status.json";

/** `<root>/.ui-quality[/<...parts>]` */
export function workPath(root, ...parts) {
  return join(root, WORK_DIR, ...parts);
}

/** `<root>/.ui-quality/captures[/<app>]` */
export function capturesDir(root, app) {
  return app === undefined ? workPath(root, CAPTURES_DIR) : workPath(root, CAPTURES_DIR, app);
}

/**
 * app → manifest rows, from every `captures/<app>/manifest.jsonl` present,
 * apps in sorted order. A malformed line throws an error naming the file.
 *
 * @param {string} root - repo root
 * @param {{ required?: boolean }} [opts] - `required`: throw when no manifest exists
 * @returns {Record<string, object[]>}
 */
export function readManifests(root, { required = false } = {}) {
  const dir = capturesDir(root);
  const apps = existsSync(dir)
    ? readdirSync(dir)
        .filter((app) => existsSync(join(dir, app, MANIFEST_FILE)))
        .sort()
    : [];
  if (required && apps.length === 0) {
    throw new Error(`no capture manifest under ${WORK_DIR}/${CAPTURES_DIR}/`);
  }
  return Object.fromEntries(
    apps.map((app) => {
      const file = join(dir, app, MANIFEST_FILE);
      try {
        const rows = readFileSync(file, "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => JSON.parse(line));
        return [app, rows];
      } catch (err) {
        throw new Error(`${file} is unreadable: ${err.message}`, { cause: err });
      }
    })
  );
}
