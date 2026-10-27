import { describe, expect, it } from "vitest";
import type { ClosureAlongside, DateRule } from "@mbe/types";
import { checkAlongside } from "./closure-alongside.js";

const series: DateRule = {
  id: "series-1",
  kind: "closure",
  targetKind: "venue",
  venueServiceId: null,
  bookingTypes: null,
  tableIds: null,
  startsOn: "2026-01-01",
  endsOn: null,
  repeat: { version: 1, weekdays: [1, 2, 3] },
  window: null,
  seriesId: null,
  guestMessage: null,
  staffNote: null,
};

const skip: DateRule = {
  id: "skip-1",
  kind: "skip",
  targetKind: "venue",
  venueServiceId: null,
  bookingTypes: null,
  tableIds: null,
  startsOn: "2026-01-08",
  endsOn: null,
  repeat: null,
  window: null,
  seriesId: "series-1",
  guestMessage: null,
  staffNote: null,
};

const draft: DateRule = { ...series, id: "draft-1" };
const stored: DateRule[] = [series, skip];

describe("checkAlongside — valid series edits", () => {
  it("accepts the series shortened plus its skip moved to the draft, returning null", () => {
    const shortened: DateRule = { ...series, endsOn: "2026-01-20" };
    const movedSkip: DateRule = { ...skip, seriesId: "draft-1" };
    const alongside: ClosureAlongside = { upsert: [shortened, movedSkip], remove: [] };
    expect(checkAlongside(stored, draft, alongside)).toBeNull();
  });

  it("accepts the series removed entirely plus its skip left pointing at the old series id, returning null", () => {
    const alongside: ClosureAlongside = { upsert: [{ ...skip }], remove: ["series-1"] };
    expect(checkAlongside(stored, draft, alongside)).toBeNull();
  });
});

describe("checkAlongside — touched set must be exactly one stored series", () => {
  it("refuses an alongside that touches nothing", () => {
    const alongside: ClosureAlongside = { upsert: [], remove: [] };
    expect(checkAlongside(stored, draft, alongside)).toEqual({
      path: "alongside",
      code: "invalid_alongside",
      message: "A series edit replaces exactly one stored repeating closure.",
    });
  });

  it("refuses an alongside whose rows span more than one distinct series", () => {
    const otherSeries: DateRule = { ...series, id: "series-2", startsOn: "2026-02-01" };
    const alongside: ClosureAlongside = { upsert: [], remove: ["series-1", "series-2"] };
    expect(checkAlongside([...stored, otherSeries], draft, alongside)?.path).toBe("alongside");
  });

  it("refuses a touched row that is not a series row (not a repeating closure)", () => {
    const alongside: ClosureAlongside = { upsert: [], remove: ["skip-1"] };
    expect(checkAlongside(stored, draft, alongside)?.path).toBe("alongside");
  });

  it("refuses when the touched series is the draft itself", () => {
    const selfDraft: DateRule = { ...series };
    const shortened: DateRule = { ...series, endsOn: "2026-01-20" };
    const alongside: ClosureAlongside = { upsert: [shortened], remove: [] };
    expect(checkAlongside(stored, selfDraft, alongside)?.path).toBe("alongside");
  });
});

describe("checkAlongside — upsert row validation", () => {
  it("refuses an upsert entry whose id is not a stored row", () => {
    const shortened: DateRule = { ...series, endsOn: "2026-01-20" };
    const ghost: DateRule = { ...skip, id: "ghost-1" };
    const alongside: ClosureAlongside = { upsert: [shortened, ghost], remove: [] };
    expect(checkAlongside(stored, draft, alongside)).toEqual({
      path: "alongside.upsert.ghost-1",
      code: "invalid_alongside",
      message: "A series edit adds no rows beside the new series.",
    });
  });

  it("refuses the replaced series' own upsert entry when it is not only-shortened", () => {
    const notShortened: DateRule = { ...series, guestMessage: "changed" };
    const alongside: ClosureAlongside = { upsert: [notShortened], remove: [] };
    expect(checkAlongside(stored, draft, alongside)).toEqual({
      path: "alongside.upsert.series-1",
      code: "invalid_alongside",
      message: "The replaced series can only end earlier.",
    });
  });

  it("refuses the replaced series' own upsert entry when remove is non-empty alongside it", () => {
    const shortened: DateRule = { ...series, endsOn: "2026-01-20" };
    const alongside: ClosureAlongside = { upsert: [shortened], remove: ["series-1"] };
    expect(checkAlongside(stored, draft, alongside)).toEqual({
      path: "alongside.upsert.series-1",
      code: "invalid_alongside",
      message: "The replaced series can only end earlier.",
    });
  });

  it("refuses a non-series upsert entry that changes more than moving seriesId onto the draft", () => {
    const changedSkip: DateRule = { ...skip, seriesId: "draft-1", startsOn: "2026-01-09" };
    const alongside: ClosureAlongside = { upsert: [changedSkip], remove: ["series-1"] };
    expect(checkAlongside(stored, draft, alongside)).toEqual({
      path: "alongside.upsert.skip-1",
      code: "invalid_alongside",
      message: "Only the series' own skips and edited dates move, unchanged.",
    });
  });

  it("documents that touched-id uniqueness, not this check, catches a remove array naming more than the series", () => {
    // By the time this check runs, `touched` is already a single-element Set that every
    // `alongside.remove` entry belongs to — so `remove` can never disagree with the series it
    // names without first tripping the earlier "exactly one touched series" guard above.
    const alongside: ClosureAlongside = { upsert: [], remove: ["series-1", "skip-1"] };
    expect(checkAlongside(stored, draft, alongside)).toEqual({
      path: "alongside",
      code: "invalid_alongside",
      message: "A series edit replaces exactly one stored repeating closure.",
    });
  });
});

describe("checkAlongside — canonical comparison is order- and null-insensitive", () => {
  it("treats a shortened row that omits a null field, with keys in a different order, as unchanged otherwise", () => {
    const shortened: DateRule = {
      seriesId: null,
      kind: "closure",
      targetKind: "venue",
      id: "series-1",
      repeat: { version: 1, weekdays: [1, 2, 3] },
      startsOn: "2026-01-01",
      window: null,
      guestMessage: null,
      endsOn: "2026-01-20",
      venueServiceId: null,
      bookingTypes: null,
      tableIds: null,
      // staffNote omitted entirely (undefined), where `series` sets it to `null`.
    };
    const alongside: ClosureAlongside = { upsert: [shortened], remove: [] };
    expect(checkAlongside(stored, draft, alongside)).toBeNull();
  });

  it("treats a moved skip that omits a null field, with keys in a different order, as unchanged otherwise", () => {
    const movedSkip: DateRule = {
      staffNote: null,
      guestMessage: null,
      seriesId: "draft-1",
      id: "skip-1",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2026-01-08",
      venueServiceId: null,
      bookingTypes: null,
      // tableIds omitted entirely (undefined), where `skip` sets it to `null`.
      endsOn: null,
      repeat: null,
      window: null,
    };
    const alongside: ClosureAlongside = { upsert: [movedSkip], remove: ["series-1"] };
    expect(checkAlongside(stored, draft, alongside)).toBeNull();
  });
});
