import { afterEach, describe, expect, it } from "vitest";
import {
  DETAILS_SURFACE_TEST_ID,
  blockTarget,
  captureOpener,
  returnFocusTarget,
  seatedFocusTarget,
  uncoveredTarget,
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

  it("moves nothing under a dialog on top of this party's surface", () => {
    const sheet = openModal();
    append("button", { "data-testid": "reservation-edit" }, sheet);
    openModal();
    expect(seatedFocusTarget(surface({ openId: "bob", modal: true }), "bob")).toBeNull();
  });

  it("moves nothing when the surface has closed under a dialog", () => {
    append("button", { "data-testid": "reservation-block-bob" });
    openModal();
    expect(seatedFocusTarget(surface(), "bob")).toBeNull();
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

describe("walkInFocusTarget", () => {
  it("is the block on desktop and the surface otherwise", () => {
    expect(walkInFocusTarget("desktop", "alice")).toEqual(blockTarget("alice"));
    expect(walkInFocusTarget("tablet", "alice")).toEqual(SURFACE);
    expect(walkInFocusTarget("phone", "alice")).toEqual(SURFACE);
  });
});

describe("uncoveredTarget", () => {
  it("is a request while nothing covers the target, and null under a dialog", () => {
    append("button", { "data-testid": "table-status-1" });
    expect(uncoveredTarget("table-status-1")).toEqual({
      kind: "testId",
      testId: "table-status-1",
    });
    openModal();
    expect(uncoveredTarget("table-status-1")).toBeNull();
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
