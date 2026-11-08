import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
}));

import { demoDraft } from "./quick-setup-demo.fixture.js";
import { draftToConfig } from "./quick-setup-draft.js";
import { useRegularWeekEdit } from "./use-regular-week-edit.js";

const TODAY = "2026-10-25";

function demoState(): AvailabilityConfigState {
  let n = 0;
  const config: AvailabilityConfig = draftToConfig(demoDraft(), () => `demo-${++n}`);
  return { config, version: 7, source: "rows" };
}

function setup(extra: Partial<Parameters<typeof useRegularWeekEdit>[0]> = {}) {
  const state = demoState();
  const onSaved = vi.fn();
  const hook = renderHook(() =>
    useRegularWeekEdit({
      venueId: "venue-1",
      state,
      onStale: vi.fn(),
      onSaved,
      ...extra,
    })
  );
  return { ...hook, onSaved, state };
}

describe("useRegularWeekEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("with fixedStart the start is set, never required and never an edit", () => {
    const { result } = setup({ fixedStart: TODAY });
    expect(result.current.startsOn).toBe(TODAY);
    expect(result.current.endsOn).toBeNull();
    expect(result.current.block).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it("without fixedStart a save needs a start, and picking one is an edit", () => {
    const { result } = setup();
    expect(result.current.block).toBe("startRequired");
    expect(result.current.dirty).toBe(false);
    act(() => result.current.setStartsOn("2026-11-06"));
    expect(result.current.block).toBeNull();
    expect(result.current.dirty).toBe(true);
  });

  it("submit() with fixedStart sends what the drawer sends for Starting = today", async () => {
    const pinned = setup({ fixedStart: TODAY });
    await act(() => pinned.result.current.submit());
    const picked = setup();
    act(() => picked.result.current.setStartsOn(TODAY));
    await act(() => picked.result.current.submit());

    expect(save).toHaveBeenCalledTimes(2);
    // Fresh ids per save: compare the payload's shape, with ids blanked.
    const shape = (call: number) =>
      JSON.parse(
        JSON.stringify(save.mock.calls[call]![0]).replace(/"[0-9a-f]{8}-[0-9a-f-]{27}"/g, '"<id>"')
      );
    expect(shape(0)).toEqual(shape(1));
    expect(save.mock.calls[0]![0].body.scopeConflicts).toBe(
      save.mock.calls[1]![0].body.scopeConflicts
    );
    expect(pinned.onSaved).toHaveBeenCalledTimes(1);
  });

  it("initialDraft replaces the saved week as the draft and counts as dirty", () => {
    const full = demoDraft();
    const initialDraft = { ...full, services: full.services.slice(0, 1) };
    const { result } = setup({ initialDraft });
    expect(result.current.draft).toBe(initialDraft);
    expect(result.current.startsOn).toBeNull();
    expect(result.current.dirty).toBe(true);
  });

  it("an initialDraft equal to the saved week is not dirty", async () => {
    const same = setup();
    const { result } = setup({ initialDraft: same.result.current.draft });
    await waitFor(() => expect(result.current.dirty).toBe(false));
  });
});
