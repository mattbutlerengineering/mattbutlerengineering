import { describe, it, expect } from "vitest";
import { findUndocumentedClaudeFiles } from "../check-claude-md-package-refs.mjs";

/**
 * claude-md-sync.yml's drift step flagged every packages star CLAUDE.md as
 * "not referenced in root" (issue #7694) even though root CLAUDE.md already
 * documents a generic catch-all ("CLAUDE.md files in each services star or
 * packages star directory") that covers all of them by construction. The
 * old heuristic only matched a literal dir path or basename substring, so
 * it couldn't see the catch-all and re-filed the same false positive weekly.
 */
describe("findUndocumentedClaudeFiles", () => {
  const rootClaudeMd =
    "- **Domain Context:** See `CLAUDE.md` files in each `services/*` or `packages/*` directory.\n";

  it("does not flag a packages/* CLAUDE.md when the generic catch-all is present", () => {
    const findings = findUndocumentedClaudeFiles({
      rootClaudeMd,
      claudeMdPaths: ["packages/some-new-pkg/CLAUDE.md"],
    });
    expect(findings).toEqual([]);
  });

  it("does not flag a services/* CLAUDE.md when the generic catch-all is present", () => {
    const findings = findUndocumentedClaudeFiles({
      rootClaudeMd,
      claudeMdPaths: ["services/some-new-service/CLAUDE.md"],
    });
    expect(findings).toEqual([]);
  });

  it("still flags an apps/* CLAUDE.md with no catch-all and no name mention", () => {
    const findings = findUndocumentedClaudeFiles({
      rootClaudeMd,
      claudeMdPaths: ["apps/some-new-app/CLAUDE.md"],
    });
    expect(findings).toEqual(["apps/some-new-app/CLAUDE.md"]);
  });

  it("does not flag an apps/* CLAUDE.md whose dir or basename is already mentioned", () => {
    const findings = findUndocumentedClaudeFiles({
      rootClaudeMd: rootClaudeMd + "See apps/marketing for the marketing site.\n",
      claudeMdPaths: ["apps/marketing/CLAUDE.md"],
    });
    expect(findings).toEqual([]);
  });
});
