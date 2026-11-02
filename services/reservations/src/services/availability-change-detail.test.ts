import { describe, expect, it } from "vitest";
import {
  closureDetail,
  configSavedDetail,
  readDetail,
  reopenedDetail,
  revertedDetail,
  tonightDetail,
  tonightEndedDetail,
} from "./availability-change-detail.js";

describe("change detail builders", () => {
  it("counts the rows of a config save", () => {
    const part = (n: number) => ({ schedules: new Array(n).fill({}) });
    expect(
      configSavedDetail({
        create: part(2),
        update: part(0),
        remove: part(1),
      } as never)
    ).toEqual({ code: "config_saved", added: 2, changed: 0, removed: 1 });
  });

  it("words a closure with its span and what became of the bookings", () => {
    const counts = { cancel: 2, move: 1, keep_notify: 3, keep_silent: 1 } as never;
    expect(
      closureDetail(
        { kind: "closure", startsOn: "2026-12-24", endsOn: "2026-12-26" } as never,
        counts
      )
    ).toEqual({
      code: "closure_saved",
      startsOn: "2026-12-24",
      endsOn: "2026-12-26",
      cancelled: 2,
      moved: 1,
      kept: 4,
    });
  });

  it("gives a close-early its own code, and an open end as null", () => {
    const counts = { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 } as never;
    expect(
      closureDetail({ kind: "tonight", startsOn: "2026-12-24", endsOn: undefined } as never, counts)
    ).toMatchObject({ code: "close_early_saved", endsOn: null });
  });

  it("names a reopened closure by its first and last day, null for an open end", () => {
    expect(reopenedDetail({ startsOn: "2026-12-24", endsOn: "2026-12-24" } as never)).toEqual({
      code: "closure_reopened",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    });
    expect(reopenedDetail({ startsOn: "2026-12-24", endsOn: undefined } as never)).toEqual({
      code: "closure_reopened",
      startsOn: "2026-12-24",
      endsOn: null,
    });
  });

  it("gives each Tonight change a code, with the number it needs", () => {
    expect(tonightDetail({ type: "pause_online" } as never)).toEqual({
      code: "tonight_pause_online",
    });
    expect(tonightDetail({ type: "close_early" } as never)).toEqual({
      code: "tonight_close_early",
    });
    expect(tonightDetail({ type: "stop_window" } as never)).toEqual({
      code: "tonight_stop_window",
    });
    expect(tonightDetail({ type: "block_tables", tableIds: ["a", "b"] } as never)).toEqual({
      code: "tonight_block_tables",
      tables: 2,
    });
    expect(tonightDetail({ type: "pacing", covers: 12 } as never)).toEqual({
      code: "tonight_pacing",
      covers: 12,
    });
    expect(tonightEndedDetail()).toEqual({ code: "tonight_ended" });
  });

  it("marks a revert of a change that has a detail, and gives none for one that has not", () => {
    expect(revertedDetail({ code: "config_saved", added: 1, changed: 0, removed: 0 })).toEqual({
      code: "config_saved",
      added: 1,
      changed: 0,
      removed: 0,
      reverted: true,
    });
    expect(revertedDetail(null)).toBeNull();
    expect(revertedDetail("garbage")).toBeNull();
  });

  it("reads a stored detail, and refuses what is not one", () => {
    expect(readDetail({ code: "tonight_ended" })).toEqual({ code: "tonight_ended" });
    expect(readDetail(null)).toBeNull();
    expect(readDetail({ nope: 1 })).toBeNull();
  });
});
