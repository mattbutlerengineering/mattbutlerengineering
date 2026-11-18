import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, familiesForChangedFile, artifactPaths } from "../regen-manifest.mjs";
import { needsFullRegen } from "../check-regen-needed.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(__dirname, "../regen-manifest.mjs"), "utf8");

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

  it("contains the required families", () => {
    const ids = new Set(FAMILIES.map((f) => f.id));
    expect(ids.has("llms-txt")).toBe(false);
    expect(ids.has("rialto-registry")).toBe(true);
    expect(ids.has("rialto-catalog-schemas")).toBe(true);
    expect(ids.has("dep-graph-md")).toBe(true);
    expect(ids.has("dep-graph-json")).toBe(true);
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

  it("no family command references the retired `mbe pack` command", () => {
    for (const f of FAMILIES) {
      expect(f.command, `${f.id}.command`).not.toMatch(/\bpack\b/);
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

  it("returns [] for a plain package source edit (no family regenerates from it)", () => {
    expect(familiesForChangedFile("packages/does-not-exist-yet/src/foo.ts")).toEqual([]);
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
  // any other hook.
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

// ---------------------------------------------------------------------------
// ui-quality-ledger — the route inventory's four router/registry files feed
// metrics/ui-quality-ledger.jsonl (docs/features/ui-quality-loop).
// ---------------------------------------------------------------------------
describe("ui-quality-ledger family", () => {
  const family = FAMILIES.find((f) => f.id === "ui-quality-ledger");

  it("regenerates the ledger with ledger.mjs generate", () => {
    expect(family).toBeDefined();
    expect(family.command).toBe("node scripts/ui-quality/ledger.mjs generate");
    expect(family.outputs).toEqual(["metrics/ui-quality-ledger.jsonl"]);
  });

  it("is made stale by each router/registry file, and only those", () => {
    for (const path of [
      "apps/hospitality/src/main.tsx",
      "apps/marketing/src/App.tsx",
      "apps/rialto-web/src/routes.tsx",
      "apps/rialto-web/src/data/page-registry.ts",
    ]) {
      expect(family.changedBy(path), path).toEqual({
        command: family.command,
        outputs: family.outputs,
      });
    }
    expect(family.changedBy("apps/marketing/src/pages/Foo.tsx")).toBeNull();
    expect(family.changedBy("apps/marketing/src/App.test.tsx")).toBeNull();
    expect(family.changedBy("apps/hospitality/src/App.tsx")).toBeNull();
  });

  it("is reported by familiesForChangedFile for a router edit", () => {
    const ids = familiesForChangedFile("apps/marketing/src/App.tsx").map((f) => f.id);
    expect(ids).toContain("ui-quality-ledger");
  });
});

// ---------------------------------------------------------------------------
// cursorrules family — #6954: .cursorrules is generated from AGENTS.md, so the
// regen machinery (hook, pre-push, CI, post-merge auto-heal) must know it.
// ---------------------------------------------------------------------------
describe("cursorrules family", () => {
  it("maps a root AGENTS.md edit to the cursorrules family", () => {
    const matches = familiesForChangedFile("AGENTS.md");
    const family = matches.find((f) => f.id === "cursorrules");
    expect(family).toBeDefined();
    expect(family.outputs).toEqual([".cursorrules"]);
    expect(family.command).toContain("sync-rules");
  });

  it("does not map a nested package AGENTS.md", () => {
    const ids = familiesForChangedFile("packages/x/AGENTS.md").map((f) => f.id);
    expect(ids).not.toContain("cursorrules");
  });

  it("lists .cursorrules among the committed artifact paths", () => {
    expect(artifactPaths()).toContain(".cursorrules");
  });

  it("treats a root AGENTS.md change as a regen source", () => {
    expect(needsFullRegen(["AGENTS.md"])).toBe(true);
  });
});
