import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, llmsPackages } from "../regen-manifest.mjs";

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
});
