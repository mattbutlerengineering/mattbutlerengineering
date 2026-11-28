import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";

type Row = { name: string };

const columns = [{ key: "name", header: "Name" }];
const data: Row[] = [{ name: "Ada" }];

describe("DataTable horizontal scroll region", () => {
  let notifyResize: () => void = () => {};

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notifyResize = () => callback([], this as unknown as ResizeObserver);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const setWidths = (el: HTMLElement, scrollWidth: number, clientWidth: number) => {
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: scrollWidth });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: clientWidth });
  };

  const renderTable = (label?: string) => {
    const view = render(
      <DataTable columns={columns} data={data} rowKey={(r) => r.name} label={label} />
    );
    return view.container.firstElementChild as HTMLElement;
  };

  it("is not a tab stop while the table fits", () => {
    const wrapper = renderTable("Invoice lines");
    setWidths(wrapper, 300, 300);
    act(() => notifyResize());
    expect(wrapper).not.toHaveAttribute("tabindex");
    expect(wrapper).not.toHaveAttribute("role");
  });

  it("becomes a focusable group named after the table label once it overflows", () => {
    const wrapper = renderTable("Invoice lines");
    setWidths(wrapper, 520, 280);
    act(() => notifyResize());
    expect(wrapper).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("group", { name: "Invoice lines" })).toBe(wrapper);
  });

  it("falls back to the localized scrollable-content name without a label", () => {
    const wrapper = renderTable();
    setWidths(wrapper, 520, 280);
    act(() => notifyResize());
    expect(screen.getByRole("group", { name: "Scrollable content" })).toBe(wrapper);
  });
});
