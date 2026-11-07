import { useLayoutEffect, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DETAILS_SIDEBAR_TEST_ID,
  DETAILS_SURFACE_TEST_ID,
  blockTarget,
  captureOpener,
  returnFocusTarget,
  seatedFocusTarget,
  useBlockAfterRestore,
  useCloseHoldingFocus,
  walkInFocusTarget,
  type SurfaceState,
} from "./timeline-focus.js";

const SURFACE: FocusTarget = { kind: "firstIn", testId: DETAILS_SURFACE_TEST_ID };
const EDIT = { kind: "testId", testId: "reservation-edit" };

type FocusTarget = ReturnType<typeof walkInFocusTarget>;

const surface = (overrides: Partial<SurfaceState> = {}): SurfaceState => ({
  openId: null,
  modal: false,
  changingForm: false,
  dialogEpoch: 0,
  ...overrides,
});

function append(tag: string, attributes: Record<string, string> = {}, parent = document.body) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  parent.appendChild(element);
  return element;
}

const openModal = () => append("div", { role: "dialog", "aria-modal": "true" });

afterEach(() => {
  document.body.replaceChildren();
});

describe("seatedFocusTarget", () => {
  it("stays out of the way when the Host has taken focus elsewhere", () => {
    append("button", { "data-testid": "reservation-block-bob" });
    const elsewhere = append("button");
    elsewhere.focus();
    expect(seatedFocusTarget(surface(), "bob")).toBeNull();
    expect(seatedFocusTarget(surface({ openId: "bob" }), "bob")).toBeNull();
  });

  it("still moves when focus is inside the surface that sent it", () => {
    append("button", { "data-testid": "reservation-block-bob" });
    const sidebar = append("div", { "data-testid": DETAILS_SIDEBAR_TEST_ID });
    append("button", {}, sidebar).focus();
    expect(seatedFocusTarget(surface({ openId: "bob" }), "bob")).toEqual(blockTarget("bob"));
  });

  it("asks for nothing when the target is not on the page, so nothing waits for it", () => {
    expect(seatedFocusTarget(surface(), "bob")).toBeNull();
  });

  it("falls back to the block when the surface has closed", () => {
    append("button", { "data-testid": "reservation-block-bob" });
    expect(seatedFocusTarget(surface(), "bob")).toEqual(blockTarget("bob"));
  });

  it("stays out of another party's surface, in either form", () => {
    expect(seatedFocusTarget(surface({ openId: "carol" }), "bob")).toBeNull();
    expect(seatedFocusTarget(surface({ openId: "carol", modal: true }), "bob")).toBeNull();
  });

  it("lands on Edit inside this party's modal surface", () => {
    const modal = openModal();
    append("button", { "data-testid": "reservation-edit" }, modal);
    expect(seatedFocusTarget(surface({ openId: "bob", modal: true }), "bob")).toEqual(EDIT);
  });

  it("lands on the block beside this party's sidebar", () => {
    append("button", { "data-testid": "reservation-block-bob" });
    expect(seatedFocusTarget(surface({ openId: "bob" }), "bob")).toEqual(blockTarget("bob"));
  });
});

describe("returnFocusTarget", () => {
  const fallback = blockTarget("bob");

  it("returns to a live opener beside a sidebar", () => {
    const opener = append("button");
    expect(returnFocusTarget(surface({ openId: "bob" }), opener, fallback)).toEqual({
      kind: "element",
      element: opener,
    });
  });

  it("uses the fallback when the opener is gone", () => {
    const opener = document.createElement("button");
    expect(returnFocusTarget(surface({ openId: "bob" }), opener, fallback)).toBe(fallback);
  });

  it("uses the fallback when the opener's surface is about to change form", () => {
    const opener = append("button");
    const state = surface({ openId: "bob", changingForm: true });
    expect(returnFocusTarget(state, opener, fallback)).toBe(fallback);
  });

  it("goes to the surface when the opener is behind a modal surface", () => {
    const opener = append("button");
    const state = surface({ openId: "bob", modal: true });
    expect(returnFocusTarget(state, opener, fallback)).toEqual(SURFACE);
  });

  it("returns to an opener inside the modal surface", () => {
    const wrapper = append("div", { "data-testid": DETAILS_SURFACE_TEST_ID });
    const opener = append("button", {}, wrapper);
    expect(returnFocusTarget(surface({ openId: "bob", modal: true }), opener, fallback)).toEqual({
      kind: "element",
      element: opener,
    });
  });
});

