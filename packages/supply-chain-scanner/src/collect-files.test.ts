import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFiles } from "./collect-files.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "scan-collect-"));
  writeFileSync(join(root, "index.js"), "export const x = 1;");
  writeFileSync(join(root, "SKILL.md"), "# skill");
  writeFileSync(join(root, "image.png"), "not-really-binary");
  mkdirSync(join(root, "node_modules", "evil"), { recursive: true });
  writeFileSync(join(root, "node_modules", "evil", "index.js"), "hacked");
  writeFileSync(join(root, "server.py"), "import os");
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "run"), "#!/usr/bin/env bash\necho hi");
  writeFileSync(join(root, "bin", "LICENSE"), "MIT License");
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "nested", "deep.ts"), "export const y = 2;");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("collectFiles", () => {
  it("collects text files recursively", () => {
    const rels = collectFiles(root)
      .map((f) => f.relPath)
      .sort();
    expect(rels).toContain("index.js");
    expect(rels).toContain("SKILL.md");
    expect(rels).toContain("nested/deep.ts");
  });

  it("collects .py files", () => {
    expect(collectFiles(root).map((f) => f.relPath)).toContain("server.py");
  });

  it("collects extension-less files with a shebang, not other extension-less files", () => {
    const rels = collectFiles(root).map((f) => f.relPath);
    expect(rels).toContain("bin/run");
    expect(rels).not.toContain("bin/LICENSE");
  });

  it("skips node_modules", () => {
    const rels = collectFiles(root).map((f) => f.relPath);
    expect(rels.some((r) => r.includes("node_modules"))).toBe(false);
  });

  it("ignores non-text extensions", () => {
    const rels = collectFiles(root).map((f) => f.relPath);
    expect(rels).not.toContain("image.png");
  });

  it("returns file contents as text", () => {
    const skill = collectFiles(root).find((f) => f.relPath === "SKILL.md");
    expect(skill?.content).toBe("# skill");
  });
});
