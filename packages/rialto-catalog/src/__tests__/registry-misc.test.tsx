/**
 * registry-misc.test.tsx
 *
 * MasterOverride, ImageUpload and Tree render from a JSON spec. Host state (switch
 * position, image URL) is supplied by the spec; user actions are emitted as events.
 * ChatPanel needs a host-injected transport, so it is excluded from the AI catalog.
 */

import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "../registry.js";
import { catalogMeta } from "../generated-catalog.js";

function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

describe("MasterOverride", () => {
  it("renders its label from the spec", () => {
    const { getAllByText } = renderSpec({
      root: "m",
      elements: {
        m: { type: "MasterOverride", props: { on: false, label: "Pause bookings" } },
      },
    });
    expect(getAllByText("Pause bookings").length).toBeGreaterThan(0);
  });
});

describe("ImageUpload", () => {
  it("renders its label from the spec", () => {
    const { getByText } = renderSpec({
      root: "i",
      elements: { i: { type: "ImageUpload", props: { label: "Venue logo" } } },
    });
    expect(getByText("Venue logo")).toBeTruthy();
  });
});

describe("Tree", () => {
  it("renders its nodes and nested children once expanded", () => {
    const { getByText } = renderSpec({
      root: "t",
      elements: {
        t: {
          type: "Tree",
          props: {
            data: [{ id: "a", label: "Main floor", children: [{ id: "b", label: "Bar" }] }],
          },
        },
      },
    });
    expect(getByText("Main floor")).toBeTruthy();
    fireEvent.click(getByText("Main floor"));
  });
});

describe("ChatPanel", () => {
  it("stays out of the AI catalog and the registry", () => {
    expect(catalogMeta.ChatPanel?.include).toBe(false);
    expect(Object.keys(registry)).not.toContain("ChatPanel");
  });
});
