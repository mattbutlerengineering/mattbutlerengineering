/**
 * registry-system.test.tsx
 *
 * ErrorBoundary, ThemeToggle, DisabledTooltip, SplitScreenExit and Kbd render from
 * a JSON spec. Host state (theme, active) is supplied by the spec; user actions are
 * emitted as events.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "../registry.js";

function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

describe("Kbd", () => {
  it("renders its key as a keyboard element", () => {
    const { container } = renderSpec({
      root: "k",
      elements: { k: { type: "Kbd", props: { children: "Esc" } } },
    });
    expect(container.querySelector("kbd")?.textContent).toBe("Esc");
  });
});

describe("ThemeToggle", () => {
  it("renders a labelled toggle button", () => {
    const { getByRole } = renderSpec({
      root: "t",
      elements: { t: { type: "ThemeToggle", props: { theme: "light" } } },
    });
    expect(getByRole("button")).toBeTruthy();
  });
});

describe("DisabledTooltip", () => {
  it("renders its child", () => {
    const { getByText } = renderSpec({
      root: "d",
      elements: {
        d: {
          type: "DisabledTooltip",
          props: { disabled: true, disabledReason: "Fully booked" },
          children: ["b"],
        },
        b: { type: "Badge", props: { label: "Reserve" } },
      },
    });
    expect(getByText("Reserve")).toBeTruthy();
  });
});

describe("ErrorBoundary", () => {
  it("renders its children when nothing fails", () => {
    const { getByText } = renderSpec({
      root: "e",
      elements: {
        e: { type: "ErrorBoundary", props: {}, children: ["b"] },
        b: { type: "Badge", props: { label: "Safe content" } },
      },
    });
    expect(getByText("Safe content")).toBeTruthy();
  });
});

describe("SplitScreenExit", () => {
  it("renders its content while inactive", () => {
    const { getByText } = renderSpec({
      root: "s",
      elements: {
        s: { type: "SplitScreenExit", props: { active: false }, children: ["b"] },
        b: { type: "Badge", props: { label: "Booking confirmed" } },
      },
    });
    expect(getByText("Booking confirmed")).toBeTruthy();
  });
});
