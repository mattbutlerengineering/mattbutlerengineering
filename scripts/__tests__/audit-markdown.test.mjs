import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  stripInlineCode,
  isArchivalDoc,
  isDirectoryTreeEntry,
  isKnownException,
  auditContent,
  applyFixes,
  KNOWN_EXCEPTIONS,
} from "../audit-markdown.mjs";

describe("stripInlineCode", () => {
  it("blanks an inline code span while preserving offsets", () => {
    const line = "index line: `- [Title](file.md) — hook`. Never inline.";
    const stripped = stripInlineCode(line);
    expect(stripped).toHaveLength(line.length);
    expect(stripped).not.toContain("file.md");
    expect(stripped.startsWith("index line: ")).toBe(true);
    expect(stripped.endsWith(". Never inline.")).toBe(true);
  });

  it("leaves a real link outside backticks intact", () => {
    const line = "see [contract](./REVIEWER_CONTRACT.md) for policy";
    expect(stripInlineCode(line)).toBe(line);
  });

  it("keeps a backtick-wrapped link text whose target is outside the span", () => {
    // `[`docs/x.md`](./docs/x.md)` — the target is a real link, the label is code
    const line = "rubric: [`docs/review-criteria.md`](./docs/review-criteria.md)";
    expect(stripInlineCode(line)).toContain("(./docs/review-criteria.md)");
  });

  it("preserves line count across a multi-line document", () => {
    const content = "a `x` b\nc\n`y`\n";
    expect(stripInlineCode(content).split("\n")).toHaveLength(4);
  });
});

describe("isArchivalDoc", () => {
  it("treats a dated plan snapshot as archival", () => {
    expect(isArchivalDoc("docs/plans/2026-01-22-platform-design.md")).toBe(true);
    expect(isArchivalDoc("packages/rialto/docs/plans/2026-02-22-monorepo-design.md")).toBe(true);
    expect(isArchivalDoc("docs/design/2026-03-27-generative-ui-prd.md")).toBe(true);
  });

  it("does not treat a living doc as archival", () => {
    expect(isArchivalDoc("docs/ARCHITECTURE.md")).toBe(false);
    expect(isArchivalDoc("CONTRIBUTING.md")).toBe(false);
    expect(isArchivalDoc(".claude/skills/ci-monitor/SKILL.md")).toBe(false);
  });

  it("does not treat an undated file inside a plans dir as archival", () => {
    // Only a YYYY-MM-DD prefix marks a snapshot; a living index in the same
    // directory must still be audited.
    expect(isArchivalDoc("docs/plans/README.md")).toBe(false);
  });
});

describe("isDirectoryTreeEntry", () => {
  it("accepts a path-shaped entry", () => {
    expect(isDirectoryTreeEntry("apps/marketing")).toBe(true);
    expect(isDirectoryTreeEntry("pnpm-workspace.yaml")).toBe(true);
  });

  it("rejects decision-tree prose masquerading as a tree", () => {
    // packages/rialto/docs/quick-reference/feedback-routing.md draws a yes/no
    // decision tree with the same box-drawing characters a dir tree uses.
    expect(isDirectoryTreeEntry("No")).toBe(false);
    expect(isDirectoryTreeEntry("No/No/No")).toBe(false);
    expect(isDirectoryTreeEntry("Text")).toBe(false);
    expect(isDirectoryTreeEntry("People")).toBe(false);
  });
});

describe("isKnownException", () => {
  it("suppresses a documented forward reference", () => {
    expect(isKnownException("SECURITY.md", "docs/security-acknowledgements.md")).toBe(true);
  });

  it("does not suppress an undocumented target in the same file", () => {
    expect(isKnownException("SECURITY.md", "docs/something-else.md")).toBe(false);
  });

  it("gives every exception a reason", () => {
    for (const entry of KNOWN_EXCEPTIONS) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });
});

