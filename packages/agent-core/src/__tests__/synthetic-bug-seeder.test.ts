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
  it("exposes exactly the four live chaos-agent bug types", () => {
    expect(Object.keys(BUG_CATALOG).sort()).toEqual(
      ["accessibility", "console-error", "lighthouse-perf", "scout-todo"].sort()
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
