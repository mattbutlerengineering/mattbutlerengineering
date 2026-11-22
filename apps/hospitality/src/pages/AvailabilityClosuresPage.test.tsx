import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, ClosureSummary } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const reopen = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => vi.fn());
const summaries = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("../hooks/useNow.js", () => ({
  // 10:00 AM in Los Angeles on the fixture's today, Thursday Nov 12.
  useNow: () => new Date("2026-11-12T18:00:00Z"),
}));
vi.mock("../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({
    data: [{ id: "sec-patio", name: "Patio" }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: () => ({ data: [] }) }));
vi.mock("../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({
    data: summaries.value,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useClosureCallList: () => ({ data: [], isLoading: false, error: null }),
  useReopenClosure: () => ({ mutateAsync: reopen, isPending: false }),
  useRetryClosureRefunds: () => ({ mutateAsync: retry, isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClosureImpact: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useClosureImpacts: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateClosures: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { getConfig: vi.fn() } }),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { rule, TODAY, venue } from "../components/availability/hub/hub-rows-test-helpers.js";
import { AvailabilityClosuresPage } from "./AvailabilityClosuresPage.js";

const PAUSE = rule("r-pause", { targetKind: "booking", bookingTypes: ["online"], origin: "pause" });
const PATIO = rule("r-patio", {
  targetKind: "tables",
  sectionId: "sec-patio",
  tableIds: ["t-1"],
  startsOn: "2026-11-01",
  endsOn: null,
});
const THANKSGIVING = rule("r-nov-26", { startsOn: "2026-11-26", endsOn: "2026-11-26" });
const MONDAYS = rule("r-series", {
  startsOn: "2026-11-30",
  endsOn: "2027-01-25",
  repeat: { version: 1, weekdays: [1] },
});
const SKIP = rule("r-skip", {
  kind: "skip",
  seriesId: "r-series",
  startsOn: "2026-12-07",
  endsOn: "2026-12-07",
});
const NOV_1 = rule("r-nov-1", { startsOn: "2026-11-01", endsOn: "2026-11-01" });

const outcomes = (ruleId: string, rest: Partial<ClosureSummary> = {}): ClosureSummary => ({
  ruleId,
  total: 0,
  cancelled: 0,
  sent: 0,
  rebooked: 0,
  unreachable: 0,
  refundFailed: 0,
  refundFailures: [],
  refundPending: 0,
  ...rest,
});

const FULL = [PAUSE, PATIO, THANKSGIVING, MONDAYS, SKIP, NOV_1];

const stateOf = (config: AvailabilityConfig) => ({ config, version: 7, source: "rows" as const });
const refresh = vi.fn();
const offerUndo = vi.fn();

function scopeOf(rest: Partial<AvailabilityScope> = {}): AvailabilityScope {
  return {
    venueId: "venue-1",
    timezone: "America/Los_Angeles",
    today: TODAY,
    state: stateOf(venue(FULL)),
    load: "ready",
    loadError: null,
    isManager: true,
    rolePending: false,
    refresh,
    offerUndo,
    openClose: vi.fn(),
    openPause: vi.fn(),
    ...rest,
  };
}

function renderPage(scope: AvailabilityScope) {
  const routes = [
    {
      path: "availability",
      element: <Outlet context={scope} />,
      children: [
        { index: true, element: <div>Hub page</div> },
        { path: "closures", element: <AvailabilityClosuresPage /> },
      ],
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: ["/availability/closures"] });
  render(
    <ToastProvider>
      <main>
        <RouterProvider router={router} />
      </main>
    </ToastProvider>
  );
}

const rowOf = (text: string | RegExp) =>
  screen.getByRole("listitem", {
    name: (_, el) =>
      typeof text === "string"
        ? (el.textContent ?? "").includes(text)
        : text.test(el.textContent ?? ""),
  });

describe("AvailabilityClosuresPage", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    summaries.value = [
      outcomes("r-nov-26", { total: 16, sent: 12, rebooked: 3, unreachable: 1 }),
      outcomes("r-nov-1", { total: 2, refundFailed: 2 }),
    ];
    save.mockResolvedValue({ version: 8, changeId: "chg" });
    reopen.mockResolvedValue({ version: 8, changeId: "chg" });
    retry.mockResolvedValue({ enqueued: 2 });
  });
  afterEach(() => vi.clearAllMocks());

  it("is headed Closures and pauses, takes focus there, and links back to Availability", () => {
    renderPage(scopeOf());
    expect(screen.getByRole("heading", { level: 1, name: "Closures and pauses" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Back to Availability" })).toHaveAttribute(
      "href",
      "/availability"
    );
  });

  it("groups rows as Now, Upcoming, and Earlier with refunds still open", () => {
    renderPage(scopeOf());
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Now", "Upcoming", "Earlier, with refunds still open"]);
    expect(within(rowOf("Online booking paused")).getByText(/paused/i)).toBeInTheDocument();
    expect(rowOf("Patio closed")).toBeInTheDocument();
    expect(rowOf("Thu, Nov 26")).toBeInTheDocument();
    expect(within(rowOf("Sun, Nov 1")).getByText("Refund failed (2)")).toBeInTheDocument();
  });

  it("says what became of the bookings a closure touched", () => {
    renderPage(scopeOf());
    expect(
      within(rowOf("Thu, Nov 26")).getByText("Sent 12 · Rebooked 3 · Unreachable 1")
    ).toBeInTheDocument();
  });

  it("gives a Manager Edit and Reopen on a closure, and Resume (not Reopen) on a pause", () => {
    renderPage(scopeOf());
    const patio = within(rowOf("Patio closed"));
    expect(patio.getByRole("button", { name: /^Edit/ })).toBeInTheDocument();
    expect(patio.getByRole("button", { name: /^Reopen/ })).toBeInTheDocument();
    const pause = within(rowOf("Online booking paused"));
    expect(pause.getByRole("button", { name: "Resume online booking" })).toBeInTheDocument();
    expect(pause.queryByRole("button", { name: /^Reopen/ })).toBeNull();
    expect(pause.queryByRole("button", { name: /^Edit/ })).toBeNull();
  });

  it("gives a Host the list and Call list, and no Edit, Reopen, Resume or Retry", () => {
    renderPage(scopeOf({ isManager: false }));
    expect(
      within(rowOf("Thu, Nov 26")).getByRole("button", { name: /^Call list/ })
    ).toBeInTheDocument();
    for (const name of [/^Edit/, /^Reopen/, /^Resume/, /^Retry refunds/, /^Restore/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("resumes a pause after asking once", async () => {
    renderPage(scopeOf());
    fireEvent.click(screen.getByRole("button", { name: "Resume online booking" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Resume/ }));
    await waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
    expect(reopen.mock.calls[0]![0]).toMatchObject({ venueId: "venue-1", ruleId: "r-pause" });
  });

  it("restores a skipped Monday of a repeating closure", async () => {
    renderPage(scopeOf());
    const series = within(rowOf("every Mon"));
    expect(series.getByRole("button", { name: /^Edit dates/ })).toBeInTheDocument();
    fireEvent.click(series.getByRole("button", { name: "Restore Mon, Dec 7" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0].body.changes).toEqual({
      upsert: {},
      remove: { dateRules: ["r-skip"] },
    });
  });

  it("retries the refunds of an earlier closure", async () => {
    renderPage(scopeOf());
    fireEvent.click(within(rowOf("Sun, Nov 1")).getByRole("button", { name: "Retry refunds" }));
    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith({ venueId: "venue-1", ruleId: "r-nov-1" })
    );
  });

  it("says nothing is closed or paused when nothing is", () => {
    summaries.value = [];
    renderPage(scopeOf({ state: stateOf(venue([])) }));
    expect(screen.getByText("Nothing is closed or paused.")).toBeInTheDocument();
  });

  it("offers Retry when the config failed to load", () => {
    renderPage(scopeOf({ state: null, load: "error", loadError: "Offline" }));
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refresh).toHaveBeenCalled();
  });
});
