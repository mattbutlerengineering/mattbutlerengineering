import fs from "node:fs";
import path from "node:path";

const TOP_DIRS = ["apps", "packages", "services", "tools"];

function groupByPackage(files) {
  const groups = new Map();
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    const parts = rel.split(path.sep);
    if (parts.length >= 2 && TOP_DIRS.includes(parts[0])) {
      const pkgDir = path.join(parts[0], parts[1]);
      if (!groups.has(pkgDir)) groups.set(pkgDir, []);
      groups.get(pkgDir).push(file);
    }
  }
  return groups;
}

const quote = (files) => files.map((f) => `"${f}"`).join(" ");

/**
 * `prettier --write` over the given files.
 *
 * `.prettierignore` is honoured even for explicitly-passed paths (verified:
 * a file matched by an ignore entry is left untouched by `--write` and
 * passes `--check`), so the generated artifacts that file protects from a
 * `pnpm regen` ping-pong stay out of scope here for free.
 */
const prettierWrite = (files) => `prettier --config .prettierrc.js --write ${quote(files)}`;

// Everything Prettier owns that ESLint does not also touch. Kept disjoint
// from the `{ts,tsx}` glob below on purpose: lint-staged runs separate globs
// concurrently, so an overlapping glob would let `eslint --fix` and
// `prettier --write` write the same file at the same time. Within one glob,
// commands run in order, which is why the ts/tsx entry chains them instead.
const PRETTIER_ONLY_GLOB = "**/*.{js,jsx,mjs,cjs,json,css,scss,less,html,md,yml,yaml,graphql}";

export default {
  "**/*.{ts,tsx}": (files) => {
    const filtered = files.filter((f) => !f.includes("/generated/"));
    if (filtered.length === 0) return [];
    const groups = groupByPackage(filtered);
    const commands = [];
    for (const [pkgDir, pkgFiles] of groups) {
      const localConfig = path.resolve(pkgDir, "eslint.config.js");
      const configFlag = fs.existsSync(localConfig) ? `--config "${localConfig}"` : "";
      commands.push(`eslint --fix ${configFlag} ${quote(pkgFiles)}`);
    }
    // Every staged ts/tsx file, not just the ones `groupByPackage` matched.
    // That grouping only recognises apps/packages/services/tools, so the
    // tracked .ts files outside those (infrastructure/pulumi/**,
    // tests/smoke/**, vitest.config.ts) produced ZERO commands: the glob
    // matched, lint-staged reported "1 file", and nothing ran on it.
    commands.push(prettierWrite(filtered));
    return commands;
  },

  [PRETTIER_ONLY_GLOB]: (files) => [prettierWrite(files)],
};
