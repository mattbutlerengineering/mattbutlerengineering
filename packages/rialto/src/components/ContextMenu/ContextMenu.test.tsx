import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ContextMenu, type ContextMenuEntry, type ContextMenuItemDef } from "./ContextMenu";

const basicItems: ContextMenuItemDef[] = [
  { id: "copy", label: "Copy", onSelect: vi.fn() },
  { id: "paste", label: "Paste", onSelect: vi.fn() },
  { id: "delete", label: "Delete", destructive: true, onSelect: vi.fn() },
];

describe("ContextMenu", () => {
  beforeEach(() => {
    basicItems.forEach((item) => {
      if ("onSelect" in item && item.onSelect) {
        (item.onSelect as ReturnType<typeof vi.fn>).mockReset();
      }
    });
  });

  describe("rendering", () => {
    it("renders the trigger child", () => {
      render(
        <ContextMenu items={basicItems}>
          <div>Right-click here</div>
        </ContextMenu>
      );
      expect(screen.getByText("Right-click here")).toBeInTheDocument();
    });

    it("does not show menu items by default", () => {
      render(
        <ContextMenu items={basicItems}>
          <div>Target</div>
        </ContextMenu>
      );
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("shows menu on right-click (contextmenu event)", () => {
      render(
        <ContextMenu items={basicItems}>
          <div>Target</div>
        </ContextMenu>
      );
      const target = screen.getByText("Target");
      fireEvent.contextMenu(target);
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByText("Copy")).toBeInTheDocument();
      expect(screen.getByText("Paste")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("renders dividers", () => {
      const items: ContextMenuEntry[] = [
        { id: "copy", label: "Copy", onSelect: vi.fn() },
        { type: "divider" },
        { id: "delete", label: "Delete", onSelect: vi.fn() },
      ];
      render(
        <ContextMenu items={items}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      expect(screen.getByRole("separator")).toBeInTheDocument();
    });

    it("renders section labels", () => {
      const items: ContextMenuEntry[] = [
        { type: "label", label: "Edit actions" },
        { id: "copy", label: "Copy", onSelect: vi.fn() },
      ];
      render(
        <ContextMenu items={items}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      expect(screen.getByText("Edit actions")).toBeInTheDocument();
    });

    it("renders shortcut hints", () => {
      const items: ContextMenuEntry[] = [
        { id: "copy", label: "Copy", shortcut: "Ctrl+C", onSelect: vi.fn() },
      ];
      render(
        <ContextMenu items={items}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      expect(screen.getByText("Ctrl+C")).toBeInTheDocument();
    });
  });

  describe("item selection", () => {
    it("calls onSelect when a menu item is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ContextMenu items={basicItems}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      await user.click(screen.getByRole("menuitem", { name: /copy/i }));
      expect(basicItems[0]!.onSelect).toHaveBeenCalledTimes(1);
    });

    it("closes menu after item click", async () => {
      const user = userEvent.setup();
      render(
        <ContextMenu items={basicItems}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      await user.click(screen.getByRole("menuitem", { name: /copy/i }));
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    });

    it("does not call onSelect for disabled items", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const items: ContextMenuEntry[] = [
        { id: "disabled-item", label: "Disabled", disabled: true, onSelect },
      ];
      render(
        <ContextMenu items={items}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      await user.click(screen.getByRole("menuitem", { name: /disabled/i }));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("close behavior", () => {
    it("closes on Escape key", async () => {
      const user = userEvent.setup();
      render(
        <ContextMenu items={basicItems}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    });

    it("closes when clicking outside", async () => {
      const user = userEvent.setup();
      render(
        <div>
          <ContextMenu items={basicItems}>
            <div>Target</div>
          </ContextMenu>
          <p>Outside</p>
        </div>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      await user.click(screen.getByText("Outside"));
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    });
  });

  describe("keyboard navigation", () => {
    it("ArrowDown/ArrowUp navigates items via data-active", () => {
      render(
        <ContextMenu items={basicItems}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      const menu = screen.getByRole("menu");
      expect(screen.getByRole("menuitem", { name: /copy/i })).toHaveAttribute(
        "data-active",
        "true"
      );
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(screen.getByRole("menuitem", { name: /paste/i })).toHaveAttribute(
        "data-active",
        "true"
      );
      fireEvent.keyDown(menu, { key: "ArrowUp" });
      expect(screen.getByRole("menuitem", { name: /copy/i })).toHaveAttribute(
        "data-active",
        "true"
      );
    });

    it("Home/End jumps to first/last item", () => {
      render(
        <ContextMenu items={basicItems}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      const menu = screen.getByRole("menu");
      fireEvent.keyDown(menu, { key: "End" });
      expect(screen.getByRole("menuitem", { name: /delete/i })).toHaveAttribute(
        "data-active",
        "true"
      );
      fireEvent.keyDown(menu, { key: "Home" });
      expect(screen.getByRole("menuitem", { name: /copy/i })).toHaveAttribute(
        "data-active",
        "true"
      );
    });

    it("Enter selects active item and closes menu", async () => {
      render(
        <ContextMenu items={basicItems}>
          <div>Target</div>
        </ContextMenu>
      );
      fireEvent.contextMenu(screen.getByText("Target"));
      const menu = screen.getByRole("menu");
      fireEvent.keyDown(menu, { key: "Enter" });
      expect(basicItems[0]!.onSelect).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    });

    it("skips disabled items in keyboard navigation", () => {
      const items: ContextMenuEntry[] = [
        { id: "copy", label: "Copy", onSelect: vi.fn() },
        { id: "disabled-item", label: "Disabled", disabled: true, onSelect: vi.fn() },
        { id: "paste", label: "Paste", onSelect: vi.fn() },
      ];
      render(
        <ContextMenu items={items}>
          <div>Target</div>
        </ContextMenu>
      );
      act(() => {
        fireEvent.contextMenu(screen.getByText("Target"));
      });
      const menu = screen.getByRole("menu");
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(screen.getByRole("menuitem", { name: /paste/i })).toHaveAttribute(
        "data-active",
        "true"
      );
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations when closed", async () => {
      const { container } = render(
        <ContextMenu items={basicItems}>
          <div>Right-click target</div>
        </ContextMenu>
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});
