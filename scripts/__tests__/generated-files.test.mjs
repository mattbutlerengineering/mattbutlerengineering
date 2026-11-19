import { describe, it, expect } from "vitest";
import { artifactPaths } from "../regen-manifest.mjs";
import { isGeneratedArtifact, isGeneratedDirPath } from "../lib/generated-files.mjs";

describe("isGeneratedArtifact (#9080)", () => {
  it("accepts every manifest output", () => {
    for (const p of artifactPaths()) {
      expect(isGeneratedArtifact(p), p).toBe(true);
    }
  });

  it.each([
    ["pnpm-lock.yaml", true],
    ["packages/foo/pnpm-lock.yaml", true],
    ["services/reservations/src/generated/prisma/client.ts", true],
    ["packages/foo/package.json", false],
    ["services/reservations/src/app.ts", false],
    // the llms.txt generator was removed in #9057
    ["llms.txt", false],
    ["packages/rialto/llms-full.txt", false],
  ])("%s -> %s", (path, expected) => {
    expect(isGeneratedArtifact(path)).toBe(expected);
  });

  it("isGeneratedDirPath matches only a generated/ directory segment", () => {
    expect(isGeneratedDirPath("a/generated/b.ts")).toBe(true);
    expect(isGeneratedDirPath("generated/b.ts")).toBe(true);
    expect(isGeneratedDirPath("a/generated-schemas.ts")).toBe(false);
  });
});
