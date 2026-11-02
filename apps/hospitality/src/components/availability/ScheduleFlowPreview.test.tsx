import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, PreviewResult } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const previewConfig = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { previewConfig } }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

import { ChangeRegularWeekDrawer } from "./ChangeRegularWeekDrawer.js";
import { CompareServices } from "./CompareServices.js";
import { ScheduleEditorDrawer } from "./ScheduleEditorDrawer.js";
import { UseScheduleDialog } from "./UseScheduleDialog.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const WAIT = { timeout: 3000 };
const common = { venueId: "venue-1", timezone: "America/Los_Angeles", today: "2026-10-25" };

const stateOf = (version = 7): AvailabilityConfigState => {
  const config = fixtureConfig();
  return {
    version,
    source: "rows",
    config: {
      ...config,
      assignments: [
        { id: "as-regular", scheduleId: "regular", weekdays: [2, 3, 4, 5, 6], precedence: 0 },
      ],
    },
  };
};

/** Two schedules run Lunch: Weekend and Weeknight. */
const twoSchedules = (): AvailabilityConfigState => {
  const base = stateOf();
  return {
    ...base,
    config: {
      ...base.config,
      schedules: [
        ...base.config.schedules,
        { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
      ],
      scheduleServices: [
        ...base.config.scheduleServices,
        ...base.config.scheduleServices.map((r) => ({ ...r, id: `${r.id}-wk`, scheduleId: "wk" })),
      ],
      assignments: [
        ...base.config.assignments,
        { id: "as-wk", scheduleId: "wk", weekdays: [1], precedence: 1 },
      ],
    },
  };
};

function result(overrides: Partial<PreviewResult> = {}): PreviewResult {
  return {
    version: 7,
    days: [{ serviceDate: "2026-11-02", added: [], removed: [1350] }],
    focusDay: {
      serviceDate: "2026-11-02",
      label: "Special hours",
      scheduleId: null,
      closures: [],
      bookingOpen: { online: true, phone: true, waitlist: false },
      serviceCount: 1,
      services: [
        {
          venueServiceId: "vs-dinner",
          name: "Dinner",
          opensAt: 1020,
          lastSeatingAt: 1260,
          closesAt: 1380,
        },
      ],
    },
    stranded: {
      total: 1,
      offset: 0,
      items: [
        {
          id: "r1",
          startTime: "2026-11-03T05:30:00.000Z",
          partySize: 4,
          reason: "outside_service",
        },
      ],
    },
    ...overrides,
  };
}

function withClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <main>{node}</main>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const lastBody = () => previewConfig.mock.calls.at(-1)?.[1];

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  previewConfig.mockResolvedValue(result());
  save.mockResolvedValue({ version: 8, changeId: "chg" });
});

describe("Change regular week previews before saving (F-UW.2)", () => {
  const renderWeek = (state = stateOf()) =>
    render(
      withClient(
        <ChangeRegularWeekDrawer
          venueId="venue-1"
          state={state}
          today="2026-10-25"
          onStale={vi.fn()}
          onClose={vi.fn()}
        />
      )
    );
  const fill = () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    fireEvent.change(screen.getByLabelText("Starting"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Winter" } });
  };

  it("says what the preview waits for, then shows guests' view and the stranded bookings", async () => {
    renderWeek();
    expect(previewConfig).not.toHaveBeenCalled();
    expect(
      screen.getByText("Make a change to see what guests will see and which bookings it affects.")
    ).toBeInTheDocument();
    fill();
    expect(
      await screen.findByText("1 booking would fall outside these hours", {}, WAIT)
    ).toBeInTheDocument();
    const body = lastBody();
    // 2026-11-02 is a Monday, which the Tue-Sat regular week does not run.
    expect(body.focusDate).toBe("2026-11-03");
    expect(body.scope[0]).toBe("2026-11-03");
    expect(body.scope.length).toBeGreaterThan(1);
    expect(body.draft.changes.upsert.assignments[0].weekdays).toEqual([2, 3, 4, 5, 6]);
    expect(body.draft.scopeConflicts).toBe("keep");
  });

  it("does not block saving when the preview fails, and says so", async () => {
    previewConfig.mockRejectedValue(new Error("boom"));
    renderWeek();
    fill();
    expect(await screen.findByText("Preview unavailable", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/You can still save/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save/ })).toBeEnabled();
  });

  it("says when the hours moved on after the draft began, and that Save will ask for a review", async () => {
    previewConfig.mockResolvedValue(result({ version: 9 }));
    renderWeek();
    fill();
    expect(
      await screen.findByText(/hours changed since you started/i, {}, WAIT)
    ).toBeInTheDocument();
  });
});

describe("the schedule editor previews before saving (F3.2)", () => {
  it("previews an edit across every date the schedule runs", async () => {
    render(
      withClient(
        <ScheduleEditorDrawer
          {...common}
          state={stateOf()}
          mode="edit"
          sourceScheduleId="regular"
          onStale={vi.fn()}
          onClose={vi.fn()}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
    expect(
      await screen.findByText("1 booking would fall outside these hours", {}, WAIT)
    ).toBeInTheDocument();
    expect(lastBody().scope.length).toBeGreaterThan(30);
    expect(screen.getByText(/party of 4/)).toBeInTheDocument();
  });
});

describe("Compare services previews before saving (F-X.3)", () => {
  it("previews the dates of every schedule with a changed row", async () => {
    render(withClient(<CompareServices {...common} onStale={vi.fn()} state={twoSchedules()} />));
    expect(previewConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: "Weeknight · Booking" }));
    fireEvent.click(screen.getByRole("option", { name: "Phone only" }));
    expect(
      await screen.findByText("1 booking would fall outside these hours", {}, WAIT)
    ).toBeInTheDocument();
    expect(lastBody().draft.changes.upsert.scheduleServices).toHaveLength(1);
    expect(lastBody().scope.length).toBeGreaterThan(0);
  });
});

describe("Use schedule previews before saving (F-MS)", () => {
  it("previews the chosen schedule over the selected dates", async () => {
    render(
      withClient(
        <UseScheduleDialog
          open
          venueId="venue-1"
          state={twoSchedules()}
          timezone="America/Los_Angeles"
          dates={["2026-11-02", "2026-11-09"]}
          onClose={vi.fn()}
          onFinished={vi.fn()}
          onStale={vi.fn()}
        />
      )
    );
    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText("1 booking would fall outside these hours", {}, WAIT)
    ).toBeInTheDocument();
    await waitFor(() => expect(lastBody().scope).toEqual(["2026-11-02", "2026-11-09"]), WAIT);
    expect(lastBody().draft.scopeConflicts).toBe("replace");
  });
});
