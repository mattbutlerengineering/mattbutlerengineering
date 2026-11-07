/**
 * Adapters for the components added in #8455: Skeleton, Drawer, Tooltip, Popover,
 * PinInput, DropdownMenu, ScrollArea, Handshake. Overlays that take a trigger
 * element in rialto (Popover, DropdownMenu) take a label here and render it as a Button.
 */

import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
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

describe("Skeleton", () => {
  it("renders every requested line", () => {
    const { container } = renderSpec({
      root: "s",
      elements: { s: { type: "Skeleton", props: { variant: "text", lines: 3, width: "100%" } } },
    });
    expect(container.querySelectorAll("[aria-hidden='true'] > div")).toHaveLength(3);
  });
});

describe("ScrollArea", () => {
  it("constrains height and renders children inside the scroll region", () => {
    renderSpec({
      root: "a",
      elements: {
        a: { type: "ScrollArea", props: { maxHeight: "120px" }, children: ["t"] },
        t: { type: "Text", props: { children: "Log line one" } },
      },
    });
    const region = screen.getByRole("region");
    expect(region.style.maxHeight).toBe("120px");
    expect(region.textContent).toContain("Log line one");
  });
});

describe("Handshake", () => {
  it("renders as a labelled image with the stations", () => {
    renderSpec({
      root: "h",
      elements: {
        h: {
          type: "Handshake",
          props: {
            "aria-label": "Verifying your sign-in",
            stations: ["Browser", "Identity", "API"],
            state: "settled",
          },
        },
      },
    });
    expect(screen.getByRole("img", { name: "Verifying your sign-in" }).textContent).toContain(
      "Identity"
    );
  });

  it("rejects fewer than two stations", () => {
    expect(
      generatedSchemas.Handshake.safeParse({ "aria-label": "x", stations: ["Only"] }).success
    ).toBe(false);
  });
});

describe("PinInput", () => {
  it("holds typed digits and leaves the cells filled", () => {
    renderSpec({
      root: "p",
      elements: { p: { type: "PinInput", props: { length: 4, label: "Code" } } },
    });
    const cells = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(cells).toHaveLength(4);
    fireEvent.change(cells[0]!, { target: { value: "7" } });
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("7");
  });
});

describe("Tooltip", () => {
  it("renders the trigger child", () => {
    renderSpec({
      root: "t",
      elements: {
        t: { type: "Tooltip", props: { content: "Explains the term" }, children: ["b"] },
        b: { type: "Button", props: { children: "Hover me" } },
      },
    });
    expect(screen.getByRole("button", { name: "Hover me" })).toBeTruthy();
  });
});

describe("Popover", () => {
  it("renders the trigger label as a button that opens the panel with its children", () => {
    renderSpec({
      root: "p",
      elements: {
        p: { type: "Popover", props: { trigger: "Pick a time", title: "Times" }, children: ["t"] },
        t: { type: "Text", props: { children: "9:00 AM" } },
      },
    });
    expect(screen.queryByText("9:00 AM")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pick a time" }));
    expect(screen.getByText("9:00 AM")).toBeTruthy();
  });

  it("rejects a spec without a trigger label", () => {
    expect(generatedSchemas.Popover.safeParse({}).success).toBe(false);
  });
});

describe("DropdownMenu", () => {
  it("opens from the trigger label and lists items, dropping blank-label entries", () => {
    renderSpec({
      root: "m",
      elements: {
        m: {
          type: "DropdownMenu",
          props: {
            trigger: "Actions",
            items: [
              { id: "edit", label: "Edit" },
              { type: "divider" },
              { id: "del", label: "Delete", destructive: true },
              { id: "blank", label: " " },
            ],
          },
        },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getAllByRole("menuitem").map((n) => n.textContent)).toEqual(["Edit", "Delete"]);
  });
});

describe("Drawer", () => {
  it("renders its title and children when open", () => {
    renderSpec({
      root: "d",
      elements: {
        d: { type: "Drawer", props: { open: true, title: "Advanced" }, children: ["t"] },
        t: { type: "Text", props: { children: "Drawer body" } },
      },
    });
    expect(screen.getByText("Advanced")).toBeTruthy();
    expect(screen.getByText("Drawer body")).toBeTruthy();
  });

  it("renders nothing visible when closed", () => {
    renderSpec({
      root: "d",
      elements: { d: { type: "Drawer", props: { open: false, title: "Hidden" } } },
    });
    expect(screen.queryByText("Hidden")).toBeNull();
  });
});
