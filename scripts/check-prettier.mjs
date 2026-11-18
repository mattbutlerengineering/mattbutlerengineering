#!/usr/bin/env node
/**
 * `pnpm check:prettier` entry (#9078): `prettier --check` over the repo and
 * `.claude` markdown, minus the markdown of SHIPPED pipeline runs.
 *
 * `.prettierignore` is static and cannot tell a shipped run (has `retro.md`)
 * from a live one, so the shipped run directories are computed from
 * `git ls-files` and handed to prettier as an extra ignore file. Only `*.md`
 * under a shipped run is skipped; a live run and every other file stay
 * checked. Write paths (lint-staged `prettier --write`) never go through here.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { shippedRunDirs } from "./lib/shipped-runs.mjs";

export const PRETTIER_TARGETS = [".", ".claude/**/*.md"];
// Passing any --ignore-path replaces prettier's defaults, so name both.
const BASE_IGNORE_FILES = [".gitignore", ".prettierignore"];

/** @param {string[]} files tracked repo-relative posix paths */
export function shippedRunIgnoreLines(files) {
  return shippedRunDirs(files).map((dir) => `${dir}/**/*.md`);
}

/** @param {string} [extraIgnorePath] */
export function prettierArgs(extraIgnorePath) {
  const ignores = [...BASE_IGNORE_FILES, ...(extraIgnorePath ? [extraIgnorePath] : [])];
  return [
    "--experimental-cli",
    "--check",
    ...ignores.flatMap((p) => ["--ignore-path", p]),
    ...PRETTIER_TARGETS,
  ];
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tracked = execFileSync("git", ["ls-files", "docs/features", "docs/fixes"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  // Ignore patterns resolve relative to the ignore file's directory, so it
  // must live in the repo root (a tmpdir file silently matches nothing).
  const ignoreFile = path.join(root, `.check-prettier-${process.pid}.ignore`);
  try {
    fs.writeFileSync(ignoreFile, `${shippedRunIgnoreLines(tracked).join("\n")}\n`);
    const result = spawnSync(
      path.join(root, "node_modules/.bin/prettier"),
      prettierArgs(ignoreFile),
      {
        cwd: root,
        stdio: "inherit",
      }
    );
    process.exitCode = result.status ?? 1;
  } finally {
    fs.rmSync(ignoreFile, { force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
