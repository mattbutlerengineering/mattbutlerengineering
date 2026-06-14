import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { byteOrder, packDirectory } from "../commands/pack.js";

describe("pack determinism", () => {
  describe("byteOrder comparator", () => {
    it("sorts by raw byte order, not locale", () => {
      // Locale-aware (en-US) collation groups case-insensitively and would
      // order this as ["Apple", "apple", "Banana"]. Byte order (ASCII) puts
      // all uppercase before lowercase: ["Apple", "Banana", "apple"].
      const input = ["apple", "Banana", "Apple"];
      const sorted = [...input].sort(byteOrder);
      expect(sorted).toEqual(["Apple", "Banana", "apple"]);
    });

    it("orders underscores and digits by ASCII codepoint", () => {
      // "_" (0x5F) > "Z" (0x5A) but < "a" (0x61); digits (0x30-0x39) precede
      // all letters. localeCompare reorders these unpredictably across locales.
      const input = ["z", "_internal", "Zeta", "9", "a"];
      const sorted = [...input].sort(byteOrder);
      expect(sorted).toEqual(["9", "Zeta", "_internal", "a", "z"]);
    });

    it("is stable for equal values", () => {
      expect(byteOrder("same", "same")).toBe(0);
    });
  });

  describe("pack output has no absolute-path leaks", () => {
    it("does not embed /Users/ or /home/ paths in generated llms output", async () => {
      const root = mkdtempSync(join(tmpdir(), "pack-determinism-"));
      try {
        // Minimal monorepo root marker.
        writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'pkg'\n");

        const pkgDir = join(root, "pkg");
        const srcDir = join(pkgDir, "src");
        mkdirSync(srcDir, { recursive: true });
        writeFileSync(
          join(srcDir, "thing.ts"),
          [
            "export interface Thing {",
            "  id: string;",
            "  count: number;",
            "}",
            "",
            "export function makeThing(id: string): Thing {",
            "  return { id, count: 0 };",
            "}",
            "",
          ].join("\n")
        );

        await packDirectory("pkg", root, false, false);

        const skeleton = readFileSync(join(pkgDir, "llms.txt"), "utf-8");
        const full = readFileSync(join(pkgDir, "llms-full.txt"), "utf-8");

        // Resolved ts-morph types can leak the absolute checkout path, which
        // differs between macOS (/Users/...) and Linux CI (/home/runner/...)
        // and breaks the cross-platform integrity diff.
        expect(skeleton).not.toMatch(/\/Users\//);
        expect(skeleton).not.toMatch(/\/home\//);
        expect(full).not.toMatch(/\/Users\//);
        expect(full).not.toMatch(/\/home\//);
        // Sanity: the package's own symbols made it into the output.
        expect(skeleton).toContain("Thing");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
