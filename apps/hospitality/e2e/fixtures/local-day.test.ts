import { afterEach, describe, expect, it, vi } from "vitest";
import { localDay, onLocalDay } from "../local-day.js";

// Pin the runner's zone so the local-vs-UTC day split is exercised on UTC CI as well as on a
// Pacific laptop (Node re-reads TZ at runtime; vitest isolates each file in its own fork).
process.env.TZ = "America/Los_Angeles";

// 22:30 Pacific on 2026-05-19 is 05:30Z on 2026-05-20 — a UTC slice answers tomorrow.
const PACIFIC_EVENING = new Date("2026-05-20T05:30:00Z");

const FIXTURE_ROWS = [
  {
    id: "res_1",
    date: "2025-01-01",
    startTime: "2025-01-01T18:00:00.000Z",
    endTime: "2025-01-01T19:30:00.000Z",
  },
];

describe("local day (e2e fixture re-dating)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("localDay() is the device calendar day on a US-Pacific evening, not the UTC day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(PACIFIC_EVENING);
    expect(localDay()).toBe("2026-05-19");
  });

  it("onLocalDay() re-dates rows onto the local day and reads fixture times as local wall clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(PACIFIC_EVENING);

    const [row] = onLocalDay(FIXTURE_ROWS);

    expect(row).toMatchObject({ id: "res_1", date: "2026-05-19" });
    // The instant, not its ISO prefix: 18:00 local on 2026-05-19 is 01:00Z on 2026-05-20 (PDT).
    expect(row?.startTime).toBe("2026-05-20T01:00:00.000Z");
    expect(row?.endTime).toBe("2026-05-20T02:30:00.000Z");
    expect(new Date(row!.startTime).toLocaleDateString("en-CA")).toBe("2026-05-19");
    expect(new Date(row!.startTime).getHours()).toBe(18);
  });

  it("onLocalDay() honours an explicit day and leaves the source rows untouched", () => {
    const [row] = onLocalDay(FIXTURE_ROWS, "2026-07-04");
    expect(row?.date).toBe("2026-07-04");
    expect(new Date(row!.startTime).toLocaleDateString("en-CA")).toBe("2026-07-04");
    expect(FIXTURE_ROWS[0]?.date).toBe("2025-01-01");
  });
});
