import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigChanges, PreviewResult } from "@mbe/types";

const previewConfig = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ availability: { previewConfig } }),
}));
// useVenueFormat reads the venue through useOptionalVenue; without it times fall back to the
// machine's zone, which passes on a Pacific laptop and fails on a UTC runner.
vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { AvailabilityGuestPreview } from "./AvailabilityGuestPreview.js";

const FOCUS = "2026-10-30";
const DEBOUNCE = 400;

const CHANGES_A: AvailabilityConfigChanges = { upsert: {}, remove: {} };
const CHANGES_B: AvailabilityConfigChanges = { upsert: {}, remove: { scheduleServices: ["x"] } };

function result(overrides: Partial<PreviewResult> = {}): PreviewResult {
  return {
    version: 4,
    days: [{ serviceDate: FOCUS, added: [1185, 1200, 1215], removed: [1350, 1365] }],
    focusDay: {
      serviceDate: FOCUS,
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
    stranded: { total: 0, offset: 0, items: [] },
    ...overrides,
  };
}

function timeout() {
  return new ApiClientError({
    type: "about:blank",
    title: "Preview timed out",
    status: 503,
    detail: "Took too long.",
    code: "preview-timeout",
  } as never);
}

let client: QueryClient;

function tree(changes: AvailabilityConfigChanges, dates: string[] = [FOCUS]) {
  return (
    <QueryClientProvider client={client}>
      <main>
        <AvailabilityGuestPreview
          venueId="venue-1"
          changes={changes}
          scopeConflicts="keep"
          dates={dates}
          focusDate={FOCUS}
        />
      </main>
    </QueryClientProvider>
  );
}

/** The preview's polite live region (not `role="status"`, which the selection bar owns on the page). */
function liveRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>("[aria-live=polite]");
  if (!region) throw new Error("no live region");
  return region;
}

