import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { render, act, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";

import { Dialog } from "../../components/Dialog/Dialog";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Drawer } from "../../components/Drawer/Drawer";
import { CommandPalette } from "../../components/CommandPalette/CommandPalette";
import { Popover } from "../../components/Popover/Popover";
import { DropdownMenu } from "../../components/DropdownMenu/DropdownMenu";
import { ContextMenu } from "../../components/ContextMenu/ContextMenu";
import { Select } from "../../components/Select/Select";
import { Combobox } from "../../components/Combobox/Combobox";
import { NavigationMenu } from "../../components/NavigationMenu/NavigationMenu";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { DisabledTooltip } from "../../components/DisabledTooltip/DisabledTooltip";

/**
 * Overlay focus audit (#7803). One block per overlay type, asserting the
 * WAI-ARIA pattern for it:
 *   - modal (Dialog, ConfirmDialog, Drawer, CommandPalette, Popover): initial
 *     focus on the first meaningful control (not Close), Tab / Shift+Tab wrap
 *     inside, Escape closes.
 *   - non-modal (DropdownMenu, ContextMenu, Select, Combobox, NavigationMenu):
 *     never trap; Tab closes and moves on; arrows / Home / End skip disabled
 *     items; focus returns to the trigger.
 *   - tooltips: focus stays on the trigger; Escape dismisses only the tooltip.
 * Return-to-trigger for useReturnFocus consumers lives in
 * focus-management.accessibility.test.tsx.
 */

const noop = () => {};

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function active(): HTMLElement {
  return document.activeElement as HTMLElement;
}

/** Dispatches a key on the focused element; false means preventDefault was called. */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  return fireEvent.keyDown(active(), { key, ...init });
}

function flush() {
  act(() => {
    vi.runAllTimers();
  });
}

const menuItems = [
  { id: "off", label: "Off", disabled: true, onSelect: noop },
  { id: "one", label: "One", onSelect: noop },
  { type: "divider" as const },
  { id: "two", label: "Two", onSelect: noop },
  { id: "dead", label: "Dead", disabled: true, onSelect: noop },
  { id: "three", label: "Three", onSelect: noop },
  { id: "tail", label: "Tail", disabled: true, onSelect: noop },
];

/* ── Modal overlays ──────────────────────────── */

