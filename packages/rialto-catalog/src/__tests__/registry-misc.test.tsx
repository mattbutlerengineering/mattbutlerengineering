/**
 * registry-misc.test.tsx
 *
 * MasterOverride, ImageUpload and Tree render from a JSON spec. The spec seeds the
 * initial state (switch position, image URL); the adapters hold it after user
 * actions, which are also emitted as events.
 * ChatPanel needs a host-injected transport, so it is excluded from the AI catalog.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("flips the switch once the cover is lifted (adapter holds the controlled value)", () => {
    const { getByRole } = renderSpec({
      root: "m",
      elements: {
        m: { type: "MasterOverride", props: { on: false, label: "Pause bookings" } },
      },
    });
    fireEvent.click(getByRole("button", { name: /lift safety cover/i }));
    fireEvent.click(getByRole("switch"));
    expect(getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });
});

describe("TagsInput", () => {
  it("renders its label and seeded tags from the spec", () => {
    const { getByText } = renderSpec({
      root: "t",
      elements: {
        t: { type: "TagsInput", props: { label: "Dietary notes", defaultValue: ["vegan"] } },
      },
    });
    expect(getByText("Dietary notes")).toBeTruthy();
    expect(getByText("vegan")).toBeTruthy();
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fileInput(): HTMLInputElement {
    return document.querySelector("input[type='file']") as HTMLInputElement;
  }

  it("previews the chosen photo", () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:logo", revokeObjectURL: () => {} });
    renderSpec({
      root: "i",
      elements: { i: { type: "ImageUpload", props: { label: "Venue logo" } } },
    });
    const file = new File(["png"], "logo.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(document.querySelector("img")?.getAttribute("src")).toBe("blob:logo");
  });

  it("shows the validation error for an oversized photo", () => {
    const { getByText } = renderSpec({
      root: "i",
      elements: { i: { type: "ImageUpload", props: { label: "Venue logo", maxSize: 1 } } },
    });
    const big = new File(["too big"], "big.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [big] } });
    expect(getByText(/too large|exceeds|size/i)).toBeTruthy();
  });
});

describe("Tree", () => {
  it("renders its nodes and nested children once expanded", () => {
    const { getByText, getByRole } = renderSpec({
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
    fireEvent.keyDown(getByRole("tree"), { key: "ArrowRight" });
    expect(getByText("Bar")).toBeTruthy();
  });
});

describe("ChatPanel", () => {
  it("stays out of the AI catalog and the registry", () => {
    expect(catalogMeta.ChatPanel?.include).toBe(false);
    expect(Object.keys(registry)).not.toContain("ChatPanel");
  });
});
