import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

/* ── Components ─────────────────────────────── */
import { Dialog } from "../../components/Dialog/Dialog";
import { Drawer } from "../../components/Drawer/Drawer";
import { CommandPalette } from "../../components/CommandPalette/CommandPalette";

const noop = () => {};

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
});
