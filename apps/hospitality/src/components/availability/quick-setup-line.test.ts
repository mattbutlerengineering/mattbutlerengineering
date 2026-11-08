import { describe, expect, it } from "vitest";
import { localeRuntime } from "../../i18n/runtime.js";
import { formatCalendarDate, formatLocalTime } from "../../utils/format.js";
import { EVERY_DAY, draftBlock, draftService } from "./quick-setup-demo.fixture.js";
import { emptyService, type QuickSetupDraft } from "./quick-setup-draft.js";
import { serviceLineText, type LineFormat } from "./quick-setup-line.js";

const t = localeRuntime.i18n.t.bind(localeRuntime.i18n);
const format: LineFormat = {
  locale: "en-US",
  formatLocalTime: (hhmm) => formatLocalTime(hhmm, "en-US"),
  formatCalendarDate: (date, options) => formatCalendarDate(date, options, "en-US"),
};

const lunch = draftService("lunch", "Lunch", ["11:30", "14:00", "15:00"]);
const week = (services: QuickSetupDraft["services"], days = EVERY_DAY): QuickSetupDraft => ({
  services,
  days,
});

describe("serviceLineText", () => {
  it("names the service, its hours and the shared days", () => {
    const line = serviceLineText(lunch, week([lunch]), format, t);
    expect(line.name).toBe("Lunch");
    expect(line.summary).toBe("11:30 AM–3:00 PM · Every day");
  });

  it("falls back to Service N by position when there is no name", () => {
    const unnamed = draftService("b", "  ", ["17:00", "21:00", "22:00"]);
    const line = serviceLineText(unnamed, week([lunch, unnamed]), format, t);
    expect(line.name).toBe("Service 2");
    expect(line.summary).toBe("5:00 PM–10:00 PM · Every day");
  });

  it("marks a close past midnight as the next day", () => {
    const late = draftService("late", "Late", ["22:00", "00:00", "01:00"]);
    expect(serviceLineText(late, week([late]), format, t).summary).toBe(
      "10:00 PM–1:00 AM (next day) · Every day"
    );
  });

  it("says a service's own days, not the shared ones", () => {
    const own = draftService("lunch", "Lunch", ["11:30", "14:00", "15:00"], {
      days: [1, 2, 3, 4],
    });
    expect(serviceLineText(own, week([own]), format, t).summary).toBe("11:30 AM–3:00 PM · Mon–Thu");
  });

  it("adds the days of its different hours", () => {
    const dinner = draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"], {
      blocks: [draftBlock("late", [6, 5], ["17:00", "22:00", "00:00"])],
    });
    expect(serviceLineText(dinner, week([dinner]), format, t).summary).toBe(
      "5:00 PM–11:00 PM · Every day · other hours Fri–Sat"
    );
  });

  it("says other hours on every day as the plain summary, not the capitalised shortcut", () => {
    const all = draftService("a", "A", ["17:00", "21:00", "23:00"], {
      blocks: [draftBlock("b", EVERY_DAY, ["17:00", "22:00", "00:00"])],
    });
    expect(serviceLineText(all, week([all]), format, t).summary).toBe(
      "5:00 PM–11:00 PM · Every day · other hours every day"
    );
  });

  it("leaves out what is not filled in yet", () => {
    const blank = emptyService("x");
    const line = serviceLineText(blank, week([blank], []), format, t);
    expect(line.name).toBe("Service 1");
    expect(line.summary).toBe("");
  });
});