/** Waits out the debounce; results are then awaited with findBy. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE + 50));
  });
}

describe("AvailabilityGuestPreview", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    previewConfig.mockReset();
    previewConfig.mockResolvedValue(result());
  });

  it("sends the draft, scope and focus date after the debounce and shows what changes", async () => {
    render(tree(CHANGES_A, [FOCUS, "2026-11-06"]));
    expect(previewConfig).not.toHaveBeenCalled();
    await settle();
    expect(previewConfig).toHaveBeenCalledTimes(1);
    expect(previewConfig).toHaveBeenCalledWith("venue-1", {
      draft: { changes: CHANGES_A, scopeConflicts: "keep" },
      scope: [FOCUS, "2026-11-06"],
      focusDate: FOCUS,
    });
    expect(await screen.findByText("3 times added · 2 removed")).toBeInTheDocument();
    expect(await screen.findByText("Dinner 5:00 PM – 11:00 PM")).toBeInTheDocument();
    // Marks carry text, not just a sign.
    expect(await screen.findByText("7:45 PM added")).toBeInTheDocument();
    expect(await screen.findByText("10:30 PM removed")).toBeInTheDocument();
  });

  it("updates on edit: the request waits out the debounce and the new result replaces the old", async () => {
    const { rerender } = render(tree(CHANGES_A));
    await settle();
    previewConfig.mockResolvedValue(
      result({ days: [{ serviceDate: FOCUS, added: [], removed: [1350] }] })
    );
    rerender(tree(CHANGES_B));
    expect(previewConfig).toHaveBeenCalledTimes(1);
    await settle();
    expect(previewConfig).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("0 times added · 1 removed")).toBeInTheDocument();
    expect(screen.queryByText("7:45 PM added")).not.toBeInTheDocument();
  });

  it("keeps the last good result on a 503 and says the preview is slow, with a retry", async () => {
    const { rerender } = render(tree(CHANGES_A));
    await settle();
    previewConfig.mockRejectedValueOnce(timeout());
    rerender(tree(CHANGES_B));
    await settle();
    expect(await screen.findByText("Preview is taking longer than usual")).toBeInTheDocument();
    expect(await screen.findByText("3 times added · 2 removed")).toBeInTheDocument();
    previewConfig.mockResolvedValue(
      result({ days: [{ serviceDate: FOCUS, added: [1185], removed: [] }] })
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(await screen.findByText("1 time added · 0 removed")).toBeInTheDocument();
    expect(screen.queryByText("Preview is taking longer than usual")).not.toBeInTheDocument();
  });

  it("says the preview is unavailable on any other failure, and saving stays possible", async () => {
    previewConfig.mockRejectedValue(new Error("boom"));
    render(tree(CHANGES_A));
    await settle();
    expect(await screen.findByText("Preview unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(await screen.findByText(/You can still save/)).toBeInTheDocument();
  });

  it("lists stranded bookings from the whole scope, not just the focus date", async () => {
    previewConfig.mockResolvedValue(
      result({
        stranded: {
          total: 8,
          offset: 0,
          items: [
            {
              id: "r1",
              startTime: "2026-10-31T05:30:00.000Z",
              partySize: 4,
              reason: "outside_service",
            },
            { id: "r2", startTime: "2026-11-07T06:45:00.000Z", partySize: 2, reason: "closed" },
          ],
        },
      })
    );
    render(tree(CHANGES_A, [FOCUS, "2026-11-06"]));
    await settle();
    expect(
      await screen.findByText("8 bookings would fall outside these hours")
    ).toBeInTheDocument();
    expect(await screen.findByText(/Fri, Oct 30.*10:30 PM.*party of 4/)).toBeInTheDocument();
    expect(await screen.findByText(/Fri, Nov 6.*10:45 PM.*party of 2/)).toBeInTheDocument();
    expect(await screen.findByText("plus 6 more on later dates in scope")).toBeInTheDocument();
  });

  it("says there are no times on the date, with the reason, when the draft leaves no service", async () => {
    previewConfig.mockResolvedValue(
      result({
        days: [{ serviceDate: FOCUS, added: [], removed: [1185, 1200] }],
        focusDay: { ...result().focusDay, label: "Closed", serviceCount: 0, services: [] },
      })
    );
    render(tree(CHANGES_A));
    await settle();
    expect(await screen.findByText("No times on this date")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("0 times added · 2 removed")).toBeInTheDocument();
  });

  it("keeps the live region mounted so the first result and errors are announced", async () => {
    render(tree(CHANGES_A));
    const region = liveRegion();
    expect(region).toBeInTheDocument();
    await settle();
    expect(await screen.findByText("3 times added · 2 removed")).toBeInTheDocument();
    expect(liveRegion()).toBe(region);
    expect(region).toHaveTextContent("3 times added · 2 removed");
  });

  it("puts the slow message in the live region", async () => {
    previewConfig.mockRejectedValue(timeout());
    render(tree(CHANGES_A));
    await settle();
    expect(await screen.findByText("Preview is taking longer than usual")).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent("Preview is taking longer than usual");
  });

  it("adds how many reservations are affected to the summary", async () => {
    previewConfig.mockResolvedValue(
      result({
        stranded: {
          total: 2,
          offset: 0,
          items: [
            { id: "r1", startTime: "2026-10-31T05:30:00.000Z", partySize: 4, reason: "closed" },
            { id: "r2", startTime: "2026-10-31T06:30:00.000Z", partySize: 2, reason: "closed" },
          ],
        },
      })
    );
    render(tree(CHANGES_A));
    await settle();
    expect(
      await screen.findByText("3 times added · 2 removed · 2 reservations affected")
    ).toBeInTheDocument();
  });

  it("lets staff move the preview to another date in scope", async () => {
    render(tree(CHANGES_A, [FOCUS, "2026-10-31", "2026-11-01"]));
    await settle();
    await screen.findByText("3 times added · 2 removed");
    const group = screen.getByRole("radiogroup", { name: "Preview date" });
    expect(group).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /31/ }));
    await settle();
    expect(previewConfig).toHaveBeenLastCalledWith(
      "venue-1",
      expect.objectContaining({ focusDate: "2026-10-31" })
    );
  });

  it("keeps showing the date a result was computed for until the picked date's result lands", async () => {
    render(tree(CHANGES_A, [FOCUS, "2026-10-31"]));
    await settle();
    await screen.findByText("3 times added · 2 removed");
    let resolveNext: (value: PreviewResult) => void = () => undefined;
    previewConfig.mockImplementation(
      () => new Promise<PreviewResult>((resolve) => (resolveNext = resolve))
    );
    fireEvent.click(screen.getByRole("radio", { name: /31/ }));
    await settle();
    expect(previewConfig).toHaveBeenCalledTimes(2);
    // The old result is for Oct 30; it must not be read against Oct 31.
    expect(liveRegion()).toHaveTextContent("3 times added · 2 removed");
    expect(liveRegion()).not.toHaveTextContent("0 times added");
    expect(screen.getByText("7:45 PM added")).toBeInTheDocument();
    const next = result({
      days: [{ serviceDate: "2026-10-31", added: [], removed: [1350] }],
      focusDay: { ...result().focusDay, serviceDate: "2026-10-31" },
    });
    await act(async () => resolveNext(next));
    expect(await screen.findByText("0 times added · 1 removed")).toBeInTheDocument();
  });

  it("shows no date strip for a one-date scope", async () => {
    render(tree(CHANGES_A));
    await settle();
    await screen.findByText("3 times added · 2 removed");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    previewConfig.mockResolvedValue(result());
    const { container } = render(tree(CHANGES_A));
    await screen.findByText("3 times added · 2 removed", undefined, { timeout: 2000 });
    const { violations } = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(violations).toEqual([]);
  });
});
