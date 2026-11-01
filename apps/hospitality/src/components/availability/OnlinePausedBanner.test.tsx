import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

const reopen = vi.hoisted(() => vi.fn());
const saveConfig = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useClosures.js", () => ({
  useReopenClosure: () => ({ mutateAsync: reopen, isPending: false }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
}));

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
});
