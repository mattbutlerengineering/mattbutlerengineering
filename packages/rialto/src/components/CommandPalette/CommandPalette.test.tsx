import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { CommandPalette } from "./CommandPalette";
import type { CommandItem } from "./CommandPalette";

// scrollIntoView is not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn();

const items: CommandItem[] = [
  { id: "new-file", label: "New File", group: "File", onSelect: vi.fn() },
  { id: "open", label: "Open", group: "File", onSelect: vi.fn() },
  { id: "undo", label: "Undo", group: "Edit", onSelect: vi.fn() },
  { id: "copy", label: "Copy", onSelect: vi.fn() },
];

describe("CommandPalette", () => {
  beforeEach(() => {
    items.forEach((item) => (item.onSelect as ReturnType<typeof vi.fn>).mockReset());
  });

  describe("rendering", () => {
    it("renders nothing when open=false", () => {
      render(<CommandPalette open={false} onOpenChange={() => {}} items={items} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders dialog when open=true", () => {
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders search input", () => {
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("renders all items when open", () => {
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      expect(screen.getByText("New File")).toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
      expect(screen.getByText("Undo")).toBeInTheDocument();
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    it("renders group labels", () => {
      render(
        <CommandPalette open onOpenChange={() => {}} items={items} groups={["File", "Edit"]} />
      );
      expect(screen.getByText("File")).toBeInTheDocument();
      expect(screen.getByText("Edit")).toBeInTheDocument();
    });

    it("renders custom placeholder", () => {
      render(
        <CommandPalette open onOpenChange={() => {}} items={items} placeholder="Type a command" />
      );
      expect(screen.getByPlaceholderText("Type a command")).toBeInTheDocument();
    });

    it("shows 'No results found' when query has no matches", async () => {
      const user = userEvent.setup();
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      await user.type(screen.getByRole("combobox"), "xyzxyz");
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });

  describe("search filtering", () => {
    it("filters items by query", async () => {
      const user = userEvent.setup();
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      await user.type(screen.getByRole("combobox"), "undo");
      expect(screen.getByText("Undo")).toBeInTheDocument();
      expect(screen.queryByText("New File")).not.toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("calls onSelect and closes when item is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<CommandPalette open onOpenChange={onOpenChange} items={items} />);
      await user.click(screen.getByText("Copy"));
      expect(items[3]!.onSelect).toHaveBeenCalledOnce();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("closes on Escape key", async () => {
      const onOpenChange = vi.fn();
      render(<CommandPalette open onOpenChange={onOpenChange} items={items} />);
      // Fire Escape directly on the combobox — it bubbles to the overlay's onKeyDown
      const combobox = screen.getByRole("combobox");
      fireEvent.keyDown(combobox, { key: "Escape" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onOpenChange(false) when overlay is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const { container } = render(
        <CommandPalette open onOpenChange={onOpenChange} items={items} />
      );
      // Click on the overlay (the outermost div)
      const overlay = container.firstChild as HTMLElement;
      if (overlay) {
        await user.click(overlay);
        expect(onOpenChange).toHaveBeenCalledWith(false);
      }
    });

    it("ArrowDown navigates to next item", async () => {
      const user = userEvent.setup();
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{ArrowDown}");
      // Second item (index 1) should now be active
      const options = screen.getAllByRole("option");
      expect(options[1]).toHaveAttribute("data-active", "true");
    });

    it("Clicking item calls onSelect and closes palette", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSelect = vi.fn();
      const testItems = [{ id: "copy", label: "Copy", onSelect }];
      render(<CommandPalette open onOpenChange={onOpenChange} items={testItems} />);
      // Click the option directly
      await user.click(screen.getByRole("option", { name: "Copy" }));
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("Home key jumps to first item", async () => {
      const user = userEvent.setup();
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      const input = screen.getByRole("combobox");
      await user.click(input);
      // Navigate down first
      await user.keyboard("{ArrowDown}{ArrowDown}");
      await user.keyboard("{Home}");
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("data-active", "true");
    });

    it("End key jumps to last item", async () => {
      const user = userEvent.setup();
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{End}");
      const options = screen.getAllByRole("option");
      expect(options[options.length - 1]).toHaveAttribute("data-active", "true");
    });
  });

  describe("ARIA attributes", () => {
    it("dialog has aria-label", () => {
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Command palette");
    });

    it("listbox has aria-label", () => {
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      expect(screen.getByRole("listbox")).toHaveAttribute("aria-label", "Command results");
    });
  });

  describe("accessibility", () => {
    it("passes axe when open", async () => {
      const { container } = render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
