/**
 * Tests for the `feeds_back_into` reference check (#4876).
 *
 * The monthly reflection review found, by hand, that five of fifteen memory
 * and reflection files pointed at things that had moved or never existed:
 *
 *   - `CLAUDE.md#bash-tool-quirks` — that heading is in the USER's global
 *     `~/.claude/CLAUDE.md`, never in the repo's own CLAUDE.md
 *   - `scripts/acmm/outputs/report.js` and `.claude/skills/acmm-audit/SKILL.md`
 *     — both moved to `plugins/acmm/**` when the ACMM skill was extracted (#818)
 *
 * A `feeds_back_into` that no longer resolves is the promotion trail going
 * cold: the whole point of the field is to answer "where did this lesson end
 * up", and a dangling path answers it wrongly rather than not at all. Finding
 * them took a hand audit a month after they broke, which is exactly the kind
 * of check that should not need a human.
 *
 * What this deliberately does NOT check: whether the named section actually
 * discusses the lesson. That is a judgement call — `#pre-commit--lint`
 * resolved fine while containing zero mentions of the zsh trap it was cited
 * for — and a mechanical check must not imply it verified meaning.
 */

import { describe, it, expect } from "vitest";
import {
  slugifyHeading,
  extractHeadingAnchors,
  parseFeedsBackInto,
  classifyRef,
  collectRefFindings,
  listCorpusFiles,
} from "../check-memory-refs.mjs";

describe("slugifyHeading", () => {
  it("matches GitHub's anchor form for the headings this repo actually uses", () => {
    expect(slugifyHeading("## Pre-commit / lint")).toBe("pre-commit--lint");
    expect(slugifyHeading("## Releases (changesets / rialto)")).toBe("releases-changesets--rialto");
    expect(slugifyHeading("## Shell (zsh)")).toBe("shell-zsh");
    expect(slugifyHeading("## Build / pnpm / turbo")).toBe("build--pnpm--turbo");
    expect(slugifyHeading("## Deploy / static sites")).toBe("deploy--static-sites");
    expect(slugifyHeading("## Manual Deployment")).toBe("manual-deployment");
  });

  it("strips inline code and punctuation the way GitHub does", () => {
    expect(slugifyHeading("### `foo.mjs` & friends!")).toBe("foomjs--friends");
  });
});

describe("extractHeadingAnchors", () => {
  it("collects every heading level", () => {
    const anchors = extractHeadingAnchors("# Top\n\n## Second Level\n\n#### Deep One\n");
    expect(anchors).toEqual(new Set(["top", "second-level", "deep-one"]));
  });

  it("ignores a # inside a fenced code block", () => {
    // A shell comment in a fence is not a heading; treating it as one would
    // invent anchors that GitHub will not honour.
    const anchors = extractHeadingAnchors("## Real\n\n```sh\n# not a heading\n```\n");
    expect(anchors).toEqual(new Set(["real"]));
  });
});

describe("parseFeedsBackInto", () => {
  it("parses the comma-separated form used by .claude/memory files", () => {
    expect(parseFeedsBackInto("feeds_back_into: CLAUDE.md#a, .claude/rules/gotchas.md#b")).toEqual([
      "CLAUDE.md#a",
      ".claude/rules/gotchas.md#b",
    ]);
  });

  it("parses the YAML-array form used by docs/reflections files", () => {
    expect(
      parseFeedsBackInto("feeds_back_into: [scripts/x.js, .claude/skills/y/SKILL.md]")
    ).toEqual(["scripts/x.js", ".claude/skills/y/SKILL.md"]);
  });

  it("returns an empty array when the field is absent", () => {
    // Reinforcements use action/context/pattern and have no such field by
    // design (.claude/memory/README.md) — absence is not a finding.
    expect(parseFeedsBackInto("date: 2026-05-14\naction: did a thing")).toEqual([]);
  });

  it("ignores a blank field rather than yielding an empty ref", () => {
    expect(parseFeedsBackInto("feeds_back_into:   ")).toEqual([]);
    expect(parseFeedsBackInto("feeds_back_into: []")).toEqual([]);
  });
});

describe("classifyRef", () => {
  const anchors = { "CLAUDE.md": new Set(["manual-deployment"]) };
  const resolvers = {
    exists: (p) => p in anchors,
    anchorsFor: (p) => anchors[p] ?? new Set(),
  };

  it("accepts a path that exists with no anchor", () => {
    expect(classifyRef("CLAUDE.md", resolvers).state).toBe("ok");
  });

  it("accepts a path whose anchor resolves", () => {
    expect(classifyRef("CLAUDE.md#manual-deployment", resolvers).state).toBe("ok");
  });

  it("flags a missing file", () => {
    expect(classifyRef("scripts/acmm/outputs/report.js", resolvers).state).toBe("file-missing");
  });

  it("flags an anchor that does not resolve in a file that does exist", () => {
    // The real #4876 finding: CLAUDE.md is present, `bash-tool-quirks` is not.
    expect(classifyRef("CLAUDE.md#bash-tool-quirks", resolvers).state).toBe("anchor-missing");
  });

  it("reports a missing file WITHOUT claiming anything about its anchor", () => {
    const result = classifyRef("gone.md#some-anchor", resolvers);
    expect(result.state).toBe("file-missing");
    expect(result.path).toBe("gone.md");
    expect(result.anchor).toBe("some-anchor");
  });
});

describe("collectRefFindings", () => {
  const files = {
    "a.md": "---\nfeeds_back_into: CLAUDE.md#manual-deployment\n---\n",
    "b.md": "---\nfeeds_back_into: [CLAUDE.md#nope, gone.md]\n---\n",
    "c.md": "---\naction: no field here\n---\n",
  };
  const resolvers = {
    exists: (p) => p === "CLAUDE.md",
    anchorsFor: () => new Set(["manual-deployment"]),
    readFile: (p) => files[p],
  };

  it("returns only the refs that do not resolve, tagged with their source file", () => {
    const findings = collectRefFindings(Object.keys(files), resolvers);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.ref).sort()).toEqual(["CLAUDE.md#nope", "gone.md"]);
    expect(findings.every((f) => f.source === "b.md")).toBe(true);
  });

  it("passes cleanly when every ref resolves", () => {
    expect(collectRefFindings(["a.md"], resolvers)).toEqual([]);
  });

  it("treats an unreadable file as a finding rather than skipping it", () => {
    // Fail closed: a file the check cannot read is not a file the check has
    // verified. Silently skipping it is how a gate becomes decorative.
    const findings = collectRefFindings(["missing.md"], {
      ...resolvers,
      readFile: () => {
        throw new Error("EACCES");
      },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].state).toBe("unreadable");
  });
});

describe("listCorpusFiles", () => {
  it("excludes README.md, whose feeds_back_into is a format template", () => {
    // `docs/reflections/README.md` documents the frontmatter shape using
    // `path/to/instruction-file.md` and a literal `...`. Those are not
    // promotion claims; flagging them would train the reader to ignore this
    // check's output, and "fixing" them would corrupt the documentation.
    const files = listCorpusFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => f.endsWith("README.md"))).toEqual([]);
  });

  it("does include the real correction and reflection entries", () => {
    const files = listCorpusFiles();
    expect(files).toContain(".claude/memory/corrections/2026-04-25-zsh-status-reserved.md");
    expect(files).toContain("docs/reflections/2026-04-25-trust-live-audit-output.md");
  });
});
