import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, DateRule } from "@mbe/types";

vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: {
      id: "venue-1",
      ianaTimezone: "America/Los_Angeles",
      currencyCode: "USD",
      settings: undefined,
    },
  }),
}));
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

import { SchedulesLayer } from "./schedules-tab.harness.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

type Assignment = AvailabilityConfig["assignments"][number];

/** The fixture venue plus one "Summer" schedule, assigned or pointed at by rules as given. */
function withSummer(
  assignments: readonly Partial<Assignment>[],
  rules: readonly DateRule[] = []
): AvailabilityConfig {
  const base = fixtureConfig(...rules);
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "summer", name: "Summer", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...base.scheduleServices,
      ...base.scheduleServices.map((s) => ({ ...s, id: `${s.id}-summer`, scheduleId: "summer" })),
    ],
    assignments: [
      ...base.assignments,
      ...assignments.map((a, i) => ({
        id: `as-summer-${i}`,
        scheduleId: "summer",
        weekdays: [1, 2, 3, 4],
        precedence: i + 1,
        ...a,
      })),
    ],
  };
}

function useSummerOn(id: string, date: string): DateRule {
  return {
    id,
    kind: "use_schedule",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    useScheduleId: "summer",
  };
}

/** The line under the Summer schedule's name. */
function usageOf(config: AvailabilityConfig): string {
  render(
    <ToastProvider>
      <main>
        <SchedulesLayer
          venueId="venue-1"
          timezone="America/Los_Angeles"
          today="2026-10-25"
          onStale={vi.fn()}
          state={{ config, version: 7, source: "rows" }}
        />
      </main>
    </ToastProvider>
  );
  const row = within(screen.getByRole("region", { name: "Other schedules" })).getByRole("listitem");
  const name = within(row).getByText("Summer");
  return name.nextElementSibling?.textContent ?? "";
}

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

/** The wording of where a seasonal schedule applies, pinned across the rule-summaries extraction. */
describe("SchedulesTab: where a schedule applies", () => {
  it("says Not used yet", () => {
    expect(usageOf(withSummer([]))).toBe("Not used yet");
  });

  it("names the days alone", () => {
    expect(usageOf(withSummer([{}]))).toBe("Mon–Thu");
  });

  it("names a range", () => {
    const all = [0, 1, 2, 3, 4, 5, 6];
    expect(
      usageOf(withSummer([{ startsOn: "2026-06-01", endsOn: "2026-09-15", weekdays: all }]))
    ).toBe("Jun 1 – Sep 15, every day");
  });

  it("names an open-ended start", () => {
    expect(usageOf(withSummer([{ startsOn: "2026-06-01" }]))).toBe("From Jun 1, Mon–Thu");
  });

  it("names an end with no start", () => {
    expect(usageOf(withSummer([{ endsOn: "2026-09-15" }]))).toBe("Until Sep 15, Mon–Thu");
  });

  it("joins several assignments", () => {
    expect(usageOf(withSummer([{ startsOn: "2026-06-01" }, { weekdays: [6] }]))).toBe(
      "From Jun 1, Mon–Thu; Sat"
    );
  });

  it("counts the Use schedule rules when nothing else uses it", () => {
    expect(usageOf(withSummer([], [useSummerOn("u1", "2026-12-24")]))).toBe(
      "Used by 1 Use schedule rule"
    );
  });
});
