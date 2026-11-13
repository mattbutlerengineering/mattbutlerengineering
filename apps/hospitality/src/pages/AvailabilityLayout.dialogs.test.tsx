import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { useAvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { AvailabilityLayout } from "./AvailabilityLayout.js";

const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1",
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles" },
}));
const config = vi.hoisted(() => ({ data: undefined as unknown }));
const access = vi.hoisted(() => ({ isManager: true, isPending: false }));
const offer = vi.hoisted(() => vi.fn());
const closeProps = vi.hoisted(() => vi.fn());
const pauseProps = vi.hoisted(() => vi.fn());

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityConfig: () => ({ data: config.data, error: null, refetch: vi.fn() }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../hooks/useIsManager.js", () => ({ useManagerAccess: () => access }));
vi.mock("../hooks/useAvailabilityUndo.js", () => ({ useAvailabilityUndo: () => offer }));

interface StubProps {
  readonly onClose: () => void;
  readonly onSaved?: (...args: unknown[]) => void;
  readonly onSavedQuietly?: (saved: unknown, title: string) => void;
}
// The dialogs have their own suites; here each says it opened, and saves or leaves on a press.
vi.mock("../components/availability/CloseDialog.js", () => ({
  CloseDialog: (props: StubProps) => {
    closeProps(props);
    return (
      <div role="dialog" aria-label="Close stub">
        <button
          type="button"
          onClick={() => {
            props.onSavedQuietly?.({ changeId: "chg-1", version: 8 }, "Closed Sat, Dec 26");
            props.onSaved?.();
            props.onClose();
          }}
        >
          Save close
        </button>
        <button type="button" onClick={props.onClose}>
          Cancel close
        </button>
      </div>
    );
  },
}));
vi.mock("../components/availability/PauseOnlineDialog.js", () => ({
  PauseOnlineDialog: (props: StubProps & { today: string }) => {
    pauseProps(props);
    return (
      <div role="dialog" aria-label="Pause stub">
        <button
          type="button"
          onClick={() => {
            props.onSaved?.({ changeId: "chg-2", version: 9 }, "Online booking paused");
            props.onClose();
          }}
        >
          Save pause
        </button>
      </div>
    );
  },
}));

const STATE = {
  config: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
  version: 7,
  source: "rows",
} as unknown as AvailabilityConfigState;

const onSelectionSaved = vi.fn();
const MANY = Array.from({ length: 25 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);

/** A child that opens Close and Pause the way the hub and the calendar do. */
function Opener() {
  const { openClose, openPause } = useAvailabilityScope();
  return (
    <div>
      <button type="button" onClick={() => openClose({ kind: "venue" })}>
        Close or pause
      </button>
      <button
        type="button"
        onClick={() =>
          openClose(
            { kind: "dates", dates: ["2026-12-24", "2026-12-31"] },
            { onSaved: onSelectionSaved }
          )
        }
      >
        Close the selection
      </button>
      <button type="button" onClick={() => openClose({ kind: "dates", dates: MANY })}>
        Close 25 dates
      </button>
      <button type="button" onClick={openPause}>
        Pause
      </button>
    </div>
  );
}

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      { path: "setup", element: <div>Setup</div> },
      {
        path: "availability",
        element: <AvailabilityLayout />,
        children: [
          { index: true, element: <Opener /> },
          { path: "calendar", element: <Opener /> },
        ],
      },
    ],
    { initialEntries: ["/setup", url], initialIndex: 1 }
  );
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
  return router;
}
const address = (router: ReturnType<typeof renderAt>) =>
  `${router.state.location.pathname}${router.state.location.search}`;