describe("Modal overlays — initial focus, wrap, Escape", () => {
  it("Dialog focuses the first control, not Close, and wraps Tab / Shift+Tab", () => {
    const onClose = vi.fn();
    const { getByText, getByLabelText } = render(
      <Dialog open onClose={onClose} title="T">
        <button>First</button>
        <button>Last</button>
      </Dialog>
    );
    expect(active()).toBe(getByText("First"));

    getByText("Last").focus();
    expect(press("Tab")).toBe(false);
    expect(active()).toBe(getByLabelText("Close dialog"));

    expect(press("Tab", { shiftKey: true })).toBe(false);
    expect(active()).toBe(getByText("Last"));

    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Dialog skips a hidden last control when wrapping", () => {
    const { getByText, getByLabelText } = render(
      <Dialog open onClose={noop} title="T">
        <button>Real</button>
        <button hidden>Hidden</button>
      </Dialog>
    );
    getByText("Real").focus();
    press("Tab");
    expect(active()).toBe(getByLabelText("Close dialog"));
    press("Tab", { shiftKey: true });
    expect(active()).toBe(getByText("Real"));
  });

  it("ConfirmDialog focuses Cancel when destructive and Confirm otherwise", () => {
    const { getByText, rerender } = render(
      <ConfirmDialog open onConfirm={noop} onCancel={noop} title="Sure?" variant="destructive" />
    );
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(active()).toBe(getByText("Cancel"));

    rerender(<ConfirmDialog open={false} onConfirm={noop} onCancel={noop} title="Sure?" />);
    flush();
    rerender(<ConfirmDialog open onConfirm={noop} onCancel={noop} title="Sure?" />);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(active()).toBe(getByText("Confirm"));
  });

  it("Drawer focuses the first control, not Close, and wraps Tab / Shift+Tab", () => {
    const onClose = vi.fn();
    const { getByText, getByRole } = render(
      <Drawer open onClose={onClose} title="D">
        <button>First</button>
        <button>Last</button>
      </Drawer>
    );
    expect(active()).toBe(getByText("First"));

    getByText("Last").focus();
    press("Tab");
    expect(active()).toBe(getByRole("button", { name: /close/i }));
    press("Tab", { shiftKey: true });
    expect(active()).toBe(getByText("Last"));

    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CommandPalette focuses the search input and keeps Tab on it", () => {
    const onOpenChange = vi.fn();
    const { getByRole } = render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        items={[{ id: "a", label: "Action A", onSelect: noop }]}
      />
    );
    flush();
    const input = getByRole("combobox");
    expect(active()).toBe(input);

    expect(press("Tab")).toBe(false);
    expect(active()).toBe(input);
    expect(press("Tab", { shiftKey: true })).toBe(false);
    expect(active()).toBe(input);

    press("Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Popover with a title focuses the first body control, not Close, and wraps", () => {
    const { getByText, getByRole } = render(
      <Popover trigger={<button>Open</button>} title="Filter">
        <button>First</button>
        <button>Last</button>
      </Popover>
    );
    fireEvent.click(getByText("Open"));
    expect(active()).toBe(getByText("First"));

    getByText("Last").focus();
    press("Tab");
    expect(active()).toBe(getByRole("button", { name: /close/i }));
    press("Tab", { shiftKey: true });
    expect(active()).toBe(getByText("Last"));
  });
});

/* ── Menus ───────────────────────────────────── */

describe("DropdownMenu — non-modal menu", () => {
  function setup() {
    const utils = render(
      <>
        <button>Before</button>
        <DropdownMenu trigger={<button>Actions</button>} items={menuItems} />
        <button>After</button>
      </>
    );
    const trigger = utils.getByText("Actions");
    trigger.focus();
    fireEvent.click(trigger);
    return { ...utils, trigger };
  }

  it("focuses the first enabled item and skips disabled items with arrows, Home and End", () => {
    setup();
    expect(active().textContent).toBe("One");
    press("ArrowDown");
    expect(active().textContent).toBe("Two");
    press("ArrowDown");
    expect(active().textContent).toBe("Three");
    press("ArrowDown");
    expect(active().textContent).toBe("One");
    press("ArrowUp");
    expect(active().textContent).toBe("Three");
    press("Home");
    expect(active().textContent).toBe("One");
    press("End");
    expect(active().textContent).toBe("Three");
  });

  it("Tab closes the menu without trapping and does not pull focus back to the trigger", () => {
    const { trigger, getByText } = setup();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    expect(press("Tab")).toBe(true);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    // The browser's default Tab action moves focus on; the return-focus restore must not undo it.
    getByText("After").focus();
    flush();
    expect(active()).toBe(getByText("After"));
  });

  it("Shift+Tab also closes the menu", () => {
    const { trigger } = setup();
    expect(press("Tab", { shiftKey: true })).toBe(true);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("ContextMenu — non-modal menu", () => {
  function setup() {
    const utils = render(
      <>
        <ContextMenu items={menuItems}>
          <button>Target</button>
        </ContextMenu>
        <button>After</button>
      </>
    );
    const target = utils.getByText("Target");
    target.focus();
    fireEvent.contextMenu(target);
    return { ...utils, target };
  }

  it("focuses the first enabled item and skips disabled items with arrows, Home and End", () => {
    setup();
    expect(active().textContent).toBe("One");
    press("ArrowDown");
    expect(active().textContent).toBe("Two");
    press("ArrowDown");
    expect(active().textContent).toBe("Three");
    press("Home");
    expect(active().textContent).toBe("One");
    press("End");
    expect(active().textContent).toBe("Three");
  });

  it("Tab closes the menu without trapping and does not pull focus back", async () => {
    const { getByText, queryByRole } = setup();
    expect(press("Tab")).toBe(true);

    getByText("After").focus();
    flush();
    expect(active()).toBe(getByText("After"));

    vi.useRealTimers();
    await waitFor(() => expect(queryByRole("menu")).toBeNull());
  });
});

describe("Select — non-modal listbox", () => {
  const options = [
    { value: "a", label: "Apple", disabled: true },
    { value: "b", label: "Banana" },
    { value: "c", label: "Cherry", disabled: true },
    { value: "d", label: "Date" },
  ];

  function setup() {
    const utils = render(
      <>
        <Select label="Fruit" options={options} value="b" onChange={noop} />
        <button>After</button>
      </>
    );
    const trigger = utils.getByRole("combobox");
    trigger.focus();
    return { ...utils, trigger };
  }

  it("keeps DOM focus on the trigger, opens on the selected option and skips disabled ones", () => {
    const { trigger } = setup();
    press("ArrowDown");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(active()).toBe(trigger);
    expect(trigger.getAttribute("aria-activedescendant")).toMatch(/option-1$/);

    press("ArrowDown");
    expect(trigger.getAttribute("aria-activedescendant")).toMatch(/option-3$/);
    press("Home");
    expect(trigger.getAttribute("aria-activedescendant")).toMatch(/option-1$/);
    press("End");
    expect(trigger.getAttribute("aria-activedescendant")).toMatch(/option-3$/);
  });

  it("Tab closes the listbox and is not trapped", () => {
    const { trigger } = setup();
    press("ArrowDown");
    expect(press("Tab")).toBe(true);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("Select returns focus to trigger on close", () => {
    const { trigger } = setup();
    press("ArrowDown");
    press("Escape");
    flush();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(active()).toBe(trigger);
  });
});

describe("Combobox — non-modal listbox", () => {
  it("Tab closes the listbox and is not trapped", () => {
    const { getByRole } = render(
      <Combobox
        label="Fruit"
        options={[
          { value: "a", label: "Apple" },
          { value: "b", label: "Banana" },
        ]}
        onChange={noop}
      />
    );
    const input = getByRole("combobox");
    act(() => {
      input.focus();
    });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(press("Tab")).toBe(true);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});

describe("NavigationMenu — non-modal disclosure menu", () => {
  function setup() {
    const utils = render(
      <NavigationMenu
        items={[
          {
            label: "Docs",
            children: [
              { label: "Start", href: "/start" },
              { label: "Guide", href: "/guide" },
            ],
          },
        ]}
      />
    );
    const trigger = utils.getByRole("button", { name: "Docs" });
    trigger.focus();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    return { ...utils, trigger };
  }

  it("moves between items with arrows, Home and End", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    press("ArrowDown");
    expect(active().textContent).toBe("Start");
    press("ArrowDown");
    expect(active().textContent).toBe("Guide");
    press("Home");
    expect(active().textContent).toBe("Start");
    press("End");
    expect(active().textContent).toBe("Guide");
  });

  it("Escape from an item closes the menu and returns focus to the trigger", () => {
    const { trigger } = setup();
    press("ArrowDown");
    expect(active().textContent).toBe("Start");

    press("Escape");
    flush();

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(active()).toBe(trigger);
  });
});

/* ── Tooltips ────────────────────────────────── */

describe("Tooltip / DisabledTooltip — focus stays on the trigger", () => {
  it("Escape dismisses only the tooltip, not the Dialog beneath it", () => {
    const onClose = vi.fn();
    const { getByText, queryByRole } = render(
      <Dialog open onClose={onClose} title="T">
        <Tooltip content="Hint" delay={0}>
          <button>Has tip</button>
        </Tooltip>
      </Dialog>
    );
    const trigger = getByText("Has tip");
    trigger.focus();
    act(() => {
      vi.runAllTimers();
    });
    expect(queryByRole("tooltip")).toBeInTheDocument();
    expect(active()).toBe(trigger);

    press("Escape");
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger).not.toHaveAttribute("aria-describedby");
    expect(active()).toBe(trigger);

    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("DisabledTooltip never moves focus off its trigger and Escape dismisses it", () => {
    const { getByText, queryByRole } = render(
      <DisabledTooltip disabled disabledReason="Not allowed">
        <button aria-disabled="true">Locked</button>
      </DisabledTooltip>
    );
    const trigger = getByText("Locked");
    trigger.focus();
    fireEvent.mouseEnter(trigger.parentElement!);
    act(() => {
      vi.runAllTimers();
    });
    expect(queryByRole("tooltip")).toBeInTheDocument();
    expect(active()).toBe(trigger);

    press("Escape");
    expect(trigger).not.toHaveAttribute("aria-describedby");
    expect(active()).toBe(trigger);
  });
});

/* ── Nesting ─────────────────────────────────── */

describe("Nested overlays inside a Dialog — trap hands off and returns cleanly", () => {
  function PopoverInDialog({ onClose }: { onClose: () => void }) {
    return (
      <Dialog open onClose={onClose} title="T">
        <Popover trigger={<button>Pop</button>} title="Inner">
          <button>Inner first</button>
          <button>Inner last</button>
        </Popover>
        <button>Dialog last</button>
      </Dialog>
    );
  }

  it("Popover traps Tab on its own panel, then Escape closes only it and returns focus", () => {
    const onClose = vi.fn();
    const { getByText, getByRole, getByLabelText } = render(<PopoverInDialog onClose={onClose} />);
    const trigger = getByText("Pop");
    trigger.focus();
    fireEvent.click(trigger);
    expect(active()).toBe(getByText("Inner first"));

    // Topmost trap wins: wrapping stays inside the popover, not the dialog.
    getByText("Inner last").focus();
    press("Tab");
    expect(active()).toBe(getByLabelText("Close"));
    expect(getByRole("dialog", { name: "Inner" }).contains(active())).toBe(true);

    press("Escape");
    flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(active()).toBe(trigger);

    // The dialog trap is topmost again.
    getByText("Dialog last").focus();
    press("Tab");
    expect(getByRole("dialog", { name: "T" }).contains(active())).toBe(true);
    expect(active()).not.toBe(getByText("Dialog last"));

    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  function MenuInDialog({ onClose }: { onClose: () => void }) {
    return (
      <Dialog open onClose={onClose} title="T">
        <DropdownMenu
          trigger={<button>Actions</button>}
          items={[
            { id: "a", label: "Alpha", onSelect: noop },
            { id: "b", label: "Beta", onSelect: noop },
          ]}
        />
      </Dialog>
    );
  }

  it("DropdownMenu: Escape closes only the menu and returns focus to its trigger", () => {
    const onClose = vi.fn();
    const { getByText } = render(<MenuInDialog onClose={onClose} />);
    const trigger = getByText("Actions");
    trigger.focus();
    fireEvent.click(trigger);
    expect(active().textContent).toBe("Alpha");

    press("Escape");
    flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(active()).toBe(trigger);
  });

  it("DropdownMenu: Tab out of the menu keeps focus inside the Dialog trap", () => {
    const onClose = vi.fn();
    const { getByText, getByRole } = render(<MenuInDialog onClose={onClose} />);
    const trigger = getByText("Actions");
    trigger.focus();
    fireEvent.click(trigger);

    press("Tab");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(getByRole("dialog").contains(active())).toBe(true);
    flush();
    expect(getByRole("dialog").contains(active())).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Select: Escape closes only the listbox", () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <Dialog open onClose={onClose} title="T">
        <Select
          label="Fruit"
          options={[
            { value: "a", label: "Apple" },
            { value: "b", label: "Banana" },
          ]}
          onChange={noop}
        />
      </Dialog>
    );
    const trigger = getByRole("combobox");
    trigger.focus();
    press("ArrowDown");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    press("Escape");
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(active()).toBe(trigger);
  });
});

/* ── Controlled-state sanity (guards the harness itself) ── */

describe("harness", () => {
  it("renders stateful wrappers without leaking focus between tests", () => {
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="T">
            <button>Inside</button>
          </Dialog>
        </>
      );
    }
    const { getByText } = render(<Wrapper />);
    const opener = getByText("Open");
    opener.focus();
    fireEvent.click(opener);
    expect(active()).toBe(getByText("Inside"));
    press("Escape");
    flush();
    expect(active()).toBe(opener);
  });
});
