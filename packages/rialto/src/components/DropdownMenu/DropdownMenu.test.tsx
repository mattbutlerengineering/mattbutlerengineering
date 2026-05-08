/**
 * Unit tests for the DropdownMenu component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownMenu } from "./DropdownMenu";
import { Button } from "../Button/Button";

const user = userEvent.setup();

const basicItems = [
  { id: "edit", label: "Edit", onSelect: vi.fn() },
  { id: "copy", label: "Copy", onSelect: vi.fn() },
  { id: "delete", label: "Delete", destructive: true, onSelect: vi.fn() },
];

describe("DropdownMenu", () => {
  beforeEach(() => {
    basicItems.forEach((item) => (item.onSelect as ReturnType<typeof vi.fn>).mockReset());
  });

  it("does not show menu items by default", () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("shows menu when trigger is clicked", async () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    await user.click(screen.getByRole("button", { name: /actions/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("closes when trigger is clicked again", async () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    const btn = screen.getByRole("button", { name: /actions/i });
    await user.click(btn);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(btn);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("calls onSelect and closes when item is clicked", async () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    await user.click(screen.getByRole("button", { name: /actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit/i }));
    expect(basicItems[0]!.onSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("closes on Escape key", async () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    await user.click(screen.getByRole("button", { name: /actions/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("closes when clicking outside", async () => {
    render(
      <div>
        <DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />
        <p>Outside</p>
      </div>
    );
    await user.click(screen.getByRole("button", { name: /actions/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByText("Outside"));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("keyboard: Enter opens menu from trigger", () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    const btn = screen.getByRole("button", { name: /actions/i });
    // Fire keydown on the presentation div (parent of the trigger button)
    const presentationDiv = btn.parentElement!;
    act(() => btn.focus());
    fireEvent.keyDown(presentationDiv, { key: "Enter" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    // First item should be active (data-active=true)
    expect(screen.getByRole("menuitem", { name: /edit/i })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("keyboard: ArrowDown/ArrowUp navigates items (data-active)", () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    const btn = screen.getByRole("button", { name: /actions/i });
    const presentationDiv = btn.parentElement!;
    act(() => btn.focus());
    // Open the menu first
    fireEvent.keyDown(presentationDiv, { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: /edit/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /copy/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: /edit/i })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("keyboard: Home/End jumps to first/last item (data-active)", () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    const btn = screen.getByRole("button", { name: /actions/i });
    const presentationDiv = btn.parentElement!;
    act(() => btn.focus());
    fireEvent.keyDown(presentationDiv, { key: "Enter" });
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: /delete/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    fireEvent.keyDown(menu, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: /edit/i })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("keyboard: Enter selects active item and closes", async () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    const btn = screen.getByRole("button", { name: /actions/i });
    const presentationDiv = btn.parentElement!;
    act(() => btn.focus());
    fireEvent.keyDown(presentationDiv, { key: "Enter" });
    const menu = screen.getByRole("menu");
    // Edit is active (index 0), press Enter
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(basicItems[0]!.onSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("renders dividers", async () => {
    render(
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[
          { id: "edit", label: "Edit", onSelect: vi.fn() },
          { type: "divider" },
          { id: "delete", label: "Delete", onSelect: vi.fn() },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: /actions/i }));
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("renders section labels", async () => {
    render(
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[
          { type: "label", label: "File" },
          { id: "save", label: "Save", onSelect: vi.fn() },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: /actions/i }));
    expect(screen.getByText("File")).toBeInTheDocument();
  });

  it("skips disabled items in keyboard navigation", () => {
    render(
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[
          { id: "edit", label: "Edit", onSelect: vi.fn() },
          { id: "disabled", label: "Disabled", disabled: true, onSelect: vi.fn() },
          { id: "copy", label: "Copy", onSelect: vi.fn() },
        ]}
      />
    );
    const btn = screen.getByRole("button", { name: /actions/i });
    const presentationDiv = btn.parentElement!;
    act(() => btn.focus());
    fireEvent.keyDown(presentationDiv, { key: "Enter" });
    // Edit is active (index 0)
    expect(screen.getByRole("menuitem", { name: /edit/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    // Should skip disabled (index 1) and go to Copy (index 2)
    expect(screen.getByRole("menuitem", { name: /copy/i })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("does not call onSelect for disabled items", async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[{ id: "disabled", label: "Disabled", disabled: true, onSelect }]}
      />
    );
    await user.click(screen.getByRole("button", { name: /actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /disabled/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sets aria-haspopup=menu on trigger", () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    expect(screen.getByRole("button", { name: /actions/i })).toHaveAttribute(
      "aria-haspopup",
      "menu"
    );
  });

  it("sets aria-expanded on trigger", async () => {
    render(<DropdownMenu trigger={<Button>Actions</Button>} items={basicItems} />);
    const btn = screen.getByRole("button", { name: /actions/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("wraps arrow navigation at end", () => {
    render(
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[
          { id: "a", label: "Alpha", onSelect: vi.fn() },
          { id: "b", label: "Beta", onSelect: vi.fn() },
        ]}
      />
    );
    const btn = screen.getByRole("button", { name: /actions/i });
    const presentationDiv = btn.parentElement!;
    act(() => btn.focus());
    fireEvent.keyDown(presentationDiv, { key: "Enter" });
    // Alpha is active (index 0)
    expect(screen.getByRole("menuitem", { name: /alpha/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /beta/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    // At last item, ArrowDown wraps to first
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /alpha/i })).toHaveAttribute(
      "data-active",
      "true"
    );
  });
});
