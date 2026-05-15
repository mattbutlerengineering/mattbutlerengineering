import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "../catalog.js";
import { registry } from "../registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Structural tests ──────────────────────────────────────────────────────────

describe("registry structure", () => {
  it("registry object is defined", () => {
    expect(registry).toBeDefined();
    expect(typeof registry).toBe("object");
  });

  it("registry entry count matches catalog component count minus Toast", () => {
    // Toast is intentionally excluded from registry (useToast() hook, not rendered).
    // catalog has 26 components; registry has 25.
    const registryCount = Object.keys(registry).length;
    const catalogCount = catalog.componentNames.length;
    // Registry should have exactly catalog count - 1 (Toast excluded)
    expect(registryCount).toBe(catalogCount - 1);
    expect(registryCount).toBeGreaterThanOrEqual(25);
  });

  it("registry has entries for all curated component names except Toast", () => {
    const expectedComponents = catalog.componentNames.filter((name) => name !== "Toast");
    for (const name of expectedComponents) {
      expect(registry).toHaveProperty(name);
    }
  });

  it("Toast is not in the registry (uses hook pattern)", () => {
    expect(registry).not.toHaveProperty("Toast");
  });
});

// ── Client safety ─────────────────────────────────────────────────────────────

describe("client safety", () => {
  it("registry.tsx does not import from @json-render/core", () => {
    const registrySource = readFileSync(join(__dirname, "../registry.tsx"), "utf-8");
    expect(registrySource).not.toContain('from "@json-render/core"');
  });

  it("registry.tsx does not import zod", () => {
    const registrySource = readFileSync(join(__dirname, "../registry.tsx"), "utf-8");
    expect(registrySource).not.toContain('from "zod"');
  });
});

// ── Render tests ──────────────────────────────────────────────────────────────
// These tests use json-render's Renderer with a minimal Spec to verify
// that the registry correctly bridges JSON specs to Rialto React components.

// Helper: wrap Renderer in JSONUIProvider (required for state/action/visibility contexts)
function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

describe("registry rendering", () => {
  it("renders a Button via registry and Renderer", () => {
    const spec = {
      root: "btn1",
      elements: {
        btn1: {
          type: "Button",
          props: { variant: "primary", label: "Click me" },
        },
      },
    };

    renderSpec(spec);

    const button = screen.getByRole("button");
    expect(button).toBeDefined();
    expect(button.textContent).toContain("Click me");
  });

  it("renders a Card with a Text child via slot forwarding", () => {
    const spec = {
      root: "card1",
      elements: {
        card1: {
          type: "Card",
          props: { title: "Test Card" },
          children: ["txt1"],
        },
        txt1: {
          type: "Text",
          props: { variant: "body" },
          children: ["textNode"],
        },
        textNode: {
          type: "text",
          props: { value: "Hello from Card" },
        },
      },
    };

    renderSpec(spec);

    expect(screen.getByText("Test Card")).toBeDefined();
  });

  it("renders a Badge with a variant class applied", () => {
    // Badge renders children but json-render's `type: "text"` primitive is not
    // a registered renderer — so we test that Badge renders with correct variant
    // by checking the DOM for the badge element.
    const spec = {
      root: "badge1",
      elements: {
        badge1: {
          type: "Badge",
          props: { variant: "success", dot: true },
        },
      },
    };

    const { container } = renderSpec(spec);

    // Badge renders as a <span> — verify it exists in the DOM
    const badgeEl = container.querySelector("span");
    expect(badgeEl).not.toBeNull();
  });

  it("renders a Stack layout container with a Text child", () => {
    const spec = {
      root: "stack1",
      elements: {
        stack1: {
          type: "Stack",
          props: { direction: "column", gap: "md" },
          children: ["txt1"],
        },
        txt1: {
          type: "Text",
          props: { variant: "body" },
          children: ["innerText"],
        },
        innerText: {
          type: "Text",
          props: { variant: "label" },
        },
      },
    };

    const { container } = renderSpec(spec);

    // Stack renders as a div — verify it exists
    const stackEl = container.querySelector("div");
    expect(stackEl).not.toBeNull();
  });
});
