import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ContextMenu } from "./ContextMenu";
import type { ContextMenuEntry, ContextMenuItemDef } from "./ContextMenu";

const items: ContextMenuEntry[] = [
  { id: "copy", label: "Copy", onSelect: vi.fn() },
  { id: "paste", label: "Paste", onSelect: vi.fn() },
  { type: "divider" },
  { id: "delete", label: "Delete", destructive: true, onSelect: vi.fn() },
];

function renderContextMenu(entries: ContextMenuEntry[] = items) {
  return render(
    <ContextMenu items={entries}>
      <div data-testid="trigger">Right-click me</div>
    </ContextMenu>
  );
}

function rightClick(element: HTMLElement) {
  fireEvent.contextMenu(element);
}

describe("ContextMenu", () => {
  beforeEach(() => {
    items.forEach((item) => {
      if ("onSelect" in item && typeof item.onSelect === "function") {
        (item.onSelect as ReturnType<typeof vi.fn>).mockReset();
      }
    });
  });

  describe("rendering", () => {
    it("renders children", () => {
      renderContextMenu();
      expect(screen.getByTestId("trigger")).toBeInTheDocument();
    });

    it("does not show menu by default", () => {
      renderContextMenu();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("shows menu after right-click", () => {
      renderContextMenu();
      rightClick(screen.getByTestId("trigger"));
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("renders all menu items", () => {
      renderContextMenu();
      rightClick(screen.getByTestId("trigger"));
      expect(screen.getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Paste" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    });

    it("renders divider", () => {
      renderContextMenu();
      rightClick(screen.getByTestId("trigger"));
      expect(screen.getByRole("separator")).toBeInTheDocument();
    });

    it("renders section labels", () => {
      const itemsWithLabel: ContextMenuEntry[] = [
        { type: "label", label: "Actions" },
        { id: "copy", label: "Copy", onSelect: vi.fn() },
      ];
      renderContextMenu(itemsWithLabel);
      rightClick(screen.getByTestId("trigger"));
      expect(screen.getByText("Actions")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("calls onSelect when item is clicked", () => {
      renderContextMenu();
      rightClick(screen.getByTestId("trigger"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
      expect((items[0]! as ContextMenuItemDef).onSelect as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    });

    it("closes menu after item click", async () => {
      renderContextMenu();
      rightClick(screen.getByTestId("trigger"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
      );
    });

    it("closes on Escape key", async () => {
      const user = userEvent.setup();
      renderContextMenu();
      rightClick(screen.getByTestId("trigger"));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
      );
    });

    it("does not call onSelect for disabled items", () => {
      const onSelect = vi.fn();
      const disabledItems: ContextMenuEntry[] = [
        { id: "disabled", label: "Disabled", disabled: true, onSelect },
      ];
      render(
        <ContextMenu items={disabledItems}>
          <div data-testid="trigger">Right-click me</div>
        </ContextMenu>
      );
      rightClick(screen.getByTestId("trigger"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Disabled" }));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("passes axe when closed", async () => {
      const { container } = renderContextMenu();
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });

    it("passes axe when open", async () => {
      const { container } = renderContextMenu();
      rightClick(screen.getByTestId("trigger"));
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
