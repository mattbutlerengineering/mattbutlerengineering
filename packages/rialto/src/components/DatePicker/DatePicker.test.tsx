/**
 * Unit tests for the DatePicker: trigger display, open-on-click, and focus
 * return to the trigger on select and Escape.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "./DatePicker";

const user = userEvent.setup();

function renderPicker(overrides: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DatePicker label="Date" value="2024-06-10" onChange={onChange} locale="en-US" {...overrides} />
  );
  return { onChange, trigger: screen.getByLabelText("Date"), ...utils };
}

function cell(container: HTMLElement, iso: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-date="${iso}"]`);
  if (!el) throw new Error(`No day cell for ${iso}`);
  return el;
}

describe("DatePicker", () => {
  it("formats the selected value on the read-only trigger", () => {
    const { trigger } = renderPicker();
    expect(trigger).toHaveAttribute("readonly");
    expect((trigger as HTMLInputElement).value).toContain("2024");
    expect((trigger as HTMLInputElement).value).toContain("Jun");
  });

  it("shows an empty trigger when value is null", () => {
    const { trigger } = renderPicker({ value: null });
    expect((trigger as HTMLInputElement).value).toBe("");
  });

  it("opens the calendar popover on trigger click", async () => {
    const { trigger } = renderPicker();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("selecting a day fires onChange, closes the popover, and returns focus to the trigger", async () => {
    const { trigger, onChange, container } = renderPicker();
    await user.click(trigger);
    await user.click(cell(container, "2024-06-20"));

    expect(onChange).toHaveBeenCalledWith("2024-06-20");
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
    // Closing is async (exit animation + rAF focus restore).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Date")));
  });

  it("Escape closes the popover and returns focus to the trigger", async () => {
    const { trigger, container } = renderPicker();
    await user.click(trigger);
    act(() => cell(container, "2024-06-10").focus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Date")));
  });

  it("wires aria-expanded, aria-haspopup, and aria-controls on the trigger, toggling on open", async () => {
    const { trigger } = renderPicker();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    const controlsId = trigger.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toHaveAttribute("id", controlsId as string);
  });

  it("paints an opaque surface so the page does not show through the calendar", async () => {
    const { trigger } = renderPicker();
    await user.click(trigger);
    // `solid` adds the popover's opaque elevated surface (class `floating`).
    expect(screen.getByRole("dialog").className.split(/\s+/)).toContain("floating");
  });
});

/**
 * Measured on the component page at 375×812: the field ends at y=526 and the
 * month grid wants 332px, leaving 278px below — shorter than the grid, taller
 * than a usable month. The panel must stay under the field instead of flipping
 * over the page title.
 */
