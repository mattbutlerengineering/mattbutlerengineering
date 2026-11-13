import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { AvailabilityConfigChanges, AvailabilityConfigState } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
}));

import { fixtureConfig } from "./resolved-day-fixtures.js";
import { useScheduleSave } from "./use-schedule-save.js";

/**
 * `overwrite()` is not reachable from any form (availability-hub E4.3 review, pending the Owner):
 * these pin what it would send, so the decision is made on its real data outcome.
 */

const STATE: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };
const CHANGES: AvailabilityConfigChanges = {
  upsert: {},
  remove: { scheduleServices: ["ss-lunch"] },
};

const problem = (code: string, extra: Record<string, unknown> = {}) =>
  new ApiClientError({
    type: "about:blank",
    title: code,
    status: code === "invalid-config" ? 422 : 409,
    detail: "Server said no.",
    code,
    ...extra,
  } as never);

const winning = (id: string) => ({
  id,
  actorId: "auth0|ana",
  at: "2026-10-25T22:42:00.000Z",
  kind: "config",
  summary: "Brunch added",
});

/** A hook whose first save lost a race the 409 described with `extra`. */
async function refused(extra: Record<string, unknown>) {
  const onStale = vi.fn();
  const hook = renderHook(() => useScheduleSave(onStale));
  save.mockRejectedValueOnce(problem("version-conflict", extra));
  await act(async () => {
    expect(await hook.result.current.save("venue-1", STATE, CHANGES, "keep")).toBeNull();
  });
  return { ...hook, onStale };
}

describe("useScheduleSave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 9, changeId: "chg" });
  });

  it("keeps what the 409 said: the winning change, the changes since and the version", async () => {
    const changesSince = { total: 1, changes: [winning("chg-8")] };
    const { result, onStale } = await refused({
      currentVersion: 8,
      winningChange: winning("chg-8"),
      changesSince,
    });
    expect(save.mock.calls[0]![0].body.expectedVersion).toBe(7);
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(result.current.conflicted).toBe(true);
    expect(result.current.conflict).toEqual({
      winningChange: winning("chg-8"),
      changesSince,
      seen: 8,
      again: false,
    });
    expect(result.current.overwriteFailure).toEqual([]);
  });

  it("clearConflict forgets the conflict and its message", async () => {
    const { result } = await refused({ currentVersion: 8 });
    act(() => result.current.clearConflict());
    expect(result.current.conflict).toBeNull();
    expect(result.current.failure).toEqual([]);
  });

  describe("overwrite", () => {
    it("sends nothing when no save has been refused", async () => {
      const { result } = renderHook(() => useScheduleSave(vi.fn()));
      await act(async () => {
        expect(await result.current.overwrite("venue-1", CHANGES, "keep")).toBeNull();
      });
      expect(save).not.toHaveBeenCalled();
    });

    it("sends nothing when the 409 named no version to go against", async () => {
      const { result } = await refused({});
      await act(async () => {
        expect(await result.current.overwrite("venue-1", CHANGES, "keep")).toBeNull();
      });
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("sends the changes as given against the version the 409 named, and ends the conflict", async () => {
      const { result } = await refused({ currentVersion: 8 });
      await act(async () => {
        expect(await result.current.overwrite("venue-1", CHANGES, "replace")).toEqual({
          version: 9,
          changeId: "chg",
        });
      });
      expect(save.mock.calls[1]![0]).toEqual({
        venueId: "venue-1",
        body: { expectedVersion: 8, changes: CHANGES, scopeConflicts: "replace" },
      });
      expect(result.current.conflict).toBeNull();
    });

    it("meets a newer change as another conflict, marked as found by an Overwrite", async () => {
      const { result, onStale } = await refused({ currentVersion: 8 });
      save.mockRejectedValueOnce(
        problem("version-conflict", { currentVersion: 9, winningChange: winning("chg-9") })
      );
      await act(async () => {
        expect(await result.current.overwrite("venue-1", CHANGES, "keep")).toBeNull();
      });
      expect(onStale).toHaveBeenCalledTimes(2);
      expect(result.current.conflict).toEqual({
        winningChange: winning("chg-9"),
        seen: 9,
        again: true,
      });
      expect(result.current.overwriteFailure).toEqual([]);
    });

    it("keeps the conflict and says why when the server refuses the hours", async () => {
      const { result } = await refused({ currentVersion: 8 });
      save.mockRejectedValueOnce(
        problem("invalid-config", {
          issues: [
            { path: "scheduleServices.0", code: "overlap", message: "Lunch overlaps Dinner." },
          ],
        })
      );
      await act(async () => {
        expect(await result.current.overwrite("venue-1", CHANGES, "keep")).toBeNull();
      });
      expect(result.current.conflict?.seen).toBe(8);
      expect(result.current.overwriteFailure).toEqual(["Lunch overlaps Dinner."]);
    });
  });
});
