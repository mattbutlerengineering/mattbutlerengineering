import { test, expect, describe, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("check-doc-freshness", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-freshness-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("detects dead markdown link in README", async () => {
    fs.writeFileSync(path.join(tmpDir, "README.md"), "See [guide](./docs/guide.md) for details.\n");

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]).toMatchObject({
      file: expect.stringContaining("README.md"),
      referencedPath: "docs/guide.md",
      line: 1,
    });
  });

  test("does not flag valid links", async () => {
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "docs", "guide.md"), "# Guide\n");
    fs.writeFileSync(path.join(tmpDir, "README.md"), "See [guide](./docs/guide.md) for details.\n");

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(0);
  });

  test("ignores external URLs and anchors", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "README.md"),
      ["[site](https://example.com)", "[section](#overview)", "[mail](mailto:test@test.com)"].join(
        "\n"
      ) + "\n"
    );

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(0);
  });

  test("finds CLAUDE.md files in subdirectories", async () => {
    fs.mkdirSync(path.join(tmpDir, "services", "api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "services", "api", "CLAUDE.md"),
      "See [schema](./prisma/schema.prisma) for DB.\n"
    );

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(1);
    expect(result.stale[0].referencedPath).toBe("prisma/schema.prisma");
  });

  test("reports correct line numbers for multiple refs", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "README.md"),
      ["# Title", "", "See [a](./a.md) here.", "", "And [b](./b.md) there."].join("\n") + "\n"
    );

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(2);
    expect(result.stale[0].line).toBe(3);
    expect(result.stale[1].line).toBe(5);
  });

  test("detects dead dirs in project-structure trees", async () => {
    fs.mkdirSync(path.join(tmpDir, "apps", "hospitality"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "README.md"),
      [
        "## Structure",
        "```",
        "project/",
        "├── apps/",
        "│   ├── hospitality/    # exists",
        "│   └── deleted-app/    # does not exist",
        "└── packages/",
        "    └── gone-pkg/       # does not exist",
        "```",
      ].join("\n") + "\n"
    );

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    const stalePaths = result.stale.map((s) => s.referencedPath);
    expect(stalePaths).toContain("apps/deleted-app");
    expect(stalePaths).toContain("packages/gone-pkg");
    expect(stalePaths).not.toContain("apps/hospitality");
  });

  test("skips tree entries inside fenced code blocks that are not project trees", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "README.md"),
      ["## Install", "```bash", "pnpm install", "cd apps/whatever", "```"].join("\n") + "\n"
    );

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(0);
  });

  test("skips placeholder tree blocks with multi-segment non-existent root", async () => {
    fs.mkdirSync(path.join(tmpDir, "src", "components"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      [
        "### File structure",
        "```",
        "src/components/ComponentName/",
        "├── ComponentName.tsx",
        "├── ComponentName.module.css",
        "└── index.ts",
        "```",
      ].join("\n") + "\n"
    );

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(0);
  });

  test("uses existing tree root dir as path prefix", async () => {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "");
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      ["## Structure", "```", "src/", "├── index.ts", "└── missing.ts", "```"].join("\n") + "\n"
    );

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(1);
    expect(result.stale[0].referencedPath).toBe("src/missing.ts");
  });

  test("excludes node_modules directories from scan", async () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "pkg", "README.md"),
      "See [missing](./gone.md)\n"
    );
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# Root\n");

    const { checkFreshness } = await import("../check-doc-freshness.mjs");
    const result = checkFreshness(tmpDir);

    expect(result.stale).toHaveLength(0);
  });
});
