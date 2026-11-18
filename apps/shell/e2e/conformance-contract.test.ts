import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECK_IDS } from "./support/checks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const WORKFLOW_PATH = resolve(REPO_ROOT, ".github/workflows/shell-conformance.yml");
const CONFIG_PATH = resolve(__dirname, "../playwright.conformance.config.ts");

const specs = readdirSync(__dirname)
  .filter((f) => f.endsWith(".spec.ts"))
  .sort();

describe("conformance harness: one spec per spike check", () => {
  it("names exactly the spike checks 1, 2, 3, 3b, 3c, 4, 5, 6, 7, 8", () => {
    expect([...CHECK_IDS]).toEqual(["1", "2", "3", "3b", "3c", "4", "5", "6", "7", "8"]);
  });

  it.each(CHECK_IDS)("check %s has a spec file whose tests are titled `check %s`", (id) => {
    const file = specs.find((f) => f.startsWith(`check-${id}-`));
    expect(file, `no e2e/check-${id}-*.spec.ts`).toBeDefined();
    const source = readFileSync(resolve(__dirname, file ?? ""), "utf8");
    expect(source).toMatch(new RegExp(`test\\(\\s*[\`"']check ${id}:`));
  });

  it("has a spec for the F4 focus and announcement rules", () => {
    expect(specs).toContain("f4-focus-announcement.spec.ts");
  });

  it("no spec file is serial (a failed check must not hide the others)", () => {
    for (const f of specs) {
      expect(readFileSync(resolve(__dirname, f), "utf8"), f).not.toMatch(/mode:\s*["']serial["']/);
    }
    expect(readFileSync(CONFIG_PATH, "utf8")).toMatch(/fullyParallel:\s*true/);
  });

  it("no spec waits for networkidle without a timeout (an open SSE stream never idles)", () => {
    for (const f of specs) {
      const source = readFileSync(resolve(__dirname, f), "utf8");
      expect(source, f).not.toMatch(/waitForLoadState\(\s*["']networkidle["']\s*\)/);
    }
  });
});

describe("conformance harness: no target means no run", () => {
  it("the config runs a global setup that fails without BASE_URL", async () => {
    expect(readFileSync(CONFIG_PATH, "utf8")).toContain(
      'globalSetup: "./e2e/support/global-setup.ts"'
    );
    const { default: globalSetup } = await import("./support/global-setup.js");
    const saved = process.env["BASE_URL"];
    delete process.env["BASE_URL"];
    try {
      expect(() => globalSetup()).toThrow(/BASE_URL is required/);
    } finally {
      if (saved !== undefined) process.env["BASE_URL"] = saved;
    }
  });

  it("the config never defaults the target", () => {
    expect(readFileSync(CONFIG_PATH, "utf8")).not.toMatch(/localhost|127\.0\.0\.1|webServer/);
  });
});

describe("conformance harness: CI workflow runs every functional spec", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");

  it("computes its spec list from the e2e/*.spec.ts glob and fails when it is empty", () => {
    expect(workflow).toContain("apps/shell/e2e/*.spec.ts");
    expect(workflow).toContain("--config apps/shell/playwright.conformance.config.ts");
    expect(workflow).toMatch(/\$\{#specs\[@\]\}"? -eq 0 \]/);
    expect(workflow).toMatch(/exit 1/);
  });

  it("names no individual spec (the list is computed, not enumerated)", () => {
    const named = specs.filter((s) => workflow.includes(`e2e/${s}`));
    expect(named).toEqual([]);
  });

  it("excludes nothing: every spec in the directory is functional", () => {
    expect(workflow).not.toMatch(/case "\$\(basename "\$spec"\)" in/);
    expect(specs.length).toBeGreaterThan(0);
  });

  it("passes BASE_URL from a required input, with no default", () => {
    expect(workflow).toMatch(/base_url:\s*\n(?:\s+.*\n)*?\s+required:\s*true/);
    expect(workflow).toContain("BASE_URL: ${{ inputs.base_url }}");
  });
});
