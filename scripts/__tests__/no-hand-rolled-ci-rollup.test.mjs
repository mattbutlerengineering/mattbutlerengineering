// Guard (#8891): agent instructions must read a PR's CI state through
// `node scripts/ci-gate-status.mjs check --pr <N>` (classifyCiGateStatus), the
// one classifier that tells green / failed / pending / gate-missing /
// gate-unattributed apart. Hand-rolled filters once read IN_PROGRESS as "never
// ran" (#3969), and `conclusion` is not a valid `gh pr checks --json` field.
//
// A bare `gh pr checks <N> --watch` used only to wait is allowed.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const RULES = [
  {
    name: "gh pr checks with --json/--jq",
    test: (line) => /gh pr checks\b/.test(line) && /--(json|jq)\b/.test(line),
  },
  {
    name: "raw check-runs?check_name= read",
    test: (line) => line.includes("check-runs?check_name="),
  },
];

/**
 * @param {string} text file contents
 * @returns {{ line: number; rule: string; text: string }[]}
 */
export function findHandRolledCiReads(text) {
  return text.split("\n").flatMap((text_, index) =>
    RULES.filter((rule) => rule.test(text_)).map((rule) => ({
      line: index + 1,
      rule: rule.name,
      text: text_.trim().slice(0, 120),
    }))
  );
}

function listSkillFiles() {
  const skillsDir = join(REPO_ROOT, ".claude/skills");
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(".claude/skills", entry.name, "SKILL.md"))
    .filter((path) => {
      try {
        readFileSync(join(REPO_ROOT, path));
        return true;
      } catch {
        return false;
      }
    });
}

function listRoutineDocs() {
  return readdirSync(join(REPO_ROOT, "docs/routines"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => join("docs/routines", name));
}

export function guardedFiles() {
  return [...listSkillFiles(), ".claude/implement-queue.md", ...listRoutineDocs()];
}

/** @param {string[]} files repo-relative paths */
export function scan(files, root = REPO_ROOT) {
  return files.flatMap((file) =>
    findHandRolledCiReads(readFileSync(join(root, file), "utf8")).map((hit) => ({
      file: relative(".", file),
      ...hit,
    }))
  );
}

describe("findHandRolledCiReads", () => {
  it("flags gh pr checks --json and --jq", () => {
    expect(findHandRolledCiReads("gh pr checks 5 --json name,state")).toHaveLength(1);
    expect(findHandRolledCiReads("gh pr checks 5 --jq '.[]'")).toHaveLength(1);
  });

  it("flags a raw CI Gate check-runs read", () => {
    const hits = findHandRolledCiReads("gh api '.../check-runs?check_name=CI%20Gate'");
    expect(hits).toHaveLength(1);
  });

  it("allows a bare --watch and the classifier CLI", () => {
    expect(findHandRolledCiReads("gh pr checks 5 --watch --fail-fast")).toEqual([]);
    expect(findHandRolledCiReads("node scripts/ci-gate-status.mjs check --pr 5")).toEqual([]);
  });
});

describe("agent instructions read CI through ci-gate-status.mjs", () => {
  it("has no hand-rolled CI rollup reads", () => {
    const hits = scan(guardedFiles());
    const report = hits.map((h) => `${h.file}:${h.line} [${h.rule}] ${h.text}`);
    expect(report).toEqual([]);
  });
});
