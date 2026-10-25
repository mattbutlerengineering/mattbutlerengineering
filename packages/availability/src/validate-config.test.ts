import { describe, expect, it } from "vitest";
import { validateConfig } from "./validate-config.js";

const service = (id: string, opensAt: number, lastSeatingAt: number, closesAt: number) => ({
  id,
  scheduleId: "sch-regular",
  venueServiceId: `vs-${id}`,
  opensAt,
  lastSeatingAt,
  closesAt,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
});

const LUNCH = service("lunch", 690, 840, 900);
const DINNER = service("dinner", 1020, 1260, 1380);

const config = (overrides: Record<string, unknown> = {}) => ({
  schedules: [{ id: "sch-regular", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0 },
    { id: "vs-dinner", name: "Dinner", position: 1 },
  ],
  scheduleServices: [LUNCH, DINNER],
  assignments: [
    { id: "as-1", scheduleId: "sch-regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
  ...overrides,
});

const pathsAndCodes = (input: unknown) =>
  validateConfig(input).map(({ path, code }) => ({ path, code }));

describe("validateConfig", () => {
  it("accepts a valid configuration", () => {
    expect(validateConfig(config())).toEqual([]);
  });

  it("accepts a service that runs past midnight", () => {
    const late = service("late", 1320, 1500, 1620);
    expect(validateConfig(config({ scheduleServices: [DINNER, late] }))).toEqual([
      expect.objectContaining({ path: "scheduleServices[1].opensAt", code: "overlap" }),
    ]);
    expect(validateConfig(config({ scheduleServices: [LUNCH, late] }))).toEqual([]);
  });

  it("rejects overlapping services in one schedule", () => {
    const earlyDinner = service("dinner", 870, 1260, 1380);
    expect(pathsAndCodes(config({ scheduleServices: [LUNCH, earlyDinner] }))).toEqual([
      { path: "scheduleServices[1].opensAt", code: "overlap" },
    ]);
  });

  it("allows the same hours in two different schedules", () => {
    const summer = { ...DINNER, id: "summer-dinner", scheduleId: "sch-summer" };
    expect(
      validateConfig(
        config({
          schedules: [
            { id: "sch-regular", name: "Regular", kind: "regular", isRegular: true },
            { id: "sch-summer", name: "Summer", kind: "alternate", isRegular: false },
          ],
          scheduleServices: [LUNCH, DINNER, summer],
        })
      )
    ).toEqual([]);
  });

  it("rejects a last seating after close", () => {
    expect(
      pathsAndCodes(config({ scheduleServices: [LUNCH, service("dinner", 1020, 1400, 1380)] }))
    ).toEqual([{ path: "scheduleServices[1].lastSeatingAt", code: "last_seating_after_close" }]);
  });

  it("rejects a last seating before opening", () => {
    expect(
      pathsAndCodes(config({ scheduleServices: [LUNCH, service("dinner", 1020, 1000, 1380)] }))
    ).toEqual([{ path: "scheduleServices[1].lastSeatingAt", code: "last_seating_before_open" }]);
  });

  it("rejects a close at or before opening", () => {
    expect(
      pathsAndCodes(config({ scheduleServices: [LUNCH, service("dinner", 1020, 1020, 1020)] }))
    ).toEqual([{ path: "scheduleServices[1].closesAt", code: "close_before_open" }]);
  });

  it("rejects two regular schedules", () => {
    expect(
      pathsAndCodes(
        config({
          schedules: [
            { id: "sch-regular", name: "Regular", kind: "regular", isRegular: true },
            { id: "sch-other", name: "Other", kind: "regular", isRegular: true },
          ],
        })
      )
    ).toEqual([{ path: "schedules[1].isRegular", code: "multiple_regular_schedules" }]);
  });

  it("rejects a configuration with no regular schedule", () => {
    expect(
      pathsAndCodes(
        config({
          schedules: [{ id: "sch-regular", name: "Regular", kind: "regular", isRegular: false }],
        })
      )
    ).toEqual([{ path: "schedules", code: "no_regular_schedule" }]);
  });

  it("rejects an unknown payload version with its field path", () => {
    const issues = validateConfig(
      config({ scheduleServices: [{ ...LUNCH, seating: { version: 2, interval: 15 } }, DINNER] })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ path: "scheduleServices[0].seating", code: "invalid" });
    expect(issues[0]?.message).toBeTruthy();
  });

  it("rejects an unknown Tonight payload version with its field path", () => {
    const issues = pathsAndCodes(
      config({
        dateRules: [
          {
            id: "dr-1",
            kind: "tonight",
            targetKind: "venue",
            startsOn: "2026-10-25",
            payload: { version: 2, closeAt: 1260 },
          },
        ],
      })
    );
    expect(issues).toEqual([{ path: "dateRules[0].payload", code: "invalid" }]);
  });

  it("rejects input that is not a configuration at all", () => {
    expect(pathsAndCodes(null)).toEqual([{ path: "", code: "invalid" }]);
  });

  it("rejects equal precedence on assignments that overlap", () => {
    expect(
      pathsAndCodes(
        config({
          schedules: [
            { id: "sch-regular", name: "Regular", kind: "regular", isRegular: true },
            { id: "sch-summer", name: "Summer", kind: "alternate", isRegular: false },
          ],
          assignments: [
            { id: "as-1", scheduleId: "sch-regular", weekdays: [5, 6], precedence: 0 },
            {
              id: "as-2",
              scheduleId: "sch-summer",
              weekdays: [6],
              startsOn: "2027-06-01",
              endsOn: "2027-08-31",
              precedence: 0,
            },
          ],
        })
      )
    ).toEqual([{ path: "assignments[1].precedence", code: "precedence_tie" }]);
  });

  it("allows equal precedence where weekdays or date ranges don't meet", () => {
    const assignments = [
      {
        id: "as-1",
        scheduleId: "sch-regular",
        weekdays: [6],
        endsOn: "2027-05-31",
        precedence: 0,
      },
      {
        id: "as-2",
        scheduleId: "sch-regular",
        weekdays: [6],
        startsOn: "2027-06-01",
        precedence: 0,
      },
      { id: "as-3", scheduleId: "sch-regular", weekdays: [1], precedence: 0 },
    ];
    expect(validateConfig(config({ assignments }))).toEqual([]);
  });

  it("rejects an assignment whose range ends before it starts", () => {
    expect(
      pathsAndCodes(
        config({
          assignments: [
            {
              id: "as-1",
              scheduleId: "sch-regular",
              weekdays: [1],
              startsOn: "2027-06-01",
              endsOn: "2027-05-01",
              precedence: 0,
            },
          ],
        })
      )
    ).toEqual([{ path: "assignments[0].endsOn", code: "ends_before_start" }]);
  });

  it("checks the services inside a special-hours rule", () => {
    const special = (opensAt: number, lastSeatingAt: number, closesAt: number) => ({
      venueServiceId: "vs-dinner",
      opensAt,
      lastSeatingAt,
      closesAt,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online"],
    });
    expect(
      pathsAndCodes(
        config({
          dateRules: [
            {
              id: "dr-eve",
              kind: "special_hours",
              targetKind: "venue",
              startsOn: "2026-12-31",
              payload: {
                version: 1,
                services: [special(960, 1140, 1260), special(1200, 1500, 1440)],
              },
            },
          ],
        })
      )
    ).toEqual([
      { path: "dateRules[0].payload.services[1].lastSeatingAt", code: "last_seating_after_close" },
      { path: "dateRules[0].payload.services[1].opensAt", code: "overlap" },
    ]);
  });

  it("rejects a date rule that ends before it starts", () => {
    expect(
      pathsAndCodes(
        config({
          dateRules: [
            {
              id: "dr-1",
              kind: "closure",
              targetKind: "venue",
              startsOn: "2026-12-26",
              endsOn: "2026-12-25",
            },
          ],
        })
      )
    ).toEqual([{ path: "dateRules[0].endsOn", code: "ends_before_start" }]);
  });
});
