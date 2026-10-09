import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PRE_COMMIT = readFileSync(resolve(ROOT, ".husky/pre-commit"), "utf8");
const ENTRY = resolve(ROOT, "tools/cli/src/check-adr.ts");

/**
 * `.husky/pre-commit` used to run `pnpm --filter @mbe/cli start check-adr`,
 * which loads the whole CLI (src/index.ts) and with it every command's
 * workspace imports. Their `dist/` folders are gitignored, so every commit in a
 * fresh worktree failed with ERR_MODULE_NOT_FOUND. #3989 rebuilt
 * packages/agent-core first, but the graph also reaches @mbe/gh-client
 * (commands/issue.ts) and others, so the commit still failed (seen 2026-10-06
 * on two worktrees in a row) until a full `pnpm build --filter @mbe/cli...`.
 *
 * check-adr itself needs none of that: commander, js-yaml, glob and two local
 * modules. A dedicated entry keeps the gate and drops the build.
 */
function relativeImportGraph(entry) {
  const seen = new Set();
  const packages = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, spec] of source.matchAll(
      /^\s*(?:import|export)\b[^"']*?from\s+["']([^"']+)["']/gm
    )) {
      if (spec.startsWith(".")) {
        stack.push(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
      } else {
        packages.add(spec);
      }
    }
  }
  return { files: seen, packages };
}

describe(".husky/pre-commit check-adr", () => {
  it("runs check-adr through its standalone entry, not the full CLI", () => {
    const commands = PRE_COMMIT.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    expect(commands.some((l) => l.includes("src/check-adr.ts") && l.includes("--staged"))).toBe(
      true
    );
    expect(commands.some((l) => l.includes("start check-adr"))).toBe(false);
  });

  it("the entry's module graph needs no workspace package build", () => {
    expect(existsSync(ENTRY)).toBe(true);
    const { files, packages } = relativeImportGraph(ENTRY);
    expect(files.size).toBeGreaterThan(1);
    expect([...packages].filter((p) => p.startsWith("@mbe/"))).toEqual([]);
  });
});
