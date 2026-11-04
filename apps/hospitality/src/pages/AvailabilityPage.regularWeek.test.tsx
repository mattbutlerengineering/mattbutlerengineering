import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, VenueTeam } from "@mbe/types";
import { DEMO_WEEK_CONFIG } from "../utils/demo-week.fixture.js";

/** The calendar's regular-week line (ux.md F-CAL), through the real page with the config read faked. */
const read = vi.hoisted(() => ({
  config: null as unknown,
  source: "rows" as "rows" | "empty" | "legacy",
  migrated: false,
}));
const team = vi.hoisted(() => ({ value: undefined as Partial<VenueTeam> | undefined }));
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1" as string | null,
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
}));

vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityDays: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useAvailabilityConfig: () => ({
    data: {
      config: read.config,
      version: 1,
      source: read.source,
      ...(read.migrated ? { migrated: true } : {}),
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSaveAvailabilityConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
  AVAILABILITY_CONFIG_QUERY_KEY: "availabilityConfig",
  AVAILABILITY_DAYS_QUERY_KEY: "availabilityDays",
}));
vi.mock("../hooks/useClosures.js", () => ({
  useClosureImpact: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../components/availability/AvailabilityQuickSetup.js", () => ({
  AvailabilityQuickSetup: () => <section aria-label="Quick setup" />,
}));
vi.mock("../components/availability/AvailabilityHistoryDrawer.js", () => ({
  AvailabilityHistoryDrawer: () => null,
}));
vi.mock("../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({ data: team.value, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: vi.fn() }),
}));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => venue,
}));

import { AvailabilityPage } from "./AvailabilityPage.js";

function renderPage() {
  return render(
    <ToastProvider>
      <main>
        <AvailabilityPage />
      </main>
    </ToastProvider>
  );
}

describe("AvailabilityPage regular-week line", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-04T20:00:00Z") });
    read.config = DEMO_WEEK_CONFIG;
    read.source = "rows";
    read.migrated = false;
    team.value = { viewerRole: "manager" };
  });

  it.each(["manager", "host"] as const)("shows a %s the week as one line", (viewerRole) => {
    team.value = { viewerRole };
    renderPage();
    expect(
      screen.getByText(
        "Regular week: Lunch Mon–Fri · Dinner Tue–Sun, later Fri–Sat · Brunch Sat–Sun"
      )
    ).toBeInTheDocument();
  });

  it("opens Details to seven weekdays, and lists no schedule or assignment", () => {
    renderPage();
    const toggle = screen.getByRole("button", { name: "Details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const rows = within(screen.getByRole("list", { name: "Regular week" })).getAllByRole(
      "listitem"
    );
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("MondayLunch 11:30 AM – 2:00 PM");
    expect(rows[4]).toHaveTextContent("Dinner 5:00 PM – 10:00 PM");
    expect(screen.queryByText("demo-regular")).not.toBeInTheDocument();
  });

  it("has no Details for a uniform week", () => {
    const uniform: AvailabilityConfig = {
      ...DEMO_WEEK_CONFIG,
      venueServices: [DEMO_WEEK_CONFIG.venueServices[1]!],
      scheduleServices: [
        {
          ...DEMO_WEEK_CONFIG.scheduleServices[1]!,
          weekdays: [],
          dayHours: { version: 1, sets: [] },
        },
      ],
    };
    read.config = uniform;
    renderPage();
    expect(screen.getByText("Regular week: Dinner every day")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
  });
});
