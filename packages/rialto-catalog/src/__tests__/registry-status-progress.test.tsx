/**
 * Progress, Meter, Steps and Pagination render from a JSON spec; Pagination is
 * controlled in rialto, so its adapter holds the page itself.
 */
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "../registry.js";
import { generatedSchemas } from "../generated-schemas.js";

function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

describe("status and progress elements", () => {
  it("renders Progress and Meter with their values", () => {
    const { getByRole } = renderSpec({
      root: "s",
      elements: {
        s: { type: "Stack", props: {}, children: ["p", "m"] },
        p: { type: "Progress", props: { value: 40, label: "Uploading" } },
        m: { type: "Meter", props: { value: 3, min: 0, max: 10, label: "Occupancy" } },
      },
    });
    expect(getByRole("progressbar")).toBeTruthy();
    expect(getByRole("meter").getAttribute("aria-valuenow")).toBe("3");
  });

  it("renders Steps with every label", () => {
    const { getByText } = renderSpec({
      root: "s",
      elements: {
        s: {
          type: "Steps",
          props: { steps: [{ label: "Cart" }, { label: "Pay" }], currentStep: 0 },
        },
      },
    });
    expect(getByText("Cart")).toBeTruthy();
    expect(getByText("Pay")).toBeTruthy();
  });

  it("moves Pagination to the clicked page", () => {
    const { getByText } = renderSpec({
      root: "p",
      elements: { p: { type: "Pagination", props: { page: 1, totalPages: 3 } } },
    });
    fireEvent.click(getByText("2"));
    expect(getByText("2").closest("[aria-current]")?.getAttribute("aria-current")).toBe("page");
  });
});

describe("Meter schema", () => {
  it("keeps value, including null for no data", () => {
    expect(generatedSchemas.Meter.parse({ value: 3 })).toEqual({ value: 3 });
    expect(generatedSchemas.Meter.parse({ value: null })).toEqual({ value: null });
  });
});
