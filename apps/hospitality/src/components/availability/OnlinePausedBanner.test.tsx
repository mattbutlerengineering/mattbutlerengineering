import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

const reopen = vi.hoisted(() => vi.fn());
const saveConfig = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => refresh }));
vi.mock("../../hooks/useClosures.js", () => ({
  useReopenClosure: () => ({ mutateAsync: reopen, isPending: false }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
}));

import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { OnlinePausedBanner } from "./OnlinePausedBanner.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const pause = (bookingTypes: DateRule["bookingTypes"]): DateRule => ({
  id: "pause-1",
  kind: "closure",
  targetKind: "booking",
  bookingTypes,
  startsOn: "2026-12-01",
  endsOn: null,
});

function renderBanner(rule: DateRule) {
  const state: AvailabilityConfigState = {
    config: fixtureConfig(rule),
    version: 7,
    source: "rows",
  };
  render(
    <ToastProvider>
      <main>
        <OnlinePausedBanner venueId="venue-1" state={state} rule={rule} canResume />
      </main>
    </ToastProvider>
  );
}

describe("OnlinePausedBanner Resume (#7978)", () => {
  beforeEach(() => {
    reopen.mockReset().mockResolvedValue({ version: 8, changeId: "c" });
    saveConfig.mockReset().mockResolvedValue({ version: 8, changeId: "c" });
  });

  it("removes the whole pause when online is its only channel", async () => {
    renderBanner(pause(["online"]));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
    expect(reopen.mock.calls[0]![0]).toMatchObject({ ruleId: "pause-1" });
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("keeps phone and waitlist paused when the pause also covered them", async () => {
    renderBanner(pause(["online", "phone", "waitlist"]));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    const { body } = saveConfig.mock.calls[0]![0];
    expect(body.expectedVersion).toBe(7);
    expect(body.changes.upsert.dateRules).toEqual([
      expect.objectContaining({ id: "pause-1", bookingTypes: ["phone", "waitlist"] }),
    ]);
    expect(reopen).not.toHaveBeenCalled();
    expect(await screen.findByText("Online booking resumed")).toBeTruthy();
  });

  it("reloads on a version conflict, so a retry is not stuck on the same version", async () => {
    saveConfig.mockRejectedValue(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "Availability changed since you loaded it.",
          code: "version-conflict",
        } as never,
        "PUT",
        "config"
      )
    );
    refresh.mockClear();
    renderBanner(pause(["online", "phone"]));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not reload on a failure that says nothing about the version", async () => {
    saveConfig.mockRejectedValue(new TypeError("Failed to fetch"));
    refresh.mockClear();
    renderBanner(pause(["online", "phone"]));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByText(/Can't reach/)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("OnlinePausedBanner for a pause waiting for its time (#8032)", () => {
  const fromSix: DateRule = {
    ...pause(["online"]),
    startsOn: "2026-11-13",
    window: { version: 1, from: 18 * 60, to: 2880 },
  };
  const VENUE = {
    selectedVenue: { id: "venue-1", ianaTimezone: "America/New_York", currencyCode: "USD" },
  } as VenueContextValue;
  const renderAt = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    render(
      <VenueContext.Provider value={VENUE}>
        <ToastProvider>
          <main>
            <OnlinePausedBanner
              venueId="venue-1"
              state={{ config: fixtureConfig(fromSix), version: 7, source: "rows" }}
              rule={fromSix}
              canResume
            />
          </main>
        </ToastProvider>
      </VenueContext.Provider>
    );
  };
  beforeEach(() => {
    reopen.mockReset().mockResolvedValue({ version: 8, changeId: "c" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says when it starts, and offers its removal, the morning after", async () => {
    renderAt("2026-11-14T10:00:00-05:00"); // Saturday, 10:00 AM at the venue
    expect(screen.getByText(/pauses from 6:00 PM each day/)).toBeTruthy();
    expect(screen.queryByText("Online booking paused")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove pause" }));

    await waitFor(() =>
      expect(reopen).toHaveBeenCalledWith({
        venueId: "venue-1",
        ruleId: "pause-1",
        tellCancelledGuests: false,
      })
    );
    expect(await screen.findByText("Online booking pause removed")).toBeTruthy();
  });

  it("reads as paused once its time has come", () => {
    renderAt("2026-11-14T19:00:00-05:00");
    expect(screen.getByText("Online booking paused")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });
});