describe("useCloseHoldingFocus", () => {
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  // What the page does: `close` changes state, and the overlay's restore frame is scheduled in the
  // commit's layout phase, as Rialto's useReturnFocus schedules it.
  function closer(onCommit: () => void) {
    return renderHook(() => {
      const closeHoldingFocus = useCloseHoldingFocus();
      const [closed, setClosed] = useState(false);
      useLayoutEffect(() => {
        if (closed) onCommit();
      }, [closed]);
      return () => closeHoldingFocus(() => setClosed(true));
    });
  }

  it("gives focus back to a dialog on top, after the closing overlay's restore frame", async () => {
    const trigger = append("button");
    const inDialog = append("button", {}, openModal());
    inDialog.focus();
    const { result } = closer(() => requestAnimationFrame(() => trigger.focus()));

    act(() => result.current());
    await nextFrame();
    await nextFrame();

    expect(document.activeElement).toBe(inDialog);
  });

  it("gives focus back to an alertdialog on top, after the closing overlay's restore frame", async () => {
    const trigger = append("button");
    const alertDialog = append("div", { role: "alertdialog", "aria-modal": "true" });
    const inDialog = append("button", {}, alertDialog);
    inDialog.focus();
    const { result } = closer(() => requestAnimationFrame(() => trigger.focus()));

    act(() => result.current());
    await nextFrame();
    await nextFrame();

    expect(document.activeElement).toBe(inDialog);
  });

  it("leaves the restore alone when what held focus went with the overlay", async () => {
    const trigger = append("button");
    const overlay = openModal();
    append("button", {}, overlay).focus();
    const { result } = closer(() => {
      overlay.remove();
      requestAnimationFrame(() => trigger.focus());
    });

    act(() => result.current());
    await nextFrame();
    await nextFrame();

    expect(document.activeElement).toBe(trigger);
  });
});

describe("useBlockAfterRestore", () => {
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const block = (id: string) => append("button", { "data-testid": `reservation-block-${id}` });

  // What the page does: the request is made in a handler whose state change commits afterwards.
  function requester() {
    return renderHook(() => {
      const blockAfterRestore = useBlockAfterRestore();
      const [commits, setCommits] = useState(0);
      return (id: string) => {
        blockAfterRestore(id);
        setCommits(commits + 1);
      };
    });
  }

  async function request(id: string) {
    const { result } = requester();
    act(() => result.current(id));
    await nextFrame();
    await nextFrame();
  }

  it("focuses the block when focus is on body", async () => {
    const own = block("walkin");
    await request("walkin");
    expect(document.activeElement).toBe(own);
  });

  it("replaces another party's block, the Drawer's stale restore", async () => {
    const own = block("walkin");
    block("bob").focus();
    await request("walkin");
    expect(document.activeElement).toBe(own);
  });

  it("leaves focus on a control that is not a block", async () => {
    block("walkin");
    const control = append("button", { "data-testid": "table-status-t1" });
    control.focus();
    await request("walkin");
    expect(document.activeElement).toBe(control);
  });

  it("leaves focus in a dialog opened over the closing surface", async () => {
    block("walkin");
    const dialog = append("div", { role: "dialog", "aria-modal": "true" });
    const inside = document.createElement("button");
    dialog.appendChild(inside);
    inside.focus();
    await request("walkin");
    expect(document.activeElement).toBe(inside);
  });

  it("leaves focus alone when the block is not on the page", async () => {
    const other = block("bob");
    other.focus();
    await request("walkin");
    expect(document.activeElement).toBe(other);
  });
});

describe("walkInFocusTarget", () => {
  it("is the block on desktop and the surface otherwise", () => {
    expect(walkInFocusTarget("desktop", "alice")).toEqual(blockTarget("alice"));
    expect(walkInFocusTarget("tablet", "alice")).toEqual(SURFACE);
    expect(walkInFocusTarget("phone", "alice")).toEqual(SURFACE);
  });
});

describe("captureOpener", () => {
  it("prefers the clicked button", () => {
    const clicked = append("button");
    expect(captureOpener(clicked)).toBe(clicked);
  });

  it("falls back to what holds focus, and to nothing when that is the body", () => {
    expect(captureOpener()).toBeNull();
    const focused = append("button");
    focused.focus();
    expect(captureOpener()).toBe(focused);
  });
});
