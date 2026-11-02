import { describe, it, expect } from "vitest";
import { placeVertical, placeHorizontal, placeBeside } from "./floating-position";

function rect(left: number, top: number, width = 100, height = 40): DOMRect {
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

describe("placeHorizontal", () => {
  it("keeps a position that fits", () => {
    expect(placeHorizontal(100, 200, 1000)).toBe(100);
  });

  it("clamps a panel that would start left of the viewport", () => {
    expect(placeHorizontal(-106, 200, 375)).toBe(8);
  });

  it("clamps a panel that would end right of the viewport", () => {
    expect(placeHorizontal(300, 200, 375)).toBe(167);
  });

  it("pins to the start margin when the panel is wider than the viewport", () => {
    expect(placeHorizontal(50, 400, 320)).toBe(8);
  });
});

describe("placeVertical", () => {
  it("opens on the preferred side when it fits", () => {
    const r = placeVertical(rect(0, 100), 100, "bottom", 8, 720);
    expect(r).toEqual({ top: "148px", bottom: "auto", maxHeight: "" });
  });

  it("flips to the roomier side and caps the height to it", () => {
    const r = placeVertical(rect(0, 600), 400, "bottom", 8, 720);
    expect(r.top).toBe("auto");
    expect(r.bottom).toBe("128px");
    expect(r.maxHeight).toBe("");
  });

  it("caps to the room available when neither side fits", () => {
    const r = placeVertical(rect(0, 300), 900, "bottom", 8, 720);
    expect(r.top).toBe("348px");
    expect(r.maxHeight).toBe("372px");
  });
});

describe("placeBeside", () => {
  it("centres on the anchor and clamps into the viewport", () => {
    const r = placeBeside(rect(500, 300), "right", { width: 320, height: 100 }, 8, 600, 720);
    expect(r.left).toBe("272px");
  });

  it("clamps a left placement that starts off screen", () => {
    const r = placeBeside(rect(20, 300), "left", { width: 320, height: 100 }, 8, 1000, 720);
    expect(r.left).toBe("8px");
  });

  it("clamps vertically and caps a panel taller than the viewport", () => {
    const r = placeBeside(rect(100, 10), "right", { width: 200, height: 900 }, 8, 1000, 720);
    expect(r.top).toBe("8px");
    expect(r.maxHeight).toBe("704px");
  });
});
