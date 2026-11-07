/**
 * #8436: `gh issue/pr create --body @file` posts the literal string "@file";
 * only `--body-file` reads a file. Guard skills, routines, agents, workflows.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIRS = [".claude/skills", ".claude/agents", "docs/routines", ".github/workflows"];
const EXT = /\.(md|ya?ml|mjs|sh)$/;
// `--body @x`, `--body=@x`, `--body "@x"`, `--body '@x'`, `-b @x`
const LITERAL_BODY_AT = /(?:--body|(?:^|\s)-b)(?:=|[ \t]+)["']?@/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

describe("no literal `--body @file` (#8436)", () => {
  it("pattern catches the bad forms and spares --body-file", () => {
    for (const bad of ["--body @/tmp/p1.md", "--body=@/tmp/p1.md", '--body "@x.md"', "-b @x"]) {
      expect(LITERAL_BODY_AT.test(bad)).toBe(true);
    }
    for (const ok of ["--body-file /tmp/p1.md", '--body "Closes #1"', "--body-file=@x"]) {
      expect(LITERAL_BODY_AT.test(ok)).toBe(false);
    }
  });

  it("no skill/agent/routine doc or workflow uses it", () => {
    const hits = [];
    for (const dir of DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (LITERAL_BODY_AT.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}`);
          });
      }
    }
    expect(hits, "use --body-file <path>, not --body @<path>").toEqual([]);
  });
});
