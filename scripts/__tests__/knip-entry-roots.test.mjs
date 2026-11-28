import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findReferencedScripts, findRootsKnipCannotSee } from "../lib/knip-entry-roots.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const KNIP_BIN = `${REPO_ROOT}node_modules/knip/bin/knip.js`;

/** knip.jsonc with whole-line `//` comments removed (the schema URL contains `//`). */
function loadKnipConfig() {
  const text = readFileSync(`${REPO_ROOT}knip.jsonc`, "utf-8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text);
}

const SCRIPTS_ENTRY = loadKnipConfig().workspaces.scripts.entry;
// Globs that are not single-file roots: tests and tool configs.
const isGlob = (entry) => entry.includes("*");

/**
 * #7488: the `scripts` workspace used to treat every file as an entry
 * (`**\/*`), so no script could ever be reported unused. The real roots are the
 * files something outside the import graph runs by path.
 */
describe("knip scripts workspace entry", () => {
  it("is not a catch-all glob", () => {
    expect(SCRIPTS_ENTRY).not.toContain("**/*");
    expect(SCRIPTS_ENTRY.filter((entry) => /^\*\*\/\*/.test(entry))).toEqual([]);
  });

  // #9079: list only the roots knip's own plugins cannot see (Claude hooks,
  // skills, agents, routines). Scripts run from package.json, workflows or
  // husky are found by knip itself, so listing them is a "redundant pattern" hint.
  it("lists exactly the roots knip cannot see: Claude settings, hooks, skills, agents, routines", () => {
    const listed = SCRIPTS_ENTRY.filter((entry) => !isGlob(entry)).sort();
    const expected = findRootsKnipCannotSee(REPO_ROOT);
    const notListed = expected.filter((file) => !listed.includes(file));
    const stale = listed.filter((file) => !expected.includes(file));
    expect({ notListed, stale }).toEqual({ notListed: [], stale: [] });
  });

  it("keeps the test tree as an entry", () => {
    expect(SCRIPTS_ENTRY.some((entry) => entry.startsWith("__tests__/"))).toBe(true);
  });
});

describe("knip on an unreferenced scripts/ file", () => {
  // Runs the repo's real scripts-workspace entry list against a throwaway project,
  // so the probe never touches scripts/ (other tests hash that tree concurrently).
  it("fails and names the file, while listed roots and test-imported files pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "knip-probe-"));
    try {
      const write = (rel, body) => {
        mkdirSync(dirname(join(dir, rel)), { recursive: true });
        writeFileSync(join(dir, rel), body);
      };
      write("package.json", JSON.stringify({ name: "probe", private: true, type: "module" }));
      write("pnpm-workspace.yaml", "packages:\n  - scripts\n");
      write("scripts/package.json", JSON.stringify({ name: "probe-scripts", type: "module" }));
      write("scripts/__tests__/used.test.mjs", 'import { used } from "../used.mjs";\nused();\n');
      write("scripts/used.mjs", "export const used = () => 1;\n");
      write("scripts/hook-input.mjs", "console.log(1);\n");
      write("scripts/zz-orphan.mjs", "export const orphan = 1;\n");
      write(
        "knip.json",
        JSON.stringify({ workspaces: { ".": { entry: [] }, scripts: { entry: SCRIPTS_ENTRY } } })
      );
      const run = spawnSync(process.execPath, [KNIP_BIN, "--no-config-hints"], {
        cwd: dir,
        encoding: "utf-8",
      });
      const out = `${run.stdout}${run.stderr}`;
      expect(run.status).not.toBe(0);
      expect(out).toContain("scripts/zz-orphan.mjs");
      expect(out).not.toContain("scripts/used.mjs");
      expect(out).not.toContain("scripts/hook-input.mjs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});

describe("knip root workspace Claude entries", () => {
  const rootEntry = loadKnipConfig().workspaces["."].entry.filter((e) => e.startsWith(".claude/"));
  const onDisk = (dir, ext) =>
    existsSync(`${REPO_ROOT}${dir}`)
      ? readdirSync(`${REPO_ROOT}${dir}`)
          .filter((f) => f.endsWith(ext))
          .map((f) => `${dir}/${f}`)
      : [];
  const hooks = onDisk(".claude/hooks", ".mjs");
  // A script a workflow runs is already an entry (knip's GitHub Actions plugin), so
  // listing it in knip.jsonc is a "redundant pattern" hint (#10153).
  const workflows = readdirSync(`${REPO_ROOT}.github/workflows`)
    .map((f) => readFileSync(`${REPO_ROOT}.github/workflows/${f}`, "utf-8"))
    .join("\n");
  const skillScripts = readdirSync(`${REPO_ROOT}.claude/skills`)
    .flatMap((skill) => onDisk(`.claude/skills/${skill}/scripts`, ".mjs"))
    .filter((script) => !workflows.includes(`node ${script}`));

  it("lists every hook and skill script explicitly, with no glob", () => {
    expect(rootEntry.some((e) => e.includes("*"))).toBe(false);
    expect(rootEntry.sort()).toEqual([...hooks, ...skillScripts].sort());
  });

  it("only lists hooks wired in .claude/settings.json", () => {
    const settings = readFileSync(`${REPO_ROOT}.claude/settings.json`, "utf-8");
    expect(hooks.filter((h) => !settings.includes(h))).toEqual([]);
  });

  it("only lists skill scripts named in their SKILL.md", () => {
    const unnamed = skillScripts.filter((script) => {
      const skillDir = script.split("/scripts/")[0];
      return !readFileSync(`${REPO_ROOT}${skillDir}/SKILL.md`, "utf-8").includes(
        script.split("/").pop()
      );
    });
    expect(unnamed).toEqual([]);
  });
});

describe("findReferencedScripts / findRootsKnipCannotSee (#9079)", () => {
  function fixture(files) {
    const dir = mkdtempSync(join(tmpdir(), "knip-roots-"));
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    return dir;
  }

  it("finds scripts named through $CLAUDE_PROJECT_DIR in .claude/settings.json", () => {
    const dir = fixture({
      "scripts/boot.mjs": "",
      "scripts/braced.mjs": "",
      ".claude/settings.json":
        '{"c":"node \\"$CLAUDE_PROJECT_DIR/scripts/boot.mjs\\" && node ${CLAUDE_PROJECT_DIR}/scripts/braced.mjs"}',
    });
    try {
      expect(findReferencedScripts(dir)).toEqual(["boot.mjs", "braced.mjs"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scans .claude/implement-queue.md", () => {
    const dir = fixture({
      "scripts/q.mjs": "",
      ".claude/implement-queue.md": "run `node scripts/q.mjs`",
    });
    try {
      expect(findReferencedScripts(dir)).toEqual(["q.mjs"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops scripts that package.json, workflows or husky already reach", () => {
    const dir = fixture({
      "scripts/a.mjs": "",
      "scripts/b.mjs": "",
      "scripts/c.mjs": "",
      "package.json": '{"scripts":{"a":"node scripts/a.mjs"}}',
      ".github/workflows/w.yml": "run: node scripts/b.mjs",
      ".claude/skills/s/SKILL.md": "node scripts/a.mjs and node scripts/c.mjs",
    });
    try {
      expect(findRootsKnipCannotSee(dir)).toEqual(["c.mjs"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