describe("auditContent", () => {
  const exists = (paths) => (p) => new Set(paths).has(p);

  it("flags a root-relative link written as document-relative, with a fix", () => {
    const content =
      "See [Reviewer Contract](./.claude/skills/implement-queue/REVIEWER_CONTRACT.md).\n";
    const findings = auditContent(content, ".claude/skills/implement-queue/SKILL.md", {
      exists: exists([".claude/skills/implement-queue/REVIEWER_CONTRACT.md"]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("wrong-relative-link");
    expect(findings[0].fix).toEqual({
      from: "./.claude/skills/implement-queue/REVIEWER_CONTRACT.md",
      to: "./REVIEWER_CONTRACT.md",
    });
  });

  it("computes an upward fix for a sibling directory", () => {
    const content = "[contract](.claude/skills/implement-queue/REVIEWER_CONTRACT.md)\n";
    const findings = auditContent(content, ".claude/skills/ci-monitor/SKILL.md", {
      exists: exists([".claude/skills/implement-queue/REVIEWER_CONTRACT.md"]),
    });
    expect(findings[0].fix.to).toBe("../implement-queue/REVIEWER_CONTRACT.md");
  });

  it("reports a link whose target exists nowhere as broken, with no fix", () => {
    const content = "[gone](./.claude/skills/acmm-audit/SKILL.md)\n";
    const findings = auditContent(content, "CONTRIBUTING.md", { exists: exists([]) });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("broken-link");
    expect(findings[0].fix).toBeUndefined();
  });

  it("ignores a link that appears only inside an inline code span", () => {
    const content = "add one index line: `- [Title](file.md) — hook`\n";
    expect(
      auditContent(content, ".claude/skills/gotcha-harvest/SKILL.md", { exists: exists([]) })
    ).toEqual([]);
  });

  it("ignores external and anchor-only links", () => {
    const content = "[a](https://example.com) [b](mailto:x@y.z) [c](#section)\n";
    expect(auditContent(content, "README.md", { exists: exists([]) })).toEqual([]);
  });

  it("flags a stale directory-tree entry in a living doc", () => {
    const content = ["```", "repo/", "├── apps/", "│   └── web/", "```", ""].join("\n");
    const findings = auditContent(content, "docs/ARCHITECTURE.md", { exists: exists(["apps"]) });
    expect(findings.map((f) => f.kind)).toContain("stale-tree-entry");
    expect(findings.some((f) => f.target.endsWith("apps/web"))).toBe(true);
  });

  it("resolves a document-relative tree root against the doc's own directory", () => {
    // packages/api-client/CLAUDE.md draws a `src/` tree; its entries are real
    // files under packages/api-client/src/.
    const content = ["```", "src/", "├── client.ts", "```", ""].join("\n");
    const findings = auditContent(content, "packages/api-client/CLAUDE.md", {
      exists: exists(["packages/api-client/src/client.ts"]),
    });
    expect(findings).toEqual([]);
  });

  it("resolves a repo-root tree root drawn inside a nested doc", () => {
    const content = ["```", "apps/hospitality/e2e/", "├── fixtures.ts", "```", ""].join("\n");
    const findings = auditContent(content, "apps/hospitality/docs/ARCHITECTURE.md", {
      exists: exists(["apps/hospitality/e2e/fixtures.ts"]),
    });
    expect(findings).toEqual([]);
  });

  it("skips a scaffold template tree whose root is a placeholder", () => {
    // .claude/skills/new-service/SKILL.md describes the service to create, not
    // one that exists.
    const content = ["```", "services/<name>/", "├── src/", "│   └── app.ts", "```", ""].join("\n");
    expect(
      auditContent(content, ".claude/skills/new-service/SKILL.md", { exists: exists([]) })
    ).toEqual([]);
  });

  it("skips a glob entry inside a tree", () => {
    const content = ["```", "apps/hospitality/e2e/", "├── *.spec.ts", "```", ""].join("\n");
    expect(
      auditContent(content, "apps/hospitality/docs/ARCHITECTURE.md", { exists: exists([]) })
    ).toEqual([]);
  });

  it("still flags a tree entry that exists under no resolution", () => {
    const content = ["```", "mattbutlerengineering/", "├── apps/", "│   └── web/", "```", ""].join(
      "\n"
    );
    const findings = auditContent(content, "docs/ARCHITECTURE.md", { exists: exists(["apps"]) });
    expect(findings.map((f) => f.target)).toEqual(["apps/web"]);
  });

  it("resolves a tree root against any ancestor of the doc, not just its own dir", () => {
    // packages/rialto/docs/figma-migration-plan.md draws `src/components/Button/`,
    // which hangs off the package root two levels up.
    const content = ["```", "src/components/Button/", "├── Button.tsx", "```", ""].join("\n");
    const findings = auditContent(content, "packages/rialto/docs/figma-migration-plan.md", {
      exists: exists(["packages/rialto/src/components/Button/Button.tsx"]),
    });
    expect(findings).toEqual([]);
  });

  it("honours a second root line inside the same block", () => {
    // packages/rialto-catalog/CLAUDE.md draws src/ then scripts/ in one fence.
    const content = [
      "```",
      "src/",
      "├── index.ts",
      "scripts/",
      "└── generate-catalog.ts",
      "```",
      "",
    ].join("\n");
    const findings = auditContent(content, "packages/rialto-catalog/CLAUDE.md", {
      exists: exists([
        "packages/rialto-catalog/src/index.ts",
        "packages/rialto-catalog/scripts/generate-catalog.ts",
      ]),
    });
    expect(findings).toEqual([]);
  });

  it("stays silent on a block where nothing resolves", () => {
    // An all-placeholder tree (ComponentName/) is illustrative; drift shows up
    // as some entries resolving and others not.
    const content = [
      "```",
      "src/components/ComponentName/",
      "├── ComponentName.tsx",
      "└── index.ts",
      "```",
      "",
    ].join("\n");
    expect(auditContent(content, "packages/rialto/CLAUDE.md", { exists: exists([]) })).toEqual([]);
  });

  it("skips an ellipsis continuation entry", () => {
    const content = ["```", "src/", "├── database.ts", "└── ...", "```", ""].join("\n");
    const findings = auditContent(content, "services/agent/CLAUDE.md", {
      exists: exists(["services/agent/src/database.ts"]),
    });
    expect(findings).toEqual([]);
  });

  it("skips an archival snapshot entirely", () => {
    const content = ["```", "repo/", "├── apps/", "│   └── web/", "```", ""].join("\n");
    expect(
      auditContent(content, "docs/plans/2026-01-22-platform-design.md", { exists: exists([]) })
    ).toEqual([]);
  });

  it("suppresses a known exception", () => {
    const content = "credits go in [here](./docs/security-acknowledgements.md)\n";
    expect(auditContent(content, "SECURITY.md", { exists: exists([]) })).toEqual([]);
  });
});

describe("applyFixes", () => {
  it("rewrites only the fixable findings and returns a new string", () => {
    const content = "a [x](./.claude/skills/implement-queue/REVIEWER_CONTRACT.md) b\n";
    const findings = [
      {
        line: 1,
        kind: "wrong-relative-link",
        fix: {
          from: "./.claude/skills/implement-queue/REVIEWER_CONTRACT.md",
          to: "./REVIEWER_CONTRACT.md",
        },
      },
    ];
    const out = applyFixes(content, findings);
    expect(out).toBe("a [x](./REVIEWER_CONTRACT.md) b\n");
    expect(content).toBe("a [x](./.claude/skills/implement-queue/REVIEWER_CONTRACT.md) b\n");
  });

  it("leaves content untouched when nothing is fixable", () => {
    const content = "a [x](./gone.md) b\n";
    expect(applyFixes(content, [{ line: 1, kind: "broken-link" }])).toBe(content);
  });

  it("rewrites only the targeted line when the same text appears twice", () => {
    const content = "[a](./x/y.md)\n[b](./x/y.md)\n";
    const out = applyFixes(content, [
      { line: 2, kind: "wrong-relative-link", fix: { from: "./x/y.md", to: "./y.md" } },
    ]);
    expect(out).toBe("[a](./x/y.md)\n[b](./y.md)\n");
  });
});

describe("docs-audit workflow wiring", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/docs-audit.yml", import.meta.url),
    "utf8"
  );

  it("invokes the mechanical audit script", () => {
    // The #3955 class: a script that ships, is tested, and is never run by
    // anything. Reachability from the workflow is the property that matters.
    expect(workflow).toContain("node scripts/audit-markdown.mjs --fix --json");
  });

  it("points the semantic pass at the md-audit skill", () => {
    expect(workflow).toContain(".claude/skills/md-audit/SKILL.md");
  });

  it("runs weekly", () => {
    expect(workflow).toMatch(/cron: "\d+ \d+ \* \* \d"/);
  });

  it("keeps the mechanical and semantic passes independent", () => {
    // A `needs:` between them would make an agent failure withhold link fixes.
    expect(workflow).not.toMatch(/needs:\s*mechanical/);
  });
});
