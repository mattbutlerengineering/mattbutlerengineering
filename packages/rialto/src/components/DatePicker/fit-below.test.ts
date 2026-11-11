import { describe, expect, it } from "vitest";
import { scrollDeltaToFitBelow, sheetMaxHeight } from "./fit-below";

describe("sheetMaxHeight", () => {
  it("leaves a panel that already fits under the field alone", () => {
    expect(
      sheetMaxHeight({
        panelScrollHeight: 332,
        sheetOffsetHeight: 298,
        anchorBottom: 400,
        viewportHeight: 900,
      })
    ).toBeNull();
  });

  it("caps the sheet to the room under the field on a 375×812 page", () => {
    // Field ends at 526. Room is 812 - 526 - 8 = 278. Panel wants 332, chrome is 34.
    expect(
      sheetMaxHeight({
        panelScrollHeight: 332,
        sheetOffsetHeight: 298,
        anchorBottom: 526,
        viewportHeight: 812,
      })
    ).toBe(244);
  });

  it("does not cap when the room under the field is too short to use", () => {
    expect(
      sheetMaxHeight({
        panelScrollHeight: 332,
        sheetOffsetHeight: 298,
        anchorBottom: 760,
        viewportHeight: 812,
      })
    ).toBeNull();
  });

  it("does not cap a sheet that would be shorter than a usable month", () => {
    expect(
      sheetMaxHeight({
        panelScrollHeight: 400,
        sheetOffsetHeight: 40,
        anchorBottom: 500,
        viewportHeight: 812,
        minRoom: 200,
        minSheet: 160,
      })
    ).toBeNull();
  });
});

describe("scrollDeltaToFitBelow", () => {
  it("does not scroll when the panel already fits", () => {
    expect(
      scrollDeltaToFitBelow({
        anchorTop: 200,
        anchorBottom: 266,
        panelHeight: 332,
        viewportHeight: 900,
        scrollerTop: 113,
        scrollTop: 0,
        scrollHeight: 3000,
        clientHeight: 787,
      })
    ).toBe(0);
  });

  it("scrolls a 375×667 page just enough for the full month to clear the field", () => {
    // Room is 667 - 526 - 8 = 133. Deficit is 332 - 133 = 199.
    // The field can move up 339px before it leaves the scroller.
    expect(
      scrollDeltaToFitBelow({
        anchorTop: 460,
        anchorBottom: 526,
        panelHeight: 332,
        viewportHeight: 667,
        scrollerTop: 113,
        scrollTop: 0,
        scrollHeight: 3000,
        clientHeight: 554,
      })
    ).toBe(199);
  });

  it("stops scrolling before the field leaves the scroller", () => {
    expect(
      scrollDeltaToFitBelow({
        anchorTop: 140,
        anchorBottom: 206,
        panelHeight: 332,
        viewportHeight: 400,
        scrollerTop: 100,
        scrollTop: 0,
        scrollHeight: 3000,
        clientHeight: 300,
      })
    ).toBe(32);
  });

  it("does not scroll a scroller that is already at its end", () => {
    expect(
      scrollDeltaToFitBelow({
        anchorTop: 460,
        anchorBottom: 526,
        panelHeight: 332,
        viewportHeight: 667,
        scrollerTop: 113,
        scrollTop: 400,
        scrollHeight: 500,
        clientHeight: 400,
      })
    ).toBe(0);
  });
});
