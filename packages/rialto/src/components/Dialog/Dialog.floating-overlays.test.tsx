import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";
import { Combobox } from "../Combobox/Combobox";
import { Autocomplete } from "../Autocomplete/Autocomplete";
import { DropdownMenu } from "../DropdownMenu/DropdownMenu";
import { Popover } from "../Popover/Popover";

/**
 * jsdom has no layout, so this only proves the wiring: where the panel mounts
 * and which coordinates it is given. That nothing is clipped is checked in
 * Chromium by `Dialog.overlays.stories.tsx`.
 */

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const options = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
];

function inDialog(children: React.ReactNode) {
  return render(
    <Dialog open onClose={() => {}} title="Host">
      {children}
    </Dialog>
  );
}

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("floating controls hosted in a Dialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lifts a Combobox listbox out of the dialog body", async () => {
    inDialog(<Combobox label="Fruit" options={options} />);
    await userEvent.click(screen.getByRole("combobox"));
    const list = screen.getByRole("listbox");
    expect(screen.getByRole("dialog").contains(list)).toBe(false);
    expect(list.className).toMatch(/floating/);
  });

  it("watches the control, not just the list, so a control that grows moves the list", async () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
      }
    );
    inDialog(<Combobox label="Fruit" options={options} />);
    await userEvent.click(screen.getByRole("combobox"));
    const control = screen.getByRole("combobox").parentElement;
    expect(observed).toContain(control);
    vi.unstubAllGlobals();
  });

  it("lifts an Autocomplete listbox out of the dialog body", async () => {
    inDialog(<Autocomplete label="Fruit" options={options} />);
    await userEvent.type(screen.getByRole("combobox"), "a");
    expect(screen.getByRole("dialog").contains(screen.getByRole("listbox"))).toBe(false);
  });

  it("lifts a DropdownMenu out of the dialog body and keeps picks working", async () => {
    const onSelect = vi.fn();
    inDialog(
      <DropdownMenu
        trigger={<button type="button">Actions</button>}
        items={[{ id: "x", label: "Edit", onSelect }]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    const menu = screen.getByRole("menu");
    expect(screen.getByRole("dialog").contains(menu)).toBe(false);
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps a Combobox pick inside the dialog layer from dismissing the list early", async () => {
    const onChange = vi.fn();
    inDialog(<Combobox label="Fruit" options={options} onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Banana" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("clamps a Popover bottom placement that would start left of the viewport", async () => {
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: 375,
      configurable: true,
    });
    inDialog(<Popover trigger={<button type="button">Open</button>}>Hello</Popover>);
    const wrapper = screen.getByRole("button", { name: "Open" }).closest("[role=presentation]")!
      .parentElement as HTMLElement;
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(rectOf(0, 100, 40, 32));
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const panel = screen
      .getAllByRole("dialog")
      .find((d) => d.getAttribute("aria-label") === "Popover")!;
    expect(parseFloat(panel.style.left)).toBeGreaterThanOrEqual(8);
  });
});
