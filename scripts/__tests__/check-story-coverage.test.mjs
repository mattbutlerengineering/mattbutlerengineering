/**
 * Regression test for the silent-gap class: a rialto component directory
 * with no matching Storybook story looks complete on inspection (component
 * source, styles, test all present) while contributing zero coverage to
 * Storybook. This exact gap closed once (#1019) and reopened silently. See
 * scripts/check-story-coverage.mjs.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findComponentDirs,
  findComponentsWithStories,
  findMissingStories,
  formatFinding,
  COMPONENTS_DIR,
} from "../check-story-coverage.mjs";

/** Builds a throwaway components directory, returns its path. */
function makeFixture(components) {
  const dir = mkdtempSync(join(tmpdir(), "story-coverage-"));
  for (const [name, files] of Object.entries(components)) {
    const componentDir = join(dir, name);
    mkdirSync(componentDir, { recursive: true });
    for (const file of files) {
      writeFileSync(join(componentDir, file), "// stub\n");
    }
  }
  return dir;
}

describe("findComponentDirs", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("lists each component directory", () => {
    dir = makeFixture({
      Accordion: ["Accordion.tsx", "Accordion.stories.tsx"],
      Badge: ["Badge.tsx"],
    });

    expect(findComponentDirs(dir)).toEqual(["Accordion", "Badge"]);
  });

  it("ignores stray files sitting directly in the components dir", () => {
    dir = makeFixture({ Accordion: ["Accordion.tsx", "Accordion.stories.tsx"] });
    writeFileSync(join(dir, "index.ts"), "export {};\n");

    expect(findComponentDirs(dir)).toEqual(["Accordion"]);
  });
});

describe("findComponentsWithStories", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("finds components that ship a *.stories.tsx file", () => {
    dir = makeFixture({
      Accordion: ["Accordion.tsx", "Accordion.stories.tsx"],
      Badge: ["Badge.tsx"],
    });

    expect(findComponentsWithStories(dir)).toEqual(new Set(["Accordion"]));
  });

  it("ignores node_modules and other default-ignored directories", () => {
    dir = makeFixture({ Accordion: ["Accordion.tsx", "Accordion.stories.tsx"] });
    mkdirSync(join(dir, "node_modules", "Ghost"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "Ghost", "Ghost.stories.tsx"), "// stub\n");

    expect(findComponentsWithStories(dir)).toEqual(new Set(["Accordion"]));
  });
});

describe("findMissingStories", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("reports zero missing when every component has a story", () => {
    dir = makeFixture({
      Accordion: ["Accordion.tsx", "Accordion.stories.tsx"],
      Badge: ["Badge.tsx", "Badge.stories.tsx"],
    });

    expect(findMissingStories(dir)).toEqual([]);
  });

  it("fails with a clear list of component names missing a story", () => {
    dir = makeFixture({
      Accordion: ["Accordion.tsx", "Accordion.stories.tsx"],
      Badge: ["Badge.tsx"],
      Calendar: ["Calendar.tsx"],
    });

    expect(findMissingStories(dir)).toEqual(["Badge", "Calendar"]);
  });
});

describe("formatFinding", () => {
  it("names the missing component and directory", () => {
    expect(formatFinding("Badge")).toBe(`${COMPONENTS_DIR}/Badge/ — no *.stories.tsx file`);
  });
});

describe("this repository", () => {
  it("has no rialto component directory missing a Storybook story", () => {
    const componentsDir = join(process.cwd(), COMPONENTS_DIR);
    expect(findMissingStories(componentsDir)).toEqual([]);
  });
});
