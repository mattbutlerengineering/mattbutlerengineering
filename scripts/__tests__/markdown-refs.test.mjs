import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("extractMarkdownReferences (shared markdown-ref extractor)", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-refs-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("extracts a markdown link reference with line number", async () => {
    const { extractMarkdownReferences } = await import("../lib/markdown-refs.mjs");
    const filePath = "/repo/README.md";
    const refs = extractMarkdownReferences("See [guide](./docs/guide.md) for details.\n", filePath);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      file: filePath,
      referencedPath: "docs/guide.md",
      line: 1,
      type: "markdown-link",
    });
    expect(refs[0].resolvedPath).toBe(path.resolve("/repo", "docs/guide.md"));
  });

  test("skips http(s), anchor-only, and mailto links", async () => {
    const { extractMarkdownReferences } = await import("../lib/markdown-refs.mjs");
    const content = [
      "[site](https://example.com)",
      "[section](#overview)",
      "[mail](mailto:test@test.com)",
    ].join("\n");

    const refs = extractMarkdownReferences(content, "/repo/README.md");

    expect(refs).toHaveLength(0);
  });

  test("strips anchor fragments from resolved links", async () => {
    const { extractMarkdownReferences } = await import("../lib/markdown-refs.mjs");
    const refs = extractMarkdownReferences("[a](./a.md#section)\n", "/repo/README.md");

    expect(refs).toHaveLength(1);
    expect(refs[0].referencedPath).toBe("a.md");
  });

  test("extracts tree-entry references from fenced project-structure blocks", async () => {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "");
    const { extractMarkdownReferences } = await import("../lib/markdown-refs.mjs");
    const content = ["```", "src/", "├── index.ts", "└── missing.ts", "```"].join("\n") + "\n";

    const refs = extractMarkdownReferences(content, path.join(tmpDir, "CLAUDE.md"));
    const treeEntries = refs.filter((r) => r.type === "tree-entry");

    expect(treeEntries.map((r) => r.referencedPath)).toEqual(
      expect.arrayContaining(["src/index.ts", "src/missing.ts"])
    );
  });

  test("ignores fenced blocks with a language tag (e.g. bash)", async () => {
    const { extractMarkdownReferences } = await import("../lib/markdown-refs.mjs");
    const content = ["```bash", "cd apps/whatever", "```"].join("\n") + "\n";

    const refs = extractMarkdownReferences(content, "/repo/README.md");

    expect(refs).toHaveLength(0);
  });

  test("reports missing targets via checkStaleReferences", async () => {
    const { checkStaleReferences } = await import("../lib/markdown-refs.mjs");
    const fileExists = (p) => p === path.resolve("/repo", "docs/exists.md");

    const stale = checkStaleReferences(
      "See [a](./docs/exists.md) and [b](./docs/missing.md).\n",
      "/repo/README.md",
      fileExists
    );

    expect(stale).toHaveLength(1);
    expect(stale[0].referencedPath).toBe("docs/missing.md");
  });
});
