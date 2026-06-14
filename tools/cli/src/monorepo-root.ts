/**
 * Shared monorepo root resolver.
 *
 * Walks up from startDir until it finds pnpm-workspace.yaml.
 * Falls back to startDir if not found within maxDepth steps.
 *
 * Previously copied verbatim into ~13 command files. Import from here instead.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const MAX_DEPTH = 10;

export function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}
