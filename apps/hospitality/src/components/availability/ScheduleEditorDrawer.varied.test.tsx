import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { applyChanges } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
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
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

import { ScheduleEditorDrawer } from "./ScheduleEditorDrawer.js";
import { buildRegularWeekChanges } from "./schedule-changes.js";
import { demoDraft } from "./quick-setup-demo.fixture.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const common = { venueId: "venue-1", timezone: "America/Los_Angeles", today: "2026-10-25" };
const NOW = "2026-10-25T00:00:00.000Z";

function openEdit(config: AvailabilityConfig, scheduleId: string) {
  return render(
    <main>
      <ScheduleEditorDrawer
        {...common}
        state={{ config, version: 8, source: "rows" }}
        mode="edit"
        sourceScheduleId={scheduleId}
        onStale={vi.fn()}
        onClose={vi.fn()}
      />
    </main>
  );
}

const lateBlock = () => screen.getByRole("group", { name: "Dinner: different hours" });
const ticked = (scope: HTMLElement) =>
  within(scope)
    .getAllByRole("checkbox")
    .filter((c) => (c as HTMLInputElement).checked)
    .map((c) => c.getAttribute("aria-label") ?? c.closest("label")?.textContent);

describe("New and Edit schedule use the quick-setup rows", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("saves one service Mon–Fri with different Friday hours, and Edit schedule reopens the same rows", async () => {
    const config = fixtureConfig();
    render(
      <main>
        <ScheduleEditorDrawer
          {...common}
          state={{ config, version: 7, source: "rows" }}
          mode="new"
          onStale={vi.fn()}
          onClose={vi.fn()}
        />
      </main>
    );
    fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Late Fridays" } });
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
    fireEvent.click(screen.getByRole("button", { name: "Different hours on some days" }));
    fireEvent.click(within(lateBlock()).getByRole("checkbox", { name: "Fri" }));
    fireEvent.click(within(lateBlock()).getByLabelText("Closes"));
    fireEvent.click(screen.getByRole("option", { name: "11:00 PM" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    const changes = save.mock.calls[0]?.[0].body.changes as AvailabilityConfigChanges;
    const [row] = changes.upsert.scheduleServices ?? [];
    expect(row?.dayHours.sets.map((s) => s.weekdays)).toEqual([[5]]);
    expect(row?.dayHours.sets[0]?.closesAt).toBe(1380);

    cleanup();
    const saved = applyChanges(config, changes, NOW);
    const id = changes.upsert.schedules?.[0]?.id ?? "";
    openEdit(saved, id);
    expect(ticked(lateBlock())).toEqual(["Fri"]);
    // Saving what was opened changes nothing in the rows.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const again = save.mock.calls[1]?.[0].body.changes as AvailabilityConfigChanges;
    expect(again.upsert.scheduleServices).toEqual([row]);
  });

  it("opens a varied period saved from Change regular week with its sets intact", () => {
    const config = fixtureConfig();
    const changes = buildRegularWeekChanges({
      config,
      name: "Autumn",
      draft: demoDraft(),
      startsOn: "2026-11-02",
      endsOn: "2026-11-29",
      winner: "new",
      makeId: (() => {
        let n = 0;
        return () => `p-${++n}`;
      })(),
    });
    const saved = applyChanges(config, changes, NOW);
    openEdit(saved, changes.upsert.schedules?.[0]?.id ?? "");
    expect(screen.getAllByRole("button", { name: /^Remove service/ })).toHaveLength(3);
    expect(ticked(lateBlock())).toEqual(["Fri", "Sat"]);
  });
});
