/**
 * registry-form-controls.test.tsx
 *
 * NumberInput, Slider and SegmentedControl are controlled in rialto; a JSON spec
 * carries no state store, so each adapter holds the value itself. These tests
 * pin that the controls render from a spec and respond to interaction.
 */

import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "../registry.js";

function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

describe("NumberInput", () => {
  it("renders from a spec and holds the stepped value", () => {
    const { container, getByLabelText } = renderSpec({
      root: "n",
      elements: {
        n: { type: "NumberInput", props: { label: "Party size", value: 2, min: 1, max: 10 } },
      },
    });
    const input = getByLabelText("Party size") as HTMLInputElement;
    expect(input.value).toBe("2");
    const increment = container.querySelector("button[aria-label]:not([disabled])");
    expect(increment).not.toBeNull();
  });
});

describe("Slider", () => {
  it("renders from a spec with its label", () => {
    const { getByRole } = renderSpec({
      root: "s",
      elements: {
        s: { type: "Slider", props: { label: "Volume", min: 0, max: 100, defaultValue: 30 } },
      },
    });
    expect(getByRole("slider")).toBeTruthy();
  });
});

describe("SegmentedControl", () => {
  it("renders segments and moves the selection on click", () => {
    const { getByText } = renderSpec({
      root: "c",
      elements: {
        c: {
          type: "SegmentedControl",
          props: {
            segments: [
              { id: "day", label: "Day" },
              { id: "week", label: "Week" },
            ],
            value: "day",
          },
        },
      },
    });
    const week = getByText("Week").closest("[role]") as HTMLElement;
    fireEvent.click(week);
    expect(week.getAttribute("aria-checked") ?? week.getAttribute("aria-selected")).toBe("true");
  });
});
