/**
 * registry-overlays.test.tsx
 *
 * ConfirmDialog, HoverCard, ContextMenu and CommandPalette render from a JSON
 * spec. `open` is host-supplied (a spec has no state store); user choices are
 * emitted as events.
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

describe("ConfirmDialog", () => {
  it("renders an open dialog with its title and labels", () => {
    const { getByText, getByRole } = renderSpec({
      root: "c",
      elements: {
        c: {
          type: "ConfirmDialog",
          props: {
            open: true,
            title: "Cancel this booking?",
            confirmLabel: "Cancel booking",
            cancelLabel: "Keep it",
            variant: "destructive",
          },
        },
      },
    });
    expect(getByRole("alertdialog")).toBeTruthy();
    expect(getByText("Cancel this booking?")).toBeTruthy();
    expect(getByText("Keep it")).toBeTruthy();
    expect(getByText("Cancel booking")).toBeTruthy();
  });

  it("renders nothing while closed", () => {
    const { queryByRole } = renderSpec({
      root: "c",
      elements: { c: { type: "ConfirmDialog", props: { open: false, title: "Sure?" } } },
    });
    expect(queryByRole("dialog")).toBeNull();
    expect(queryByRole("alertdialog")).toBeNull();
  });
});

describe("HoverCard", () => {
  it("renders its trigger child", () => {
    const { getByText } = renderSpec({
      root: "h",
      elements: {
        h: { type: "HoverCard", props: { content: "Table 4, party of 6" }, children: ["t"] },
        t: { type: "Text", props: { text: "Party Okafor" } },
      },
    });
    expect(getByText("Party Okafor")).toBeTruthy();
  });
});

describe("ContextMenu", () => {
  it("opens its items on right-click of the child", () => {
    const { getByText, findByText } = renderSpec({
      root: "m",
      elements: {
        m: {
          type: "ContextMenu",
          props: {
            items: [
              { id: "edit", label: "Edit booking" },
              { type: "divider" },
              { id: "cancel", label: "Cancel booking", destructive: true },
            ],
          },
          children: ["t"],
        },
        t: { type: "Text", props: { text: "Table 4" } },
      },
    });
    fireEvent.contextMenu(getByText("Table 4"));
    return findByText("Edit booking").then((el) => expect(el).toBeTruthy());
  });
});

describe("CommandPalette", () => {
  // jsdom has no layout, so scrollIntoView is absent.
  Element.prototype.scrollIntoView ??= () => {};

  it("lists its items when open", () => {
    const { getByText } = renderSpec({
      root: "p",
      elements: {
        p: {
          type: "CommandPalette",
          props: {
            open: true,
            placeholder: "Search",
            items: [
              { id: "tonight", label: "Tonight's service", group: "Go to" },
              { id: "guests", label: "Guest book", group: "Go to" },
            ],
          },
        },
      },
    });
    expect(getByText("Tonight's service")).toBeTruthy();
    expect(getByText("Guest book")).toBeTruthy();
  });
});