const lastCloseProps = () => closeProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe("AvailabilityLayout: the Close and Pause host (C2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 20:00 UTC on Oct 28 is 13:00 in Los Angeles.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-28T20:00:00Z") });
    config.data = STATE;
    access.isManager = true;
    access.isPending = false;
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["venue", { initialDate: null }],
    ["tonight", { initialDate: null, startTonight: true }],
    ["2026-12-26", { initialDate: "2026-12-26" }],
    ["2027-01-04..2027-01-10", { initialRange: { from: "2027-01-04", to: "2027-01-10" } }],
    ["dates:2026-12-24,2026-12-31", { initialDates: ["2026-12-24", "2026-12-31"] }],
    ["section:sec-bar", { initialSectionId: "sec-bar" }],
  ])("opens Close prefilled for ?close=%s", async (target, expected) => {
    renderAt(`/availability?close=${target}`);
    expect(await screen.findByRole("dialog", { name: "Close stub" })).toBeInTheDocument();
    expect(lastCloseProps()).toMatchObject({
      venueId: "venue-1",
      today: "2026-10-28",
      ...expected,
    });
  });

  it("opens Pause for ?pause=1 on the service date", async () => {
    renderAt("/availability/calendar?pause=1");
    expect(await screen.findByRole("dialog", { name: "Pause stub" })).toBeInTheDocument();
    expect(pauseProps.mock.calls.at(-1)?.[0]).toMatchObject({ today: "2026-10-28" });
  });

  it.each(["?close=tonight", "?pause=1", "?close=2026-12-26&from=setup"])(
    "gives a Host no dialog for %s, and removes the param with a replace",
    async (search) => {
      access.isManager = false;
      const router = renderAt(`/availability${search}`);
      await vi.waitFor(() => expect(router.state.location.search).not.toMatch(/close|pause/));
      expect(router.state.historyAction).toBe("REPLACE");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(router.state.location.search).toBe(search.includes("from") ? "?from=setup" : "");
    }
  );

  it("opens nothing while the role is read, and keeps the param", () => {
    access.isManager = false;
    access.isPending = true;
    const router = renderAt("/availability?close=tonight");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(address(router)).toBe("/availability?close=tonight");
  });

  it.each(["nonsense", "section:", "2026-12-26..2026-12-24"])(
    "opens nothing for the unreadable ?close=%s, and removes it",
    async (target) => {
      const router = renderAt(`/availability?close=${target}&from=setup`);
      await vi.waitFor(() => expect(address(router)).toBe("/availability?from=setup"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
  );

  it("pushes the param from a child, and Back closes the dialog", async () => {
    const router = renderAt("/availability/calendar?tab=calendar");
    fireEvent.click(screen.getByRole("button", { name: "Close or pause" }));
    expect(address(router)).toBe("/availability/calendar?tab=calendar&close=venue");
    expect(await screen.findByRole("dialog", { name: "Close stub" })).toBeInTheDocument();
    await act(() => router.navigate(-1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(address(router)).toBe("/availability/calendar?tab=calendar");
  });

  it("goes back one entry after a save it opened, calls the child's onSaved and offers Undo", async () => {
    const router = renderAt("/availability");
    fireEvent.click(screen.getByRole("button", { name: "Close the selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save close" }));
    await vi.waitFor(() => expect(address(router)).toBe("/availability"));
    expect(onSelectionSaved).toHaveBeenCalledTimes(1);
    expect(offer).toHaveBeenCalledWith({
      venueId: "venue-1",
      title: "Closed Sat, Dec 26",
      saved: { changeId: "chg-1", version: 8 },
    });
    // No second copy of the view was left behind: Back leaves Availability.
    await act(() => router.navigate(-1));
    expect(address(router)).toBe("/setup");
  });

  it("removes the param with a replace when the dialog was loaded by its address", async () => {
    const router = renderAt("/availability?close=venue&from=setup");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel close" }));
    await vi.waitFor(() => expect(address(router)).toBe("/availability?from=setup"));
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("offers Undo for a pause through the layout", async () => {
    renderAt("/availability");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save pause" }));
    expect(offer).toHaveBeenCalledWith({
      venueId: "venue-1",
      title: "Online booking paused",
      saved: { changeId: "chg-2", version: 9 },
    });
  });

  it("opens a selection of more dates than an address holds on all of them", async () => {
    renderAt("/availability/calendar");
    fireEvent.click(screen.getByRole("button", { name: "Close 25 dates" }));
    expect(await screen.findByRole("dialog", { name: "Close stub" })).toBeInTheDocument();
    expect(lastCloseProps()).toMatchObject({ initialDates: MANY });
  });
});
