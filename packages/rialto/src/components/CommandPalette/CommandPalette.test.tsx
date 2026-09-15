import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { CommandPalette, rankCommandMatch } from "./CommandPalette";
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

    it("dialog has aria-modal set to true", () => {
      render(<CommandPalette open onOpenChange={() => {}} items={items} />);
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
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

  describe("ranking", () => {
    const walkIn: CommandItem = {
      id: "walk-in",
      label: "Walk-in guest",
      group: "Actions",
      onSelect: vi.fn(),
    };
    const waitlist: CommandItem = {
      id: "waitlist",
      label: "Waitlist",
      group: "Navigation",
      onSelect: vi.fn(),
    };
    const walkway: CommandItem = {
      id: "walkway",
      label: "Show walkway",
      group: "Navigation",
      onSelect: vi.fn(),
    };

    beforeEach(() => {
      [walkIn, waitlist, walkway].forEach((item) =>
        (item.onSelect as ReturnType<typeof vi.fn>).mockReset()
      );
    });

    it('"walk" lists "Walk-in guest" first and does not match "Waitlist"', async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open
          onOpenChange={() => {}}
          items={[walkIn, waitlist]}
          groups={["Actions", "Navigation"]}
        />
      );
      await user.type(screen.getByRole("combobox"), "walk");
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent("Walk-in guest");
      expect(screen.queryByText("Waitlist")).not.toBeInTheDocument();
    });

    it("ArrowDown moves down the rank-ordered list and Enter selects the item under it", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      // Three matches of differing rank for "walk": prefix (0), later-word-start (1),
      // and plain substring (2) — pins both rank order and real ArrowDown movement.
      const top: CommandItem = { id: "top", label: "Walk-in guest", onSelect: vi.fn() };
      const mid: CommandItem = { id: "mid", label: "Show walkway", onSelect: vi.fn() };
      const low: CommandItem = { id: "low", label: "Catwalk tour", onSelect: vi.fn() };
      render(<CommandPalette open onOpenChange={onOpenChange} items={[low, mid, top]} />);
      await user.type(screen.getByRole("combobox"), "walk");
      const options = screen.getAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual([
        "Walk-in guest",
        "Show walkway",
        "Catwalk tour",
      ]);
      await user.keyboard("{ArrowDown}");
      expect(screen.getAllByRole("option")[1]).toHaveAttribute("data-active", "true");
      await user.keyboard("{Enter}");
      expect(mid.onSelect).toHaveBeenCalledOnce();
      expect(top.onSelect).not.toHaveBeenCalled();
      expect(low.onSelect).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("orders groups by the best rank they contain when a query is present", async () => {
      const user = userEvent.setup();
      render(
        <CommandPalette
          open
          onOpenChange={() => {}}
          items={[walkway, walkIn]}
          groups={["Navigation", "Actions"]}
        />
      );
      await user.type(screen.getByRole("combobox"), "walk");
      // "Walk-in guest" is a prefix match (0); "Show walkway" is a word-start match (1)
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent("Walk-in guest");
      expect(options[1]).toHaveTextContent("Show walkway");
      const listbox = screen.getByRole("listbox");
      expect(listbox.textContent!.indexOf("Actions")).toBeLessThan(
        listbox.textContent!.indexOf("Navigation")
      );
    });

    it("keeps groups order on a rank tie", async () => {
      const user = userEvent.setup();
      const walkFloor: CommandItem = { id: "floor", label: "Walk the floor", group: "Navigation" };
      render(
        <CommandPalette
          open
          onOpenChange={() => {}}
          items={[walkIn, walkFloor]}
          groups={["Navigation", "Actions"]}
        />
      );
      await user.type(screen.getByRole("combobox"), "walk");
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent("Walk the floor");
      expect(options[1]).toHaveTextContent("Walk-in guest");
    });

    it("sorts items within a group by rank and Enter picks the top one", async () => {
      const user = userEvent.setup();
      const walkwayAction: CommandItem = { ...walkway, group: "Actions" };
      render(<CommandPalette open onOpenChange={() => {}} items={[walkwayAction, walkIn]} />);
      await user.type(screen.getByRole("combobox"), "walk");
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent("Walk-in guest");
      await user.keyboard("{Enter}");
      expect(walkIn.onSelect).toHaveBeenCalledOnce();
      expect(walkway.onSelect).not.toHaveBeenCalled();
    });

    it("keeps every item in groups order when the query is empty", () => {
      render(
        <CommandPalette
          open
          onOpenChange={() => {}}
          items={[walkIn, waitlist, walkway]}
          groups={["Navigation", "Actions"]}
        />
      );
      const options = screen.getAllByRole("option").map((o) => o.textContent);
      expect(options).toEqual(["Waitlist", "Show walkway", "Walk-in guest"]);
    });
  });
});

describe("rankCommandMatch", () => {
  it("returns 0 when the label starts with the query", () => {
    expect(rankCommandMatch("New File", "new")).toBe(0);
    expect(rankCommandMatch("Walk-in guest", "walk")).toBe(0);
  });

  it("returns 1 when a later word starts with the query", () => {
    expect(rankCommandMatch("New File", "file")).toBe(1);
    expect(rankCommandMatch("Show walkway", "walk")).toBe(1);
  });

  it("returns 2 for a substring that opens no word", () => {
    expect(rankCommandMatch("New File", "ew")).toBe(2);
    expect(rankCommandMatch("Waitlist", "list")).toBe(2);
  });

  it("returns 3 for strict initials — every query character opens the next word", () => {
    expect(rankCommandMatch("Walk-in guest", "wg")).toBe(3);
    expect(rankCommandMatch("New File", "nf")).toBe(3);
  });

  it("returns null when nothing matches", () => {
    expect(rankCommandMatch("Waitlist", "walk")).toBeNull();
    expect(rankCommandMatch("New File", "xyz")).toBeNull();
    // initials longer than the label has words
    expect(rankCommandMatch("New File", "nfx")).toBeNull();
    // initials out of order
    expect(rankCommandMatch("New File", "fn")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(rankCommandMatch("New File", "NEW")).toBe(0);
    expect(rankCommandMatch("new file", "File")).toBe(1);
    expect(rankCommandMatch("Walk-in guest", "WG")).toBe(3);
  });

  it("trims the query before matching", () => {
    expect(rankCommandMatch("New File", "  new  ")).toBe(0);
    expect(rankCommandMatch("New File", "\tfile\n")).toBe(1);
  });

  it("returns null for an empty or whitespace-only query", () => {
    expect(rankCommandMatch("New File", "")).toBeNull();
    expect(rankCommandMatch("New File", "   ")).toBeNull();
  });
});
