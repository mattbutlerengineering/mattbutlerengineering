import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, artifactPaths } from "../regen-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const cli = (...args) =>
  execFileSync("node", [resolve(ROOT, "scripts/regen-manifest.mjs"), ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });

describe("artifactPaths", () => {
  it("is every family output plus the exports-map file, deduplicated", () => {
    const paths = artifactPaths();
    for (const f of FAMILIES) for (const o of f.outputs) expect(paths).toContain(o);
    expect(paths).toContain("packages/rialto/package.json");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("`--paths` prints exactly artifactPaths(), one per line", () => {
    expect(cli("--paths").trim().split("\n")).toEqual(artifactPaths());
  });
});

describe("hooks do not run a family twice per edit", () => {
  it("every family a path touches is handled by exactly one hook mode", () => {
    const edit = "packages/rialto/package.json";
    const all = JSON.parse(cli("--families-for", edit)).map((f) => f.id);
    const stage = JSON.parse(cli("--families-for", edit, "--hook-mode", "stage")).map((f) => f.id);
    const warn = JSON.parse(cli("--families-for", edit, "--hook-mode", "warn")).map((f) => f.id);
    expect([...stage, ...warn].sort()).toEqual([...all].sort());
    expect(stage.filter((id) => warn.includes(id))).toEqual([]);
  });

  it("a source edit in a package lands in the warn hook only", () => {
    const src = "packages/rialto/src/index.ts";
    expect(JSON.parse(cli("--families-for", src, "--hook-mode", "stage"))).toEqual([]);
    expect(JSON.parse(cli("--families-for", src, "--hook-mode", "warn")).map((f) => f.id)).toEqual([
      "llms-txt",
    ]);
  });

  it("the two hook scripts pass complementary --hook-mode values", () => {
    expect(read(".claude/hooks/regen-dep-graph.sh")).toMatch(/--hook-mode stage/);
    expect(read(".claude/hooks/regen-llms.sh")).toMatch(/--hook-mode warn/);
  });
});

describe("workflows derive artifact sets from the manifest", () => {
  it("drift-fix has no hand-copied add-paths list", () => {
    const wf = read(".github/workflows/drift-fix.yml");
    expect(wf).toMatch(/regen-manifest\.mjs --paths/);
    expect(wf).not.toMatch(/^\s*add-paths:\s*\|/m);
    expect(wf).not.toMatch(/^\s+llms-full\.txt$/m);
  });

  it("post-merge regenerates via `pnpm regen`, not its own loop, and stages manifest paths", () => {
    const wf = read(".github/workflows/post-merge.yml");
    expect(wf).toMatch(/run: pnpm regen\b/);
    expect(wf).not.toMatch(/for pkg in packages/);
    expect(wf).toMatch(/regen-manifest\.mjs --paths/);
    expect(wf).not.toMatch(/git add -A/);
  });
});

describe("single --check implementation", () => {
  it("regen-manifest.mjs no longer carries its own --check", () => {
    expect(read("scripts/regen-manifest.mjs")).not.toMatch(/"--check"/);
  });
});
