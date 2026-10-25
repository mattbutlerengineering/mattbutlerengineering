/**
 * Registry adapters must forward the schema props rialto components honour
 * (Stack.wrap, Text.mono/truncate, Input.showOptional).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "../registry.js";

function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

function stackSpec(wrap: boolean) {
  return {
    root: "s1",
    elements: { s1: { type: "Stack", props: { direction: "row", wrap }, children: [] } },
  };
}

function textSpec(props: Record<string, unknown>) {
  return {
    root: "t1",
    elements: {
      t1: {
        type: "Text",
        props: { children: "Sample words", variant: "body", ...props },
        children: [],
      },
    },
  };
}

describe("Stack adapter", () => {
  it("forwards wrap", () => {
    const on = renderSpec(stackSpec(true)).container.firstElementChild?.className;
    const off = renderSpec(stackSpec(false)).container.firstElementChild?.className;
    expect(on).toMatch(/wrap/);
    expect(off).not.toMatch(/wrap/);
  });
});

describe("Text adapter", () => {
  it("forwards mono", () => {
    const { container } = renderSpec(textSpec({ mono: true }));
    expect(container.firstElementChild?.className).toMatch(/mono/);
  });

  it("forwards truncate", () => {
    const { container } = renderSpec(textSpec({ truncate: true }));
    expect(container.firstElementChild?.className).toMatch(/truncate/);
  });
});

describe("Input adapter", () => {
  it("forwards showOptional", () => {
    renderSpec({
      root: "i1",
      elements: { i1: { type: "Input", props: { label: "Name", showOptional: true } } },
    });
    expect(screen.getByText("(optional)")).toBeTruthy();
  });
});
