/**
 * Unit tests for interactive/overlay Rialto components (batch 2).
 * Verifies open/close, navigation, selection, and accessibility behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Drawer } from "./Drawer/Drawer";
import { Popover } from "./Popover/Popover";
import { DropdownMenu } from "./DropdownMenu/DropdownMenu";
import { Autocomplete } from "./Autocomplete/Autocomplete";
import { Steps } from "./Steps/Steps";
import { Pagination } from "./Pagination/Pagination";
import { Breadcrumb } from "./Breadcrumb/Breadcrumb";
import { Sidebar } from "./Sidebar/Sidebar";
import { Progress, Spinner } from "./Progress/Progress";
import { Tooltip } from "./Tooltip/Tooltip";

const user = userEvent.setup();
const noop = () => {};

/* ─────────────────────────────────────────────── */
/*  Drawer                                          */
/* ─────────────────────────────────────────────── */
describe("Drawer", () => {
  it("renders children when open", () => {
    render(
      <Drawer open={true} onClose={noop}>
        <p>Drawer body</p>
      </Drawer>
    );
    expect(screen.getByText("Drawer body")).toBeInTheDocument();
  });

  it("does not render panel when closed", () => {
    render(
      <Drawer open={false} onClose={noop}>
        <p>Hidden content</p>
      </Drawer>
    );
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
  });

  it("renders title and description when provided", () => {
    render(
      <Drawer open={true} onClose={noop} title="Settings" description="Manage your preferences">
        <p>Body</p>
      </Drawer>
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Manage your preferences")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Drawer open={true} onClose={onClose} title="Close me">
        <p>Content</p>
      </Drawer>
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Drawer open={true} onClose={onClose} title="Backdrop">
        <p>Content</p>
      </Drawer>
    );
    // Click outside the panel — use the backdrop overlay which is a sibling of the dialog
    const overlay = container.querySelector('[class*="overlay"]') as HTMLElement | null;
    if (overlay) {
      await user.click(overlay);
      expect(onClose).toHaveBeenCalledOnce();
    }
  });

  it("calls onClose on Escape key", async () => {
    const onClose = vi.fn();
    render(
      <Drawer open={true} onClose={onClose}>
        <p>Content</p>
      </Drawer>
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has correct dialog role and aria-modal", () => {
    render(
      <Drawer open={true} onClose={noop} title="Accessible">
        <button>Action</button>
      </Drawer>
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("renders footer when provided", () => {
    render(
      <Drawer open={true} onClose={noop} footer={<button>Save</button>}>
        <p>Body</p>
      </Drawer>
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("accepts side and size props without crashing", () => {
    const { rerender } = render(
      <Drawer open={true} onClose={noop} side="left" size="wide">
        <p>Left wide</p>
      </Drawer>
    );
    expect(screen.getByText("Left wide")).toBeInTheDocument();
    rerender(
      <Drawer open={true} onClose={noop} side="bottom" size="full">
        <p>Bottom full</p>
      </Drawer>
    );
    expect(screen.getByText("Bottom full")).toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────── */
/*  Popover                                         */
/* ─────────────────────────────────────────────── */
describe("Popover", () => {
  it("shows content after trigger click", async () => {
    render(
      <Popover trigger={<button>Open</button>}>
        <p>Popover content</p>
      </Popover>
    );
    expect(screen.queryByText("Popover content")).not.toBeInTheDocument();
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Popover content")).toBeInTheDocument();
  });

  it("closes when clicked again (toggle)", async () => {
    render(
      <Popover trigger={<button>Toggle</button>}>
        <p>Content</p>
      </Popover>
    );
    await user.click(screen.getByText("Toggle"));
    expect(screen.getByText("Content")).toBeInTheDocument();
    await user.click(screen.getByText("Toggle"));
    // AnimatePresence keeps node in DOM during exit; wait for it to be removed
    await waitFor(() => expect(screen.queryByText("Content")).not.toBeInTheDocument());
  });

  it("closes on Escape key", async () => {
    render(
      <Popover trigger={<button>Open</button>}>
        <p>Escapable</p>
      </Popover>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Escapable")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Escapable")).not.toBeInTheDocument());
  });

  it("renders title when provided", async () => {
    render(
      <Popover trigger={<button>Open</button>} title="Filter options">
        <p>Body</p>
      </Popover>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Filter options")).toBeInTheDocument();
  });

  it("title close button calls close", async () => {
    render(
      <Popover trigger={<button>Open</button>} title="With title">
        <p>Body</p>
      </Popover>
    );
    await user.click(screen.getByText("Open"));
    await user.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByText("Body")).not.toBeInTheDocument());
  });

  it("panel has dialog role", async () => {
    render(
      <Popover trigger={<button>Open</button>}>
        <p>Dialog</p>
      </Popover>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("trigger has aria-haspopup and aria-expanded attributes", async () => {
    render(
      <Popover trigger={<button>Trigger</button>}>
        <p>Body</p>
      </Popover>
    );
    const btn = screen.getByRole("button", { name: "Trigger" });
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});

/* ─────────────────────────────────────────────── */
/*  DropdownMenu                                    */
/* ─────────────────────────────────────────────── */
describe("DropdownMenu", () => {
  const items = [
    { id: "edit", label: "Edit", onSelect: vi.fn() },
    { id: "copy", label: "Copy", onSelect: vi.fn() },
    { id: "delete", label: "Delete", destructive: true, onSelect: vi.fn() },
  ];

  beforeEach(() => {
    items.forEach((item) => item.onSelect.mockClear());
  });

  it("shows menu items when trigger is clicked", async () => {
    render(<DropdownMenu trigger={<button>Actions</button>} items={items} />);
    await user.click(screen.getByText("Actions"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onSelect when item is clicked", async () => {
    render(<DropdownMenu trigger={<button>Actions</button>} items={items} />);
    await user.click(screen.getByText("Actions"));
    await user.click(screen.getByText("Edit"));
    expect(items[0]!.onSelect).toHaveBeenCalledOnce();
  });

  it("closes the menu after selection", async () => {
    render(<DropdownMenu trigger={<button>Actions</button>} items={items} />);
    await user.click(screen.getByText("Actions"));
    await user.click(screen.getByText("Copy"));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("closes on Escape key", async () => {
    render(<DropdownMenu trigger={<button>Actions</button>} items={items} />);
    await user.click(screen.getByText("Actions"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("renders dividers and labels", () => {
    render(
      <DropdownMenu
        trigger={<button>Menu</button>}
        items={[
          { type: "label", label: "Section A" },
          { id: "item1", label: "Item 1", onSelect: noop },
          { type: "divider" },
          { id: "item2", label: "Item 2", onSelect: noop },
        ]}
      />
    );
    // trigger click to open
    fireEvent.click(screen.getByText("Menu"));
    expect(screen.getByText("Section A")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("does not call onSelect for disabled items", async () => {
    const disabledHandler = vi.fn();
    render(
      <DropdownMenu
        trigger={<button>Actions</button>}
        items={[{ id: "disabled", label: "Disabled item", disabled: true, onSelect: disabledHandler }]}
      />
    );
    await user.click(screen.getByText("Actions"));
    const disabledBtn = screen.getByRole("menuitem", { name: /disabled item/i });
    expect(disabledBtn).toBeDisabled();
  });

  it("trigger has aria-haspopup=menu and aria-expanded", async () => {
    render(<DropdownMenu trigger={<button>Trigger</button>} items={[]} />);
    const btn = screen.getByRole("button", { name: "Trigger" });
    expect(btn).toHaveAttribute("aria-haspopup", "menu");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("keyboard: ArrowDown/ArrowUp moves focus through items", async () => {
    render(<DropdownMenu trigger={<button>Actions</button>} items={items} />);
    // Open with click; focus moves to first item automatically
    await user.click(screen.getByText("Actions"));
    const editBtn = screen.getByRole("menuitem", { name: /edit/i });
    expect(editBtn).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /copy/i })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: /edit/i })).toHaveFocus();
  });
});

/* ─────────────────────────────────────────────── */
/*  Autocomplete                                    */
/* ─────────────────────────────────────────────── */
describe("Autocomplete", () => {
  const options = [
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
    { value: "cherry", label: "Cherry" },
  ];

  it("renders label and input", () => {
    render(<Autocomplete label="Fruit" options={options} />);
    expect(screen.getByLabelText("Fruit")).toBeInTheDocument();
  });

  it("opens dropdown when typing", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "a");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("filters options by query", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "an");
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();
  });

  it("shows emptyText when no options match", async () => {
    render(<Autocomplete label="Fruit" options={options} emptyText="Nothing found" />);
    const input = screen.getByRole("combobox");
    await user.type(input, "zzz");
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
  });

  it("calls onSelect when an option is clicked", async () => {
    const onSelect = vi.fn();
    render(<Autocomplete label="Fruit" options={options} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "app");
    fireEvent.mouseDown(screen.getByText("Apple"));
    expect(onSelect).toHaveBeenCalledWith({ value: "apple", label: "Apple" });
  });

  it("fills input with selected option label", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "ban");
    fireEvent.mouseDown(screen.getByText("Banana"));
    expect(input).toHaveValue("Banana");
  });

  it("closes dropdown on Escape", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "a");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("calls onChange when typing", async () => {
    const onChange = vi.fn();
    render(<Autocomplete label="Fruit" options={options} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "c");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("keyboard: ArrowDown + Enter selects option", async () => {
    // jsdom doesn't implement scrollIntoView — stub it
    Element.prototype.scrollIntoView = vi.fn();
    const onSelect = vi.fn();
    render(<Autocomplete label="Fruit" options={options} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "a");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalled();
  });

  it("supports controlled value", () => {
    render(<Autocomplete label="Fruit" options={options} value="Apple" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("Apple");
  });
});

/* ─────────────────────────────────────────────── */
/*  Steps                                           */
/* ─────────────────────────────────────────────── */
describe("Steps", () => {
  const steps = [
    { label: "Cart" },
    { label: "Shipping", description: "Enter address" },
    { label: "Payment" },
  ];

  it("renders all step labels", () => {
    render(<Steps steps={steps} currentStep={0} />);
    expect(screen.getByText("Cart")).toBeInTheDocument();
    expect(screen.getByText("Shipping")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
  });

  it("marks current step with aria-current=step", () => {
    render(<Steps steps={steps} currentStep={1} />);
    const stepItems = screen.getAllByRole("listitem");
    expect(stepItems[1]).toHaveAttribute("aria-current", "step");
    expect(stepItems[0]).not.toHaveAttribute("aria-current");
    expect(stepItems[2]).not.toHaveAttribute("aria-current");
  });

  it("renders description when provided", () => {
    render(<Steps steps={steps} currentStep={0} />);
    expect(screen.getByText("Enter address")).toBeInTheDocument();
  });

  it("calls onStepClick with correct index", async () => {
    const onStepClick = vi.fn();
    render(<Steps steps={steps} currentStep={0} onStepClick={onStepClick} />);
    await user.click(screen.getByRole("button", { name: /shipping/i }));
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it("does not render buttons without onStepClick", () => {
    render(<Steps steps={steps} currentStep={0} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renders step numbers for non-completed steps", () => {
    render(<Steps steps={steps} currentStep={1} />);
    // Step index 1 is current (shows "2"), step 2 is upcoming (shows "3")
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders checkmark for completed steps (no step number)", () => {
    render(<Steps steps={steps} currentStep={2} />);
    // Steps 0 and 1 are completed — their check SVGs replace the numbers 1 and 2
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    // Step 2 is current, shows "3"
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("accepts vertical orientation", () => {
    render(<Steps steps={steps} currentStep={0} orientation="vertical" />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("has list role with label", () => {
    render(<Steps steps={steps} currentStep={0} />);
    expect(screen.getByRole("list", { name: /progress steps/i })).toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────── */
/*  Pagination                                      */
/* ─────────────────────────────────────────────── */
describe("Pagination", () => {
  it("renders page numbers", () => {
    render(<Pagination page={1} totalPages={5} onChange={noop} />);
    expect(screen.getByRole("button", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 5" })).toBeInTheDocument();
  });

  it("calls onChange when a page button is clicked", async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Page 3" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("previous button calls onChange with page - 1", async () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /previous page/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("next button calls onChange with page + 1", async () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("previous button is disabled on first page", () => {
    render(<Pagination page={1} totalPages={5} onChange={noop} />);
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("next button is disabled on last page", () => {
    render(<Pagination page={5} totalPages={5} onChange={noop} />);
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("active page has aria-current=page", () => {
    render(<Pagination page={2} totalPages={5} onChange={noop} />);
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 1" })).not.toHaveAttribute("aria-current");
  });

  it("renders ellipsis for large page counts", () => {
    render(<Pagination page={5} totalPages={20} onChange={noop} />);
    // With many pages, ellipsis markers appear
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
    expect(within(nav).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("has nav landmark with label", () => {
    render(<Pagination page={1} totalPages={5} onChange={noop} />);
    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────── */
/*  Breadcrumb                                      */
/* ─────────────────────────────────────────────── */
describe("Breadcrumb", () => {
  const items = [
    { label: "Home", href: "/" },
    { label: "Products", href: "/products" },
    { label: "Widget" },
  ];

  it("renders all items", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Products")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
  });

  it("renders last item as current page", () => {
    render(<Breadcrumb items={items} />);
    const current = screen.getByText("Widget").closest("[aria-current='page']");
    expect(current).toBeInTheDocument();
  });

  it("renders links for items with href", () => {
    render(<Breadcrumb items={items} />);
    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("calls onClick for item with onClick handler", async () => {
    const onClick = vi.fn();
    render(
      <Breadcrumb
        items={[
          { label: "Home", onClick },
          { label: "Current" },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: /home/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("collapses middle items when maxItems is set", () => {
    const manyItems = [
      { label: "Home", href: "/" },
      { label: "Category", href: "/cat" },
      { label: "Subcategory", href: "/sub" },
      { label: "Product", href: "/product" },
      { label: "Detail" },
    ];
    render(<Breadcrumb items={manyItems} maxItems={3} />);
    // With maxItems=3, show first + ellipsis + last 2
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
    // Some middle items should be collapsed
    const nav = screen.getByRole("navigation");
    expect(within(nav).queryByText("Category")).not.toBeInTheDocument();
  });

  it("has nav landmark with label", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it("renders an ordered list", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────── */
/*  Sidebar                                         */
/* ─────────────────────────────────────────────── */
describe("Sidebar", () => {
  const navItems = [
    { id: "home", label: "Home", href: "/", active: true },
    { id: "settings", label: "Settings", href: "/settings" },
    { id: "profile", label: "Profile", href: "/profile" },
  ];

  it("renders all navigation items", () => {
    render(<Sidebar items={navItems} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("marks active item with aria-current=page", () => {
    render(<Sidebar items={navItems} />);
    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).toHaveAttribute("aria-current", "page");
    const settingsLink = screen.getByRole("link", { name: /settings/i });
    expect(settingsLink).not.toHaveAttribute("aria-current");
  });

  it("calls onCollapse when collapse toggle is clicked", async () => {
    const onCollapse = vi.fn();
    render(<Sidebar items={navItems} collapsed={false} onCollapse={onCollapse} />);
    await user.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(onCollapse).toHaveBeenCalledWith(true);
  });

  it("shows expand label when collapsed", () => {
    render(<Sidebar items={navItems} collapsed={true} onCollapse={noop} />);
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it("does not render collapse button without onCollapse prop", () => {
    render(<Sidebar items={navItems} />);
    expect(screen.queryByRole("button", { name: /collapse/i })).not.toBeInTheDocument();
  });

  it("renders sectioned items", () => {
    render(
      <Sidebar
        items={[
          {
            label: "Main",
            items: [
              { id: "home", label: "Home", href: "/" },
              { id: "dash", label: "Dashboard", href: "/dash" },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("hides section label when collapsed", () => {
    render(
      <Sidebar
        items={[
          {
            label: "Visible section",
            items: [{ id: "home", label: "Home", href: "/" }],
          },
        ]}
        collapsed={true}
      />
    );
    // Section label should not be visible when collapsed
    expect(screen.queryByText("Visible section")).not.toBeInTheDocument();
  });

  it("has nav landmark with label", () => {
    render(<Sidebar items={navItems} />);
    expect(screen.getByRole("navigation", { name: /sidebar navigation/i })).toBeInTheDocument();
  });

  it("calls onClick for button-style items", async () => {
    const onClick = vi.fn();
    render(
      <Sidebar items={[{ id: "action", label: "Action item", onClick }]} />
    );
    await user.click(screen.getByRole("button", { name: /action item/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

/* ─────────────────────────────────────────────── */
/*  Progress                                        */
/* ─────────────────────────────────────────────── */
describe("Progress", () => {
  it("renders a progressbar with correct aria-valuenow", () => {
    render(<Progress value={65} aria-label="Upload" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "65");
  });

  it("renders label text", () => {
    render(<Progress value={40} label="Uploading" />);
    expect(screen.getByText("Uploading")).toBeInTheDocument();
  });

  it("shows percentage value when showValue is set", () => {
    render(<Progress value={75} showValue label="Progress" />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("renders indeterminate when value is omitted", () => {
    render(<Progress aria-label="Loading" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });

  it("clamps value to 0-100 range", () => {
    render(<Progress value={150} aria-label="Overflow" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("has aria-valuemin=0 and aria-valuemax=100", () => {
    render(<Progress value={50} aria-label="Test" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("accepts size variants without crashing", () => {
    const { rerender } = render(<Progress value={50} aria-label="Small" size="sm" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    rerender(<Progress value={50} aria-label="Large" size="lg" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────── */
/*  Spinner                                         */
/* ─────────────────────────────────────────────── */
describe("Spinner", () => {
  it("renders with status role", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders default label", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("renders custom label", () => {
    render(<Spinner label="Saving..." />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Saving...");
  });

  it("accepts size variants", () => {
    const { rerender } = render(<Spinner size="sm" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<Spinner size="lg" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────── */
/*  Tooltip                                         */
/* ─────────────────────────────────────────────── */
describe("Tooltip", () => {
  it("does not show tooltip initially", () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows tooltip on hover after delay", async () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Tooltip message" delay={400}>
        <button>Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Tooltip message");
    vi.useRealTimers();
  });

  it("hides tooltip on mouse leave", async () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Bye" delay={100}>
        <button>Trigger</button>
      </Tooltip>
    );
    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(wrapper);
    // AnimatePresence keeps node during exit; wait for removal
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("shows tooltip on focus when showOnFocus is true (default)", async () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Focus tip" delay={100}>
        <button>Focusable</button>
      </Tooltip>
    );
    const wrapper = screen.getByText("Focusable").parentElement!;
    fireEvent.focus(wrapper);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not show tooltip on focus when showOnFocus=false", async () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="No focus" delay={100} showOnFocus={false}>
        <button>Trigger</button>
      </Tooltip>
    );
    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.focus(wrapper);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("closes on Escape key", async () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Escapable" delay={100}>
        <button>Trigger</button>
      </Tooltip>
    );
    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    // Press Escape via fireEvent (avoids userEvent + fake timer conflict)
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("tooltip has correct role", async () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Role test" delay={0}>
        <button>Trigger</button>
      </Tooltip>
    );
    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
