import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { render, act, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* ── Components ─────────────────────────────── */
import { Dialog } from "../../components/Dialog/Dialog";
import { Drawer } from "../../components/Drawer/Drawer";
import { CommandPalette } from "../../components/CommandPalette/CommandPalette";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Popover } from "../../components/Popover/Popover";
import { DropdownMenu } from "../../components/DropdownMenu/DropdownMenu";
import { ContextMenu } from "../../components/ContextMenu/ContextMenu";
import { Combobox } from "../../components/Combobox/Combobox";
import { Autocomplete } from "../../components/Autocomplete/Autocomplete";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { HoverCard } from "../../components/HoverCard/HoverCard";

const noop = () => {};

// jsdom does not implement scrollIntoView — Combobox/Autocomplete call it
// whenever the keyboard-focused option changes.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("Focus management — return-to-trigger on close", () => {
  /**
   * Flush all pending timers (including requestAnimationFrame, which jsdom
   * backs with setTimeout) so focus-return rAF callbacks run synchronously.
   */
  function flushRaf() {
    vi.runAllTimers();
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Dialog returns focus to trigger on close", () => {
    const onClose = vi.fn();
    const { getByText, rerender } = render(
      <>
        <button>Trigger</button>
        <Dialog open={false} onClose={onClose} title="Test">
          Content
        </Dialog>
      </>
    );

    const trigger = getByText("Trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open dialog — focus-return effect captures trigger; focus-trap moves focus inside
    act(() => {
      rerender(
        <>
          <button>Trigger</button>
          <Dialog open={true} onClose={onClose} title="Test">
            Content
          </Dialog>
        </>
      );
    });

    // Close dialog — focus-return effect schedules rAF to restore focus
    act(() => {
      rerender(
        <>
          <button>Trigger</button>
          <Dialog open={false} onClose={onClose} title="Test">
            Content
          </Dialog>
        </>
      );
    });

    // Flush rAF (backed by fake setTimeout in jsdom)
    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("Drawer returns focus to trigger on close", () => {
    const onClose = vi.fn();
    const { getByText, rerender } = render(
      <>
        <button>Open Drawer</button>
        <Drawer open={false} onClose={onClose} title="Test Drawer">
          <p>Drawer content</p>
        </Drawer>
      </>
    );

    const trigger = getByText("Open Drawer");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open drawer — focus-return effect captures trigger; focus-trap moves focus inside
    act(() => {
      rerender(
        <>
          <button>Open Drawer</button>
          <Drawer open={true} onClose={onClose} title="Test Drawer">
            <p>Drawer content</p>
          </Drawer>
        </>
      );
    });

    // Close drawer — focus-return effect schedules rAF to restore focus
    act(() => {
      rerender(
        <>
          <button>Open Drawer</button>
          <Drawer open={false} onClose={onClose} title="Test Drawer">
            <p>Drawer content</p>
          </Drawer>
        </>
      );
    });

    // Flush rAF
    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("CommandPalette returns focus to trigger on close", () => {
    const onOpenChange = vi.fn();
    const { getByText, rerender } = render(
      <>
        <button>Open Palette</button>
        <CommandPalette
          open={false}
          onOpenChange={onOpenChange}
          items={[{ id: "a", label: "Action A", onSelect: noop }]}
        />
      </>
    );

    const trigger = getByText("Open Palette");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open palette — focus-return effect captures trigger; input focus rAF fires
    act(() => {
      rerender(
        <>
          <button>Open Palette</button>
          <CommandPalette
            open={true}
            onOpenChange={onOpenChange}
            items={[{ id: "a", label: "Action A", onSelect: noop }]}
          />
        </>
      );
      // Flush rAF that focuses the input on open
      vi.runAllTimers();
    });

    // Close palette — focus-return effect schedules rAF to restore focus
    act(() => {
      rerender(
        <>
          <button>Open Palette</button>
          <CommandPalette
            open={false}
            onOpenChange={onOpenChange}
            items={[{ id: "a", label: "Action A", onSelect: noop }]}
          />
        </>
      );
    });

    // Flush rAF
    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("ConfirmDialog returns focus to trigger on close", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText, rerender } = render(
      <>
        <button>Trigger</button>
        <ConfirmDialog
          open={false}
          onConfirm={onConfirm}
          onCancel={onCancel}
          title="Delete item?"
        />
      </>
    );

    const trigger = getByText("Trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open — inherits Dialog's focus-return effect and focus trap
    act(() => {
      rerender(
        <>
          <button>Trigger</button>
          <ConfirmDialog
            open={true}
            onConfirm={onConfirm}
            onCancel={onCancel}
            title="Delete item?"
          />
        </>
      );
    });

    // Close — focus-return effect schedules rAF to restore focus
    act(() => {
      rerender(
        <>
          <button>Trigger</button>
          <ConfirmDialog
            open={false}
            onConfirm={onConfirm}
            onCancel={onCancel}
            title="Delete item?"
          />
        </>
      );
    });

    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("Popover returns focus to trigger on close", () => {
    const { getByText } = render(
      <Popover trigger={<button>Open Popover</button>}>
        <button type="button">Action</button>
      </Popover>
    );

    const trigger = getByText("Open Popover");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open — focus-trap effect moves focus onto the first focusable panel element
    fireEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);

    // Close via Escape — focus-return effect schedules rAF to restore focus
    fireEvent.keyDown(document, { key: "Escape" });

    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("DropdownMenu returns focus to trigger on close", () => {
    const { getByText } = render(
      <DropdownMenu
        trigger={<button>Actions</button>}
        items={[{ id: "edit", label: "Edit", onSelect: noop }]}
      />
    );

    const trigger = getByText("Actions");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open — the first menu item is focused
    fireEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);

    // Close via Escape — focus-return effect schedules rAF to restore focus
    fireEvent.keyDown(document, { key: "Escape" });

    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("ContextMenu returns focus to trigger on close", () => {
    const { getByText } = render(
      <ContextMenu items={[{ id: "copy", label: "Copy", onSelect: noop }]}>
        <button>Target</button>
      </ContextMenu>
    );

    const trigger = getByText("Target");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open (keyboard-invoked context menu: trigger is already focused) — the
    // first menu item is focused
    fireEvent.contextMenu(trigger);
    expect(document.activeElement).not.toBe(trigger);

    // Close via Escape — focus-return effect schedules rAF to restore focus
    fireEvent.keyDown(document, { key: "Escape" });

    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });
});

describe("Focus management — combobox-style widgets keep focus on the input", () => {
  /**
   * Combobox and Autocomplete never move DOM focus off their own `<input>` —
   * the open listbox is tracked with `aria-activedescendant` instead (the
   * ARIA APG combobox pattern). There is no separate trigger element for
   * focus to "return" to, so the contract these widgets owe is different
   * from Dialog/Drawer/Popover/etc: focus must stay put across the whole
   * open → navigate → select/close lifecycle.
   */
  const options = [
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
  ];

  it("Combobox keeps focus on the input across open, select, and Escape-close", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<Combobox label="Fruit" options={options} onChange={onChange} />);
    const input = getByRole("combobox");

    // Combobox opens itself on focus — flush that update before the next
    // synchronous keyDown, or handleKeyDown reads a stale `open`/pre-open
    // `focusedIndex` and Enter never resolves to an option.
    act(() => {
      input.focus();
    });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("apple");
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).toBe(input);
  });

  it("Autocomplete keeps focus on the input across open, select, and Escape-close", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<Autocomplete options={options} onSelect={onSelect} />);
    const input = getByRole("combobox");

    act(() => {
      input.focus();
    });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(options[0]);
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).toBe(input);
  });
});

describe("Focus management — hover/focus-only surfaces never move focus off the trigger", () => {
  /**
   * Tooltip and HoverCard open on hover/focus of their trigger and never
   * take focus themselves (`role="tooltip"` content must never be focusable,
   * and HoverCard's rich content is reachable by its own Tab order, not by
   * the card taking focus on open). Return-to-trigger doesn't apply — focus
   * never leaves the trigger in the first place, so the contract to verify
   * is that opening the panel is a no-op for focus.
   */
  it("Tooltip does not move focus when it opens on trigger focus", async () => {
    const { getByText, getByRole } = render(
      <Tooltip content="Copy to clipboard" delay={0}>
        <button>Copy</button>
      </Tooltip>
    );
    const trigger = getByText("Copy");

    // fireEvent.focus() only dispatches the synthetic event — it never moves
    // jsdom's real document.activeElement. A genuine .focus() call does both
    // and is safe here unwrapped: no synchronous state update depends on it
    // before the awaited waitFor gives React a chance to flush.
    trigger.focus();
    await waitFor(() => expect(getByRole("tooltip")).toBeInTheDocument());

    expect(document.activeElement).toBe(trigger);
  });

  it("HoverCard does not move focus when it opens on trigger hover", async () => {
    const { getByText } = render(
      <HoverCard content={<p>Preview content</p>} openDelay={0}>
        <a href="https://example.com">Hover me</a>
      </HoverCard>
    );
    const trigger = getByText("Hover me");
    const wrapper = trigger.closest("[class]") as HTMLElement;

    trigger.focus();
    fireEvent.mouseEnter(wrapper);
    await waitFor(() => expect(getByText("Preview content")).toBeInTheDocument());

    expect(document.activeElement).toBe(trigger);
  });
});

describe("Focus management — return-focus coverage guard", () => {
  /**
   * Derived mechanically from source (which components call `useReturnFocus`
   * directly), not a hand-maintained list — so a future overlay that adopts
   * the hook without a matching test fails loudly here instead of silently
   * shipping the same coverage gap this file was extended to close (#5618).
   * Components that inherit the contract by wrapping another tested overlay
   * (e.g. ConfirmDialog wraps Dialog) or that deliberately never move focus
   * off a trigger (Combobox/Autocomplete/Tooltip/HoverCard, tested above
   * under a different assertion) aren't `useReturnFocus` callers and so
   * aren't expected to show up here — this guard only covers the mechanical
   * case of the hook itself.
   */
  it("every component calling useReturnFocus has a matching return-to-trigger test", () => {
    const componentsDir = join(dirname(fileURLToPath(import.meta.url)), "../../components");
    const consumers = readdirSync(componentsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => {
        try {
          const source = readFileSync(join(componentsDir, name, `${name}.tsx`), "utf-8");
          return source.includes("useReturnFocus(");
        } catch {
          return false;
        }
      });

    const testSource = readFileSync(fileURLToPath(import.meta.url), "utf-8");
    const missing = consumers.filter(
      (name) => !testSource.includes(`${name} returns focus to trigger on close`)
    );

    expect(
      missing,
      `Components calling useReturnFocus with no matching test in this file: ${missing.join(", ")}`
    ).toHaveLength(0);
  });
});
