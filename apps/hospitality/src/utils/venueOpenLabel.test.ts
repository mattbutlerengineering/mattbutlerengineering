import { describe, it, expect } from "vitest";
import { formatVenueOpenLabel, WEEKDAY_LABEL } from "./venueOpenLabel.js";

describe("formatVenueOpenLabel", () => {
  it("names the closing time when open", () => {
    expect(formatVenueOpenLabel({ state: "open", closesAt: "22:00" })).toBe("Open until 10:00 PM");
  });

  it("names an early-morning closing time for an overnight window", () => {
    expect(formatVenueOpenLabel({ state: "open", closesAt: "02:00" })).toBe("Open until 2:00 AM");
  });

  it("names the opening time when opening soon", () => {
    expect(formatVenueOpenLabel({ state: "opening-soon", opensAt: "17:00" })).toBe(
      "Opens at 5:00 PM"
    );
  });

  it("says when it opens later today when closed", () => {
    expect(formatVenueOpenLabel({ state: "closed", opensAt: "17:00", opensOn: null })).toBe(
      "Closed, opens at 5:00 PM"
    );
  });

  it("names the weekday when the next opening is another day", () => {
    expect(formatVenueOpenLabel({ state: "closed", opensAt: "17:00", opensOn: "tuesday" })).toBe(
      "Closed, opens Tuesday at 5:00 PM"
    );
  });

  it("uses the product's existing phrase when hours are unset", () => {
    expect(formatVenueOpenLabel({ state: "unset" })).toBe("No operating hours set");
  });
});

describe("WEEKDAY_LABEL", () => {
  it("covers all seven weekdays with capitalised names", () => {
    expect(WEEKDAY_LABEL).toEqual({
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      saturday: "Saturday",
      sunday: "Sunday",
    });
  });
});
