import { describe, it, expect } from "vitest";
import { BUG_CATALOG, injectBug } from "../synthetic-bug-seeder.js";

const COMPONENT_FIXTURE = `
export default function MyComponent() {
  return (
    <div aria-label="test-label">
      <h1>Hello</h1>
    </div>
  );
}
`;

describe("BUG_CATALOG", () => {
  it("exposes exactly the five live chaos-agent bug types", () => {
    expect(Object.keys(BUG_CATALOG).sort()).toEqual(
      ["accessibility", "console-error", "lighthouse-perf", "scout-todo", "lint-violation"].sort()
    );
  });

  it("gives every catalog entry a description and a pattern", () => {
    for (const bug of Object.values(BUG_CATALOG)) {
      expect(typeof bug.description).toBe("string");
      expect(bug.description.length).toBeGreaterThan(0);
      expect(bug.pattern).toBeInstanceOf(RegExp);
    }
  });
});

describe("injectBug", () => {
  it("injects a console.error and adds the React import when missing", () => {
    const result = injectBug("console-error", COMPONENT_FIXTURE);

    expect(result.injected).toBe(true);
    expect(result.content).toContain("CHAOS-ERROR");
    expect(result.content).toContain("import React");
  });

  it("does not duplicate the React import when already present", () => {
    const withImport = `import React from "react";\n${COMPONENT_FIXTURE}`;
    const result = injectBug("console-error", withImport);

    expect(result.injected).toBe(true);
    expect(result.content.match(/import React/g)).toHaveLength(1);
  });

  it("reports no injection when no function component is found", () => {
    const result = injectBug("console-error", "const x = 1;");
    expect(result.injected).toBe(false);
    expect(result.content).toBe("const x = 1;");
  });

  it("inserts an oversized invisible image before a closing tag", () => {
    const result = injectBug("lighthouse-perf", COMPONENT_FIXTURE);

    expect(result.injected).toBe(true);
    expect(result.content).toContain("CHAOS-REGRESSION");
  });

  it("removes an aria-label attribute", () => {
    const result = injectBug("accessibility", COMPONENT_FIXTURE);

    expect(result.injected).toBe(true);
    expect(result.content).not.toContain('aria-label="test-label"');
  });

  it("reports no injection when there is no aria-label or alt attribute", () => {
    const clean = "<div><h1>Hello</h1></div>";
    const result = injectBug("accessibility", clean);

    expect(result.injected).toBe(false);
    expect(result.content).toBe(clean);
  });

  it("prepends a FIXME comment for scout-todo", () => {
    const result = injectBug("scout-todo", COMPONENT_FIXTURE);

    expect(result.injected).toBe(true);
    expect(result.content.startsWith("// FIXME:")).toBe(true);
  });
});

describe("lint-violation — the only type whose detector sees the chaos branch", () => {
  // #5624: four synthetic PRs, zero detections, zero `chaos-audit` issues ever
  // filed. Every pre-existing bug type is checked by site-audit or Lighthouse,
  // which run against `main` or the deployed site — and chaos PRs are never
  // merged, so those detectors structurally cannot observe the seeded bug.
  // ESLint runs on the pull request itself.
  const COMPONENT = `export default function HomePage() {\n  return <div>hi</div>;\n}\n`;

  it("declares a local inside the function body", () => {
    const { injected, content } = injectBug("lint-violation", COMPONENT);

    expect(injected).toBe(true);
    expect(content).toContain("const chaosUnusedBinding");
    // Inside the body, not before the function — a module-level binding would
    // not be flagged the same way.
    expect(content.indexOf("chaosUnusedBinding")).toBeGreaterThan(
      content.indexOf("export default function HomePage")
    );
    expect(content).toMatch(/\{\s*\n\s*const chaosUnusedBinding/);
  });

  it("does not name the binding with a leading underscore", () => {
    // This repo's rule allows unused vars matching /^_/. An underscore-prefixed
    // name would be seeded, committed, and silently never reported — which is
    // the exact failure #5624 is about.
    const { content } = injectBug("lint-violation", COMPONENT);
    expect(content).not.toMatch(/const _\w/);
  });

  it("keeps the original body intact", () => {
    const { content } = injectBug("lint-violation", COMPONENT);
    expect(content).toContain("return <div>hi</div>;");
  });

  it("handles a named (non-default) export", () => {
    const { injected, content } = injectBug(
      "lint-violation",
      `export function Widget() {\n  return null;\n}\n`
    );
    expect(injected).toBe(true);
    expect(content).toMatch(/export function Widget\(\) \{\s*\n\s*const chaosUnusedBinding/);
  });

  it("handles a typed signature with a return annotation", () => {
    const { injected, content } = injectBug(
      "lint-violation",
      `export default function Page(): JSX.Element {\n  return <div />;\n}\n`
    );
    expect(injected).toBe(true);
    expect(content).toContain("const chaosUnusedBinding");
  });

  it("reports not-injected when the file has no function declaration", () => {
    const { injected, content } = injectBug("lint-violation", `export const x = 1;\n`);
    expect(injected).toBe(false);
    expect(content).toBe(`export const x = 1;\n`);
  });

  it("is in the catalog with a description", () => {
    expect(BUG_CATALOG["lint-violation"].description).toMatch(/no-unused-vars/);
  });
});
