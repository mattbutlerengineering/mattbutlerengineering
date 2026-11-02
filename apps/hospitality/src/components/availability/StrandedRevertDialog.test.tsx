import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";

const revert = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useRevertAvailabilityChange: () => ({ mutateAsync: revert }),
}));
vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { StrandedRevertDialog } from "./StrandedRevertDialog.js";

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
          reason: "outside_service",
          guestName: "Okafor",
          serviceDate: "2026-10-30",
        },
        {
          id: "res-nameless",
          startTime: "2026-10-31T07:15:00.000Z",
          partySize: 2,
          reason: "closed",
          serviceDate: "2026-10-30",
        },
      ],
    } as never,
    "POST",
    "/revert"
  );

/** The surface that offers Undo; it can go while the toast stays. */
function Offerer() {
  const offerUndo = useAvailabilityUndo();
  return (
    <button
      type="button"
      onClick={() =>
        offerUndo({ venueId: "venue-1", title: "Saved", saved: { version: 8, changeId: "chg-8" } })
      }
    >
      Save it
    </button>
  );
}

function renderPage(host = true) {
  const tree = (withOfferer: boolean) => (
    <ToastProvider>
      <main>
        {withOfferer && <Offerer />}
        {host && <StrandedRevertDialog />}
      </main>
    </ToastProvider>
  );
  const utils = render(tree(true));
  return { ...utils, withoutOfferer: () => utils.rerender(tree(false)) };
}

describe("a refused Undo for stranded bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revert.mockRejectedValue(refusal());
  });

  it("names each booking with a link, outside the alert", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    const dialog = await screen.findByRole("dialog");
    const link = within(dialog).getByRole("link", { name: /Okafor/ });
    expect(link.getAttribute("href")).toMatch(/timeline\?date=2026-10-30&selected=res-okafor$/);
    expect(within(dialog).getByRole("link", { name: /^Guest ·/ })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Undoing this would leave existing bookings without service.");
    for (const alert of screen.queryAllByRole("alert")) {
      expect(within(alert).queryAllByRole("link")).toEqual([]);
    }
    const result = await axe(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it("still shows them when Undo is pressed after the surface that offered it has gone", async () => {
    const page = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    const undo = await screen.findByRole("button", { name: "Undo" });
    page.withoutOfferer();
    fireEvent.click(undo);

    expect(await screen.findByRole("link", { name: /Okafor/ })).toBeInTheDocument();
  });

  it("closes with its button", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    const dialog = await screen.findByRole("dialog");
    act(() => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("falls back to the sentence in a toast when no page is there to show the list", async () => {
    renderPage(false);
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    expect(
      await screen.findByText("Undoing this would leave existing bookings without service.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
