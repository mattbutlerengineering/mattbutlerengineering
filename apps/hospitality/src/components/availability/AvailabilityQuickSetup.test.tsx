import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState } from "@mbe/types";

const mutateAsync = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync }),
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast, dismiss: vi.fn() }),
}));

import { AvailabilityQuickSetup } from "./AvailabilityQuickSetup.js";

const EMPTY: AvailabilityConfigState = {
  config: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
  version: 4,
  source: "empty",
};

function setup() {
  const onStale = vi.fn();
  render(
    <main>
      <AvailabilityQuickSetup venueId="venue-1" state={EMPTY} onStale={onStale} />
    </main>
  );
  fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
  fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
  return { onStale };
}

function problem(status: number, code: string, detail: string) {
  return new ApiClientError(
    { type: "about:blank", title: code, status, detail, code } as never,
    "PUT",
    "/api/v1/venues/venue-1/availability/config"
  );
}

describe("AvailabilityQuickSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the regular week against the version it read and toasts the open days", async () => {
    mutateAsync.mockResolvedValue({ version: 5, changeId: "c1" });
    setup();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const call = mutateAsync.mock.calls[0]?.[0];
    expect(call).toMatchObject({ venueId: "venue-1", body: { expectedVersion: 4 } });
    expect(call.body.changes.upsert.schedules[0]).toMatchObject({ isRegular: true });
    expect(call.body.changes.upsert.scheduleServices[0]).toMatchObject({
      opensAt: 1020,
      lastSeatingAt: 1275,
      closesAt: 1320,
    });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/^Bookings are open Mon, Tue, Wed, Thu,? and Fri$/),
        })
      )
    );
  });

  it("explains a lost race, refetches the version, and keeps the values", async () => {
    mutateAsync.mockRejectedValue(problem(409, "version-conflict", "Version conflict"));
    const { onStale } = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Someone else just changed availability/
    );
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Service name")).toHaveValue("Dinner");
  });

  it("shows the house sentence for a server error and does not toast", async () => {
    mutateAsync.mockRejectedValue(problem(500, "server-error", "boom"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(/reservations service hit a snag/);
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
