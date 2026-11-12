import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";

/**
 * availability-hub C2.3: the layout owns Undo, so the offer outlives the child route that saved,
 * and the layout shows the bookings that block a refused one.
 */
const revert = vi.hoisted(() => vi.fn());
const venue = vi.hoisted(() => ({
  selectedVenueId: "venue-1",
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
}));

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: () => venue }));
vi.mock("../contexts/venue-context-object.js", () => ({ useOptionalVenue: () => venue }));
vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityConfig: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRevertAvailabilityChange: () => ({ mutateAsync: revert }),
}));
vi.mock("../hooks/useIsManager.js", () => ({
  useManagerAccess: () => ({ isManager: true, isPending: false }),
}));

import { StrandedRevertDialog } from "../components/availability/StrandedRevertDialog.js";
import { useAvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { AvailabilityLayout } from "./AvailabilityLayout.js";

const SAVED = { version: 8, changeId: "chg-8" };
const BLOCKED_TITLE = "These bookings would lose their service";

/** An editor: it saves, offers Undo through the layout, and goes back to another view. */
function Editor() {
  const { offerUndo } = useAvailabilityScope();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        offerUndo("Hours saved", SAVED);
        void navigate("/availability/closures");
      }}
    >
      Save hours
    </button>
  );
}

/** Today's page, which still mounts its own blocked-undo dialog. */
function TodaysPage() {
  const { offerUndo } = useAvailabilityScope();
  return (
    <>
      <button type="button" onClick={() => offerUndo("Hours saved", SAVED)}>
        Save hours
      </button>
      <StrandedRevertDialog />
    </>
  );
}

function renderLayout(initial: string) {
  const router = createMemoryRouter(
    [
      {
        path: "availability",
        element: <AvailabilityLayout />,
        children: [
          { path: "hours", element: <Editor /> },
          { path: "closures", element: <h1 tabIndex={-1}>Closures</h1> },
          { path: "calendar", element: <TodaysPage /> },
        ],
      },
    ],
    { initialEntries: [initial] }
  );
  return render(
    <ToastProvider>
      <main>
        <RouterProvider router={router} />
      </main>
    </ToastProvider>
  );
}

const refusal = () =>
  new ApiClientError(
    {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "x",
      code: "stranded-bookings",
      reservations: [
        {
          id: "res-okafor",
          startTime: "2026-10-31T01:30:00.000Z",
          partySize: 4,
          reason: "closed",
          guestName: "Okafor",
          serviceDate: "2026-10-30",
        },
      ],
    } as never,
    "POST",
    "/revert"
  );

/** Saves from the editor, which then leaves for another view. */
async function saveAndLeave() {
  renderLayout("/availability/hours");
  fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
  await screen.findByRole("heading", { name: "Closures" });
  expect(screen.queryByRole("button", { name: "Save hours" })).not.toBeInTheDocument();
}

describe("Undo on the Availability layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revert.mockResolvedValue({ version: 9, changeId: "chg-9" });
  });

  it("undoes a save after the child that saved has gone", async () => {
    await saveAndLeave();
    expect(await screen.findByText("Hours saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(revert).toHaveBeenCalledWith({
        venueId: "venue-1",
        changeId: "chg-8",
        expectedVersion: 8,
      })
    );
    expect(revert).toHaveBeenCalledTimes(1);
  });

  it("opens the blocked-undo dialog, with focus inside it, when the undo is refused", async () => {
    revert.mockRejectedValue(refusal());
    await saveAndLeave();
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    const dialog = await screen.findByRole("dialog", { name: BLOCKED_TITLE });
    expect(within(dialog).getByRole("link", { name: /Okafor/ })).toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("opens one dialog, not two, on today's page, which mounts its own", async () => {
    revert.mockRejectedValue(refusal());
    renderLayout("/availability/calendar");
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await screen.findByRole("dialog", { name: BLOCKED_TITLE });
    expect(screen.getAllByRole("dialog", { name: BLOCKED_TITLE })).toHaveLength(1);
  });
});
