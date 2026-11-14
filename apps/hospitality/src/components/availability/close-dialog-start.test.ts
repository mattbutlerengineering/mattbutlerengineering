import { describe, expect, it } from "vitest";
import { closeDialogStart, closeTargetForDates } from "./close-dialog-start.js";

describe("closeDialogStart", () => {
  it("opens the whole venue with the date still to ask", () => {
    expect(closeDialogStart({ kind: "venue" })).toEqual({ initialDate: null });
  });

  it("opens on Tonight, armed", () => {
    expect(closeDialogStart({ kind: "tonight" })).toEqual({
      initialDate: null,
      startTonight: true,
    });
  });

  it("prefills one date, a range, several dates or a section", () => {
    expect(closeDialogStart({ kind: "date", date: "2026-12-26" })).toEqual({
      initialDate: "2026-12-26",
    });
    expect(closeDialogStart({ kind: "range", from: "2027-01-04", to: "2027-01-10" })).toEqual({
      initialDate: null,
      initialRange: { from: "2027-01-04", to: "2027-01-10" },
    });
    expect(closeDialogStart({ kind: "dates", dates: ["2026-12-24", "2026-12-31"] })).toEqual({
      initialDate: null,
      initialDates: ["2026-12-24", "2026-12-31"],
    });
    expect(closeDialogStart({ kind: "section", sectionId: "sec-bar" })).toEqual({
      initialDate: null,
      initialSectionId: "sec-bar",
    });
  });
});

describe("closeTargetForDates", () => {
  it("names one picked date as that date and several as a list", () => {
    expect(closeTargetForDates(["2026-12-24"])).toEqual({ kind: "date", date: "2026-12-24" });
    expect(closeTargetForDates(["2026-12-31", "2026-12-24"])).toEqual({
      kind: "dates",
      dates: ["2026-12-31", "2026-12-24"],
    });
  });
});