describe("DatePicker placement at a phone viewport", () => {
  const rect = (top: number, height: number, left = 48, width = 220): DOMRect =>
    ({
      top,
      left,
      width,
      height,
      bottom: top + height,
      right: left + width,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;

  function mockPhoneGeometry(anchorTop: number, anchorHeight: number) {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(375);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(812);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(280);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.dataset.scrollport === "true") return rect(113, 699);
      // The anchor moves with the scroller the way it does in a browser.
      const scroller = document.querySelector<HTMLElement>("[data-scrollport]");
      return rect(anchorTop - (scroller?.scrollTop ?? 0), anchorHeight);
    });
    // jsdom never scrolls; keep a per-element offset so the fit can move the anchor.
    const offsets = new WeakMap<Element, number>();
    vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function (this: Element) {
      return offsets.get(this) ?? 0;
    });
    vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (
      this: Element,
      value: number
    ) {
      offsets.set(this, value);
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.dataset.scrollport === "true") return 3000;
      if (this.getAttribute("role") !== "dialog") return 0;
      const sheet = this.querySelector<HTMLElement>("[data-calendar-sheet]");
      const capped = sheet?.style.maxHeight ? Number.parseFloat(sheet.style.maxHeight) : NaN;
      // 34px of popover chrome around the sheet, matching a 332px open panel.
      return Number.isFinite(capped) ? 34 + capped : 332;
    });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.dataset.scrollport === "true") return 699;
      // 2px panel border: offsetHeight 332, clientHeight 330.
      if (this.getAttribute("role") === "dialog") return 330;
      return 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.getAttribute("role") === "dialog") return 332;
      if (!this.hasAttribute("data-calendar-sheet")) return 40;
      const capped = this.style.maxHeight ? Number.parseFloat(this.style.maxHeight) : NaN;
      return Number.isFinite(capped) ? capped : 298;
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays below the field and scrolls the month inside the panel when the grid is only slightly too tall", async () => {
    // Anchor y=460–526. Room below is 812 - 526 - 8 = 278. Grid wants 332.
    // 278px is enough to use, so the page itself must not scroll.
    mockPhoneGeometry(460, 66);
    const { container } = render(
      <div data-scrollport="true" style={{ overflowY: "auto", height: 699 }}>
        <DatePicker label="Date" value="2024-06-10" onChange={vi.fn()} locale="en-US" />
      </div>
    );
    await user.click(screen.getByLabelText("Date"));

    const dialog = screen.getByRole("dialog");
    const sheet = dialog.querySelector<HTMLElement>("[data-calendar-sheet]");
    // Room 278 minus the 2px border and 34px of chrome.
    expect(sheet?.style.maxHeight).toBe("242px");
    expect(sheet?.style.overflowY).toBe("auto");
    expect(dialog.style.top).toBe("534px");
    expect(dialog.style.bottom).toBe("auto");
    expect(container.querySelector<HTMLElement>("[data-scrollport]")?.scrollTop ?? 0).toBe(0);
  });

  it("does not force a short panel below the field when there is no usable room", async () => {
    // Anchor pinned near the bottom: room below is 812 - 760 - 8 = 44.
    mockPhoneGeometry(700, 60);
    renderPicker();
    await user.click(screen.getByLabelText("Date"));

    const dialog = screen.getByRole("dialog");
    const sheet = dialog.querySelector<HTMLElement>("[data-calendar-sheet]");
    expect(sheet?.style.maxHeight ?? "").toBe("");
    expect(dialog.style.top).toBe("auto");
  });

  it("scrolls the page to open the month under a field that is too low", async () => {
    // Anchor y=600–666: room below is 138, so the scroller moves the field up.
    mockPhoneGeometry(600, 66);
    render(
      <div data-scrollport="true" style={{ overflowY: "auto", height: 699 }}>
        <DatePicker label="Date" value="2024-06-10" onChange={vi.fn()} locale="en-US" />
      </div>
    );
    await user.click(screen.getByLabelText("Date"));
    const scroller = document.querySelector<HTMLElement>("[data-scrollport]");
    expect(scroller?.scrollTop).toBeGreaterThan(0);
  });

  it("does not scroll the page behind a fixed modal layer", async () => {
    mockPhoneGeometry(600, 66);
    render(
      <div data-scrollport="true" style={{ overflowY: "auto", height: 699 }}>
        <div style={{ position: "fixed" }}>
          <DatePicker label="Date" value="2024-06-10" onChange={vi.fn()} locale="en-US" />
        </div>
      </div>
    );
    await user.click(screen.getByLabelText("Date"));
    const scroller = document.querySelector<HTMLElement>("[data-scrollport]");
    expect(scroller?.scrollTop).toBe(0);
  });

  it("leaves no scroll area on a sheet whose month fits after the page scroll", async () => {
    // Anchor y=500–566: room 238 is just under the 240 floor, so the page
    // scrolls 96px and the 332px panel (330 + 2px border) then fits exactly.
    mockPhoneGeometry(500, 66);
    render(
      <div data-scrollport="true" style={{ overflowY: "auto", height: 699 }}>
        <DatePicker label="Date" value="2024-06-10" onChange={vi.fn()} locale="en-US" />
      </div>
    );
    await user.click(screen.getByLabelText("Date"));
    const sheet = screen.getByRole("dialog").querySelector<HTMLElement>("[data-calendar-sheet]");
    expect(document.querySelector<HTMLElement>("[data-scrollport]")?.scrollTop).toBeGreaterThan(0);
    expect(sheet?.style.maxHeight ?? "").toBe("");
    expect(sheet?.style.overflowY ?? "").toBe("");
  });

  it("does not cap a top-placed calendar to the room below the field", async () => {
    // Anchor y=460–526: 278px below, 452px above. The full month fits above.
    mockPhoneGeometry(460, 66);
    renderPicker({ placement: "top" });
    await user.click(screen.getByLabelText("Date"));

    const sheet = screen.getByRole("dialog").querySelector<HTMLElement>("[data-calendar-sheet]");
    expect(sheet?.style.maxHeight ?? "").toBe("");
    expect(sheet?.style.overflowY ?? "").toBe("");
  });

  it("does not scroll the page for a top-placed calendar", async () => {
    mockPhoneGeometry(600, 66);
    render(
      <div data-scrollport="true" style={{ overflowY: "auto", height: 699 }}>
        <DatePicker
          label="Date"
          value="2024-06-10"
          onChange={vi.fn()}
          locale="en-US"
          placement="top"
        />
      </div>
    );
    await user.click(screen.getByLabelText("Date"));
    expect(document.querySelector<HTMLElement>("[data-scrollport]")?.scrollTop).toBe(0);
  });
});
