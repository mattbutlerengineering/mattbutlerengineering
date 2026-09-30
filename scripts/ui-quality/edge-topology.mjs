/**
 * edge-topology.mjs — which deployed app serves a URL path, read from the
 * edge router's own route table (docs/features/ui-quality-loop/architecture.md
 * § Resolutions "Sibling-app links resolve through the edge topology").
 *
 * `infrastructure/worker/routes-config.json` `staticRoutes` is read as data:
 * array order, first entry whose `prefix` the path `startsWith` (an empty
 * prefix is the catch-all) — the rule `edge-router.js` routes by. Each entry
 * is joined to an app directory by worker name: the first label of its
 * `bindingOrigin` host equals `apps/<dir>/wrangler.toml` `name`. `<dir>` is the
 * ledger app when the ledger has rows for it; otherwise the mount is served
 * by a deployed app outside the inventory (`app: null`).
 *
 * Nothing is hand-listed: a mount whose worker has no wrangler.toml, or a
 * ledger app that no mount serves, throws — the caller exits 2.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROUTES_CONFIG_FILE = "infrastructure/worker/routes-config.json";
const APPS_DIR = "apps";

/** The top-level `name = "…"` of a wrangler.toml (before any `[section]`); null when absent. */
export function wranglerName(text) {
  for (const line of text.split("\n")) {
    if (/^\s*\[/.test(line)) return null;
    const m = line.match(/^\s*name\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Read the topology from disk.
 * @returns {{ staticRoutes: Array<{prefix: string, bindingOrigin: string}>, workers: Record<string, string> }}
 *   workers: app dir → wrangler worker name
 */
export function readEdgeTopology(root) {
  const config = JSON.parse(readFileSync(join(root, ROUTES_CONFIG_FILE), "utf8"));
  const appsDir = join(root, APPS_DIR);
  const workers = {};
  for (const dir of readdirSync(appsDir).sort()) {
    const file = join(appsDir, dir, "wrangler.toml");
    if (!existsSync(file)) continue;
    const name = wranglerName(readFileSync(file, "utf8"));
    if (name) workers[dir] = name;
  }
  return { staticRoutes: config.staticRoutes, workers };
}

const workerOf = (bindingOrigin) => new URL(bindingOrigin).hostname.split(".")[0];

/**
 * Join mounts to app dirs and to the ledger.
 * @param {{ staticRoutes: object[], workers: Record<string, string> }} topology
 * @param {string[]} ledgerApps
 * @returns {{ mounts: Array<{ prefix: string, worker: string, dir: string, app: string|null }> }}
 */
export function joinEdgeTopology({ staticRoutes, workers }, ledgerApps) {
  if (!Array.isArray(staticRoutes) || staticRoutes.length === 0) {
    throw new Error(`${ROUTES_CONFIG_FILE} has no staticRoutes`);
  }
  const dirByWorker = new Map(Object.entries(workers).map(([dir, name]) => [name, dir]));
  const mounts = staticRoutes.map((r) => {
    const worker = workerOf(r.bindingOrigin);
    const dir = dirByWorker.get(worker);
    if (!dir) {
      throw new Error(
        `staticRoutes prefix ${JSON.stringify(r.prefix)} is served by worker ${worker}, which no apps/*/wrangler.toml names`
      );
    }
    return { prefix: r.prefix, worker, dir, app: ledgerApps.includes(dir) ? dir : null };
  });
  const unserved = ledgerApps.filter((app) => !mounts.some((m) => m.app === app));
  if (unserved.length > 0) {
    throw new Error(`ledger app(s) ${unserved.join(", ")} served by no staticRoutes entry`);
  }
  return { mounts };
}

/** The mount serving an absolute path — first match in array order, the edge router's rule. */
export function mountFor(topology, absolutePath) {
  return topology.mounts.find((m) => (m.prefix ? absolutePath.startsWith(m.prefix) : true)) ?? null;
}

/** An app's own mount prefix. */
export function prefixOf(topology, app) {
  return topology.mounts.find((m) => m.app === app).prefix;
}

/** The path the owning app sees once the edge strips its mount (`|| "/"`, as the router does). */
export function stripMount(mount, absolutePath) {
  return mount.prefix ? absolutePath.slice(mount.prefix.length) || "/" : absolutePath;
}
