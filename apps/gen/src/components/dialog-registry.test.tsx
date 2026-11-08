import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentRegistry, Spec } from "@json-render/react";
import { stampNodeKeys } from "./selectable-registry.js";
import { DialogControlProvider, createInteractiveRegistry } from "./dialog-registry.js";

const base: ComponentRegistry = {
  Dialog: ({ element, emit }) =>
    element.props?.open === true ? (
      <div role="dialog">
        <button type="button" onClick={() => emit("close")}>
          Close dialog
        </button>
      </div>
    ) : null,
  Drawer: ({ element, emit }) =>
    element.props?.open === true ? (
      <aside aria-label="drawer">
        <button type="button" onClick={() => emit("close")}>
          Close drawer
        </button>
      </aside>
    ) : null,
  Button: ({ element, emit }) => (
    <button type="button" onClick={() => emit("press")}>
      {typeof element.props?.label === "string" ? element.props.label : "Button"}
    </button>
  ),
};

const spec: Spec = stampNodeKeys({
  root: "page",
  elements: {
    page: { type: "Stack", props: {}, children: ["open", "dlg"] },
    open: { type: "Button", props: { label: "Open dialog" }, children: [] },
    dlg: { type: "Dialog", props: { open: true, title: "Outer" }, children: [] },
  },
});

function Harness({ current = spec }: { current?: Spec }) {
  const registry = createInteractiveRegistry(base);
  const Dialog = registry.Dialog!;
  const Button = registry.Button!;
  const page = current.elements.page!;
  const open = current.elements.open!;
  const dlg = current.elements.dlg!;
  return (
    <DialogControlProvider spec={current}>
      <Button
        element={open}
        emit={() => {}}
        on={() => ({ emit: () => {}, shouldPreventDefault: false, bound: false })}
      />
      <Dialog
        element={dlg}
        emit={() => {}}
        on={() => ({ emit: () => {}, shouldPreventDefault: false, bound: false })}
      />
      <span data-testid="page-type">{page.type}</span>
    </DialogControlProvider>
  );
}

describe("interactive dialog registry", () => {
  it("starts a triggered dialog closed, opens it from the button, and dismisses it", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens and dismisses a Drawer the same way", () => {
    const drawerSpec: Spec = stampNodeKeys({
      root: "page",
      elements: {
        page: { type: "Stack", props: {}, children: ["open", "drw"] },
        open: { type: "Button", props: { label: "Open drawer" }, children: [] },
        drw: { type: "Drawer", props: { open: true, title: "Advanced" }, children: [] },
      },
    });
    const registry = createInteractiveRegistry(base);
    const Drawer = registry.Drawer!;
    const Button = registry.Button!;
    const on = () => ({ emit: () => {}, shouldPreventDefault: false, bound: false });
    render(
      <DialogControlProvider spec={drawerSpec}>
        <Button element={drawerSpec.elements.open!} emit={() => {}} on={on} />
        <Drawer element={drawerSpec.elements.drw!} emit={() => {}} on={on} />
      </DialogControlProvider>
    );
    expect(screen.queryByLabelText("drawer")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open drawer" }));
    expect(screen.getByLabelText("drawer")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(screen.queryByLabelText("drawer")).toBeNull();
  });
});
