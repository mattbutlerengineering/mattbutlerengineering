import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, llmsPackages, familiesForChangedFile } from "../regen-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SOURCE = readFileSync(resolve(__dirname, "../regen-manifest.mjs"), "utf8");
const REGEN_SOURCE = readFileSync(resolve(__dirname, "../regen.mjs"), "utf8");

describe("regen-manifest", () => {
  it("exports an array of families", () => {
    expect(Array.isArray(FAMILIES)).toBe(true);
    expect(FAMILIES.length).toBeGreaterThanOrEqual(5);
  });

  it("each family has required fields", () => {
    for (const f of FAMILIES) {
      expect(typeof f.id, `${f.id}.id`).toBe("string");
      expect(typeof f.label, `${f.id}.label`).toBe("string");
      expect(typeof f.command, `${f.id}.command`).toBe("string");
      expect(Array.isArray(f.outputs), `${f.id}.outputs`).toBe(true);
      expect(f.outputs.length, `${f.id}.outputs length`).toBeGreaterThan(0);
    }
  });

  it("family ids are unique", () => {
    const ids = FAMILIES.map((f) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("contains the 5 required families", () => {
    const ids = new Set(FAMILIES.map((f) => f.id));
    expect(ids.has("llms-txt")).toBe(true);
    expect(ids.has("rialto-registry")).toBe(true);
    expect(ids.has("rialto-catalog-schemas")).toBe(true);
    expect(ids.has("dep-graph-md")).toBe(true);
    expect(ids.has("dep-graph-json")).toBe(true);
  });

  it("llms-txt outputs include the root llms.txt", () => {
    const llms = FAMILIES.find((f) => f.id === "llms-txt");
    expect(llms.outputs).toContain("llms.txt");
  });

  it("llms-txt outputs include all workspace packages with llms.txt", () => {
    const llms = FAMILIES.find((f) => f.id === "llms-txt");
    // At least the main app and service packages
    const expected = [
      "apps/hospitality/llms.txt",
      "services/agent/llms.txt",
      "packages/rialto/llms.txt",
    ];
    for (const e of expected) {
      expect(llms.outputs, `expected ${e}`).toContain(e);
    }
    // All workspace outputs end with /llms.txt or /llms-full.txt
    const workspaceOutputs = llms.outputs.filter((o) => o !== "llms.txt" && o !== "llms-full.txt");
    for (const o of workspaceOutputs) {
      expect(o).toMatch(/\/llms(?:-full)?\.txt$/);
    }
  });

  it("llmsPackages() returns directory paths (not llms.txt paths)", () => {
    const pkgs = llmsPackages();
    expect(Array.isArray(pkgs)).toBe(true);
    // Root is represented as "."
    expect(pkgs).toContain(".");
    // No entry ends with llms.txt
    for (const p of pkgs) {
      expect(p).not.toMatch(/llms\.txt$/);
    }
  });

  it("llmsPackages() length matches llms-txt llms.txt entries (not llms-full.txt)", () => {
    const llms = FAMILIES.find((f) => f.id === "llms-txt");
    const txtCount = llms.outputs.filter((o) => o === "llms.txt" || o.endsWith("/llms.txt")).length;
    const pkgs = llmsPackages();
    expect(pkgs.length).toBe(txtCount);
  });

  it("rialto-registry command references the correct filter", () => {
    const f = FAMILIES.find((f) => f.id === "rialto-registry");
    expect(f.command).toContain("@mattbutlerengineering/rialto");
  });

  it("rialto-catalog-schemas command references the correct filter", () => {
    const f = FAMILIES.find((f) => f.id === "rialto-catalog-schemas");
    expect(f.command).toContain("@mbe/rialto-catalog");
  });

  it("dep-graph families map to distinct output paths", () => {
    const md = FAMILIES.find((f) => f.id === "dep-graph-md");
    const json = FAMILIES.find((f) => f.id === "dep-graph-json");
    expect(md.outputs[0]).toContain(".md");
    expect(json.outputs[0]).toContain(".json");
    expect(md.outputs[0]).not.toBe(json.outputs[0]);
  });

  it("llms-txt outputs do NOT include deleted packages/feature-flags", () => {
    const llms = FAMILIES.find((f) => f.id === "llms-txt");
    expect(llms.outputs).not.toContain("packages/feature-flags/llms.txt");
    expect(llms.outputs).not.toContain("packages/feature-flags/llms-full.txt");
  });

  // Regression test for #2937: committed llms.txt/llms-full.txt files that
  // are never listed as manifest outputs are silently skipped by both
  // `pnpm regen` (never regenerated) and `pnpm regen --check` (never
  // verified) — they can drift indefinitely with no CI signal.
  it("every git-tracked llms.txt/llms-full.txt file has a manifest entry", () => {
    const tracked = execFileSync("git", ["ls-files", "*llms*.txt"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    const llms = FAMILIES.find((f) => f.id === "llms-txt");
    const manifestOutputs = new Set(llms.outputs);
    const uncovered = tracked.filter((p) => !manifestOutputs.has(p));
    expect(
      uncovered,
      `committed llms artifacts missing a regen-manifest entry: ${uncovered.join(", ")}`
    ).toEqual([]);
  });

  it("no family command references the non-existent pack-all alias", () => {
    // `pack-all` is not a real CLI command — running it errors with
    // "unknown command 'pack-all'". The command field is the remediation
    // hint printed by `regen --check`, so it must be runnable as-is.
    for (const f of FAMILIES) {
      expect(f.command, `${f.id}.command`).not.toContain("pack-all");
    }
  });

  it("llms-txt remediation hint is the runnable `pnpm regen` command", () => {
    const llms = FAMILIES.find((f) => f.id === "llms-txt");
    // regen.mjs special-cases the llms-txt family (loops `pack <pkg>`), so the
    // command field is only the human-facing fix hint. `pnpm regen` is the
    // canonical, always-correct way to regenerate llms.txt files.
    expect(llms.command).toBe("pnpm regen");
  });

  it("llms-txt outputs include llms-full.txt alongside every llms.txt", () => {
    const llms = FAMILIES.find((f) => f.id === "llms-txt");
    const txts = llms.outputs.filter((o) => o.endsWith("/llms.txt") || o === "llms.txt");
    for (const txt of txts) {
      const fullTxt =
        txt === "llms.txt" ? "llms-full.txt" : txt.replace(/\/llms\.txt$/, "/llms-full.txt");
      expect(llms.outputs, `expected ${fullTxt} alongside ${txt}`).toContain(fullTxt);
    }
  });

  // Security: shell command injection from environment (CodeQL #112)
  // execSync() invokes a shell and is susceptible to env-var injection.
  // The safe alternative is execFileSync() with an args array (no shell).
  it("does not use execSync (shell-based, env-injection risk)", () => {
    expect(SOURCE).not.toContain("execSync");
  });

  it("uses execFileSync for subprocess execution (no shell invocation)", () => {
    expect(SOURCE).toContain("execFileSync");
  });

  // Ordering invariant: llms-txt embeds content from generated-schemas.ts.
  // If regen.mjs runs regenLlms() before regenFamily() for rialto-catalog-schemas,
  // the llms files embed the pre-regen schema → CI detects drift after regenerating
  // the schema. Enforcing this order here prevents the recurring treadmill.
  it("regen.mjs runRegen executes regenLlms() after all regenFamily() calls", () => {
    const fnStart = REGEN_SOURCE.indexOf("function runRegen()");
    expect(fnStart, "runRegen() not found in regen.mjs").toBeGreaterThan(-1);
    const afterFn = REGEN_SOURCE.slice(fnStart);
    const regenLlmsIdx = afterFn.lastIndexOf("regenLlms()");
    const regenFamilyIdx = afterFn.lastIndexOf("regenFamily(family)");
    expect(regenLlmsIdx, "regenLlms() not found in runRegen").toBeGreaterThan(-1);
    expect(regenFamilyIdx, "regenFamily(family) not found in runRegen").toBeGreaterThan(-1);
    expect(
      regenLlmsIdx,
      "regenLlms() must come AFTER regenFamily(family) so llms embeds the freshly-generated schema"
    ).toBeGreaterThan(regenFamilyIdx);
  });
});

// ---------------------------------------------------------------------------
// familiesForChangedFile — issue #2968: hooks query the manifest instead of
// re-encoding it.
// ---------------------------------------------------------------------------
describe("familiesForChangedFile", () => {
  it("maps a package.json edit to both dep-graph families", () => {
    const matches = familiesForChangedFile("packages/foo/package.json");
    const ids = matches.map((f) => f.id);
    expect(ids).toContain("dep-graph-md");
    expect(ids).toContain("dep-graph-json");
  });

  it("maps the root package.json to both dep-graph families", () => {
    const matches = familiesForChangedFile("package.json");
    const ids = matches.map((f) => f.id);
    expect(ids).toContain("dep-graph-md");
    expect(ids).toContain("dep-graph-json");
  });

  it("maps a pnpm-workspace.yaml edit to both dep-graph families", () => {
    const matches = familiesForChangedFile("pnpm-workspace.yaml");
    const ids = matches.map((f) => f.id);
    expect(ids).toContain("dep-graph-md");
    expect(ids).toContain("dep-graph-json");
  });

  it("dep-graph matches carry the manifest's own command and outputs (no re-encoding)", () => {
    const matches = familiesForChangedFile("package.json");
    const md = matches.find((f) => f.id === "dep-graph-md");
    const json = matches.find((f) => f.id === "dep-graph-json");
    const manifestMd = FAMILIES.find((f) => f.id === "dep-graph-md");
    const manifestJson = FAMILIES.find((f) => f.id === "dep-graph-json");
    expect(md.command).toBe(manifestMd.command);
    expect(md.outputs).toEqual(manifestMd.outputs);
    expect(json.command).toBe(manifestJson.command);
    expect(json.outputs).toEqual(manifestJson.outputs);
  });

  it("ignores a package.json under node_modules", () => {
    const matches = familiesForChangedFile("packages/foo/node_modules/bar/package.json");
    expect(matches).toEqual([]);
  });

  it("maps a source file inside a covered package to a package-scoped llms-txt family", () => {
    const matches = familiesForChangedFile("packages/rialto/src/Foo.tsx");
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe("llms-txt");
    expect(matches[0].command).toBe("pnpm --filter @mbe/cli start pack packages/rialto");
    expect(matches[0].outputs).toEqual([
      "packages/rialto/llms.txt",
      "packages/rialto/llms-full.txt",
    ]);
  });

  // Regression test for #2983: CLAUDE_PROJECT_DIR (or the git rev-parse
  // fallback) and CLAUDE_FILE_PATH can disagree on the real path when a
  // symlink is involved (e.g. macOS /tmp -> /private/tmp). When that happens,
  // the PostToolUse hook's prefix-strip silently fails and passes an absolute
  // path straight through to `--families-for`. packageDirFor() must still
  // resolve the owning package instead of returning null and no-op'ing on a
  // genuine package-source edit.
  it("maps an absolute path (root/file-path mismatch, e.g. symlinked /tmp) to a package-scoped llms-txt family", () => {
    const matches = familiesForChangedFile(
      "/private/tmp/some-worktree/packages/rialto/src/Foo.tsx"
    );
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe("llms-txt");
    expect(matches[0].command).toBe("pnpm --filter @mbe/cli start pack packages/rialto");
    expect(matches[0].outputs).toEqual([
      "packages/rialto/llms.txt",
      "packages/rialto/llms-full.txt",
    ]);
  });

  it("maps a CLAUDE.md edit inside a covered package to a package-scoped llms-txt family", () => {
    const matches = familiesForChangedFile("services/agent/CLAUDE.md");
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe("llms-txt");
    expect(matches[0].outputs).toEqual(["services/agent/llms.txt", "services/agent/llms-full.txt"]);
  });

  it("returns [] for a source file in a package with no committed llms.txt yet", () => {
    const matches = familiesForChangedFile("packages/does-not-exist-yet/src/foo.ts");
    expect(matches).toEqual([]);
  });

  it("returns [] for a test file (mirrors REGEN_SOURCE_EXCLUDES, no wasted regen)", () => {
    const matches = familiesForChangedFile("packages/rialto/src/Foo.test.tsx");
    expect(matches).toEqual([]);
  });

  it("returns [] for a generated file", () => {
    const matches = familiesForChangedFile("services/agent/src/generated/prisma/index.d.ts");
    expect(matches).toEqual([]);
  });

  it("returns [] for a file that touches no generator", () => {
    expect(familiesForChangedFile("docs/README.md")).toEqual([]);
    expect(familiesForChangedFile("apps/hospitality/src/App.test.tsx")).toEqual([]);
  });

  // Extensibility invariant: a family that declares its own `changedBy(path)`
  // rule is picked up by familiesForChangedFile with ZERO edits to this
  // function (or to any hook script that calls it) — the loop below is
  // generic over whatever families it's given. This is what lets a 6th
  // manifest family "just work" without touching regen-dep-graph.sh /
  // regen-llms.sh.
  it("picks up a hypothetical new family via dependency injection, with no changes to familiesForChangedFile itself", () => {
    const hypotheticalFamilies = [
      ...FAMILIES,
      {
        id: "hypothetical-family",
        label: "some new generated artifact",
        command: "pnpm run generate:hypothetical",
        outputs: ["some/generated/artifact.json"],
        changedBy(path) {
          return path.startsWith("some/source/")
            ? { command: this.command, outputs: this.outputs }
            : null;
        },
      },
    ];

    const matches = familiesForChangedFile("some/source/input.yaml", hypotheticalFamilies);
    expect(matches).toEqual([
      {
        id: "hypothetical-family",
        label: "some new generated artifact",
        command: "pnpm run generate:hypothetical",
        outputs: ["some/generated/artifact.json"],
      },
    ]);

    // And a non-matching path still yields nothing extra.
    expect(familiesForChangedFile("unrelated/path.ts", hypotheticalFamilies)).toEqual([]);
  });
});
