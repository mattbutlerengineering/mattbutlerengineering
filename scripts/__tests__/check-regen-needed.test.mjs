import { describe, it, expect } from "vitest";
import { needsFullRegen } from "../check-regen-needed.mjs";

describe("needsFullRegen", () => {
  it("returns false for empty diff", () => {
    expect(needsFullRegen([])).toBe(false);
  });

  it("returns false for test-only diff (*.test.ts)", () => {
    expect(
      needsFullRegen([
        "packages/auth/src/__tests__/auth.test.ts",
        "services/users/src/routes/users.test.ts",
      ])
    ).toBe(false);
  });

  it("returns false for *.spec.ts files", () => {
    expect(needsFullRegen(["apps/hospitality/src/spec/booking.spec.ts"])).toBe(false);
  });

  it("returns false for *.test.mjs files", () => {
    expect(needsFullRegen(["scripts/__tests__/collect-agent-cost.test.mjs"])).toBe(false);
  });

  it("returns false for files in dist/", () => {
    expect(needsFullRegen(["packages/rialto/dist/index.js"])).toBe(false);
  });

  it("returns false for files in generated/", () => {
    expect(needsFullRegen(["services/users/src/generated/prisma/index.d.ts"])).toBe(false);
  });

  it("returns false for llms.txt files", () => {
    expect(needsFullRegen(["llms.txt", "llms-full.txt", "packages/auth/llms.txt"])).toBe(false);
  });

  it("returns true for a non-test TypeScript source file in packages/", () => {
    expect(needsFullRegen(["packages/auth/src/index.ts"])).toBe(true);
  });

  it("returns true for a non-test source file in apps/", () => {
    expect(needsFullRegen(["apps/hospitality/src/components/BookingWidget.tsx"])).toBe(true);
  });

  it("returns true for a non-test source file in infrastructure/ (packed llms target)", () => {
    expect(needsFullRegen(["infrastructure/pulumi/index.ts"])).toBe(true);
  });

  it("returns true for a non-test source file in services/", () => {
    expect(needsFullRegen(["services/users/src/routes/users.ts"])).toBe(true);
  });

  it("returns true for a non-test source file in tools/", () => {
    expect(needsFullRegen(["tools/cli/src/commands/pack.ts"])).toBe(true);
  });

  it("returns true when rialto generated source files change", () => {
    expect(needsFullRegen(["packages/rialto/src/components/Button/Button.ts"])).toBe(true);
  });

  it("returns true when pnpm-workspace.yaml changes (dep-graph trigger)", () => {
    expect(needsFullRegen(["pnpm-workspace.yaml"])).toBe(true);
  });

  it("returns true when mix of test and source files", () => {
    expect(
      needsFullRegen(["packages/auth/src/__tests__/auth.test.ts", "packages/auth/src/index.ts"])
    ).toBe(true);
  });

  it("returns false for docs/ changes outside workspace packages", () => {
    expect(needsFullRegen(["docs/architecture/adr-001.md"])).toBe(false);
  });

  it("returns false for .github/ workflow changes", () => {
    expect(needsFullRegen([".github/workflows/ci.yml"])).toBe(false);
  });

  it("returns false for root markdown changes other than AGENTS.md", () => {
    expect(needsFullRegen(["README.md", "CLAUDE.md"])).toBe(false);
  });

  it("returns true when only AGENTS.md changed (.cursorrules is generated from it)", () => {
    expect(needsFullRegen(["AGENTS.md"])).toBe(true);
  });

  it("returns true for package.json changes in a workspace package (dep-graph trigger)", () => {
    expect(needsFullRegen(["packages/auth/package.json"])).toBe(true);
  });
});

describe("collectChangedFiles (#7263)", () => {
  it("unions committed, staged, unstaged and untracked files", async () => {
    const { collectChangedFiles, CHANGE_SET_GIT_ARGS } = await import("../check-regen-needed.mjs");
    const byQuery = new Map([
      ["diff --name-only origin/main...HEAD", "a.ts\nshared.ts\n"],
      ["diff --name-only --cached", "b.ts\n"],
      ["diff --name-only", "c.ts\nshared.ts\n"],
      ["ls-files --others --exclude-standard", "d.ts\n"],
    ]);
    const files = collectChangedFiles((args) => byQuery.get(args.join(" ")) ?? "");
    expect(files.sort()).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "shared.ts"]);
    expect(CHANGE_SET_GIT_ARGS).toHaveLength(4);
  });

  it("an uncommitted packages/ source edit reaches the decision — the #7263 shape", async () => {
    const { collectChangedFiles } = await import("../check-regen-needed.mjs");
    const { needsFullRegen } = await import("../check-regen-needed.mjs");
    // Committed range empty (worker has not committed yet); the edit is unstaged.
    const files = collectChangedFiles((args) =>
      args.join(" ") === "diff --name-only" ? "packages/types/src/schemas/venue.ts\n" : ""
    );
    expect(needsFullRegen(files)).toBe(true);
  });

  it("propagates a git failure so the entry point fails closed to full", async () => {
    const { collectChangedFiles } = await import("../check-regen-needed.mjs");
    expect(() =>
      collectChangedFiles(() => {
        throw new Error("git exploded");
      })
    ).toThrow("git exploded");
  });
});
