import { describe, expect, it } from "vitest";
import type { Spec } from "@json-render/react";
import { planDialogControls } from "./dialog-controls.js";

const NESTED: Spec = {
  root: "page",
  elements: {
    page: { type: "Stack", props: {}, children: ["open-outer", "outer"] },
    "open-outer": { type: "Button", props: { label: "Open outer dialog" }, children: [] },
    outer: {
      type: "Dialog",
      props: { open: true, title: "Outer dialog" },
      children: ["body"],
    },
    body: {
      type: "Stack",
      props: {},
      children: ["open-inner", "close-outer", "inner"],
    },
    "open-inner": { type: "Button", props: { label: "Open inner dialog" }, children: [] },
    "close-outer": { type: "Button", props: { label: "Close outer dialog" }, children: [] },
    inner: {
      type: "Dialog",
      props: { open: true, title: "Inner dialog" },
      children: ["close-inner"],
    },
    "close-inner": { type: "Button", props: { label: "Close inner dialog" }, children: [] },
  },
};

describe("planDialogControls", () => {
  it("starts triggered dialogs closed and wires open and close buttons", () => {
    const plan = planDialogControls(NESTED);
    expect(plan.dialogs.outer).toEqual({ initialOpen: false });
    expect(plan.dialogs.inner).toEqual({ initialOpen: false });
    expect(plan.buttons["open-outer"]).toEqual({ kind: "open", dialogKey: "outer" });
    expect(plan.buttons["open-inner"]).toEqual({ kind: "open", dialogKey: "inner" });
    expect(plan.buttons["close-outer"]).toEqual({ kind: "close", dialogKey: "outer" });
    expect(plan.buttons["close-inner"]).toEqual({ kind: "close", dialogKey: "inner" });
  });

  it("leaves a dialog that has no opener on its literal open value", () => {
    const spec: Spec = {
      root: "confirm",
      elements: {
        confirm: { type: "Dialog", props: { open: true, title: "Delete?" }, children: [] },
      },
    };
    expect(planDialogControls(spec).dialogs.confirm).toEqual({ initialOpen: true });
  });

  it("treats the button immediately before a dialog as its opener", () => {
    const spec: Spec = {
      root: "page",
      elements: {
        page: { type: "Stack", props: {}, children: ["launch", "dlg"] },
        launch: { type: "Button", props: { children: "Launch" }, children: [] },
        dlg: { type: "Dialog", props: { open: true, title: "Details" }, children: [] },
      },
    };
    const plan = planDialogControls(spec);
    expect(plan.buttons.launch).toEqual({ kind: "open", dialogKey: "dlg" });
    expect(plan.dialogs.dlg).toEqual({ initialOpen: false });
  });

  it("reads a close affordance from an icon button's aria-label", () => {
    const spec: Spec = {
      root: "dlg",
      elements: {
        dlg: { type: "Dialog", props: { open: true }, children: ["x"] },
        x: { type: "IconButton", props: { "aria-label": "Close dialog" }, children: [] },
      },
    };
    expect(planDialogControls(spec).buttons.x).toEqual({ kind: "close", dialogKey: "dlg" });
  });
});
