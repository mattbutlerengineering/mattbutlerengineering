import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState, ClosureImpact, DateRule } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: false }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => refresh }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { LeaveSaveDialog } from "./LeaveSaveDialog.js";
import { SeriesGrowthStepTwo } from "./SeriesGrowthStepTwo.js";
import { useSaveAttempts } from "./use-save-attempts.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const DATE = "2026-12-24";
const RULE: DateRule = {
  id: "new-rule",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-12-01",
  endsOn: "2027-03-31",
  repeat: { version: 1, weekdays: [4] },
};
const impactOf = (ids: readonly string[]): ClosureImpact => ({
  reservations: ids.length,
  covers: ids.length * 4,
  depositsHeld: 0,
  groups: [
    {
      groupKey: `${DATE}:closed`,
      date: DATE,
      kind: "closed",
      covers: ids.length * 4,
      depositsHeld: 0,
      reservations: ids.map((id) => ({
        id,
        startTime: `${DATE}T17:30:00Z`,
        endTime: `${DATE}T19:00:00Z`,
        partySize: 4,
        guestName: id,
        deposit: null,
        runsIntoClosure: false,
      })),
    },
  ],
});

const refusal = (code: string, extra: Record<string, unknown> = {}) =>
  new ApiClientError(
    {
      type: "about:blank",
      title: code,
      status: code === "version-conflict" ? 409 : 422,
      detail: "Refused.",
      code,
      ...extra,
    } as never,
    "POST",
    "closures"
  );

type StepProps = Omit<React.ComponentProps<typeof SeriesGrowthStepTwo>, "attempts">;

/** The step with the attempts `SeriesEditDialog` would give it. */
function Step(props: StepProps) {
  const attempts = useSaveAttempts(props.state.config.dateRules, {
    firstRuleId: props.rule.id,
    reload: refresh,
    onLeave: props.onClose,
  });
  return (
    <>
      <SeriesGrowthStepTwo {...props} attempts={attempts} />
      <LeaveSaveDialog attempts={attempts} />
    </>
  );
}

function renderStep(props: Partial<StepProps> = {}) {
  const state: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };
  const handlers = {
    onBack: vi.fn(),
    onClose: vi.fn(),
    onReload: vi.fn().mockResolvedValue(undefined),
    onStale: vi.fn(),
  };
  render(
    <ToastProvider>
      <main>
        <Step
          venueId="venue-1"
          state={state}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          rule={RULE}
          alongside={{ upsert: [], remove: [] }}
          impact={impactOf(["r1", "r2"])}
          {...handlers}
          {...props}
        />
      </main>
    </ToastProvider>
  );
  return { ...handlers, dialog: screen.getByRole("dialog") };
}

const chooseCancelAndSave = (dialog: HTMLElement) => {
  fireEvent.click(within(dialog).getByRole("radio", { name: /Cancel, notify & refund/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: /Close and cancel/ }));
};

describe("SeriesGrowthStepTwo refusals", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    create.mockReset();
    refresh.mockReset();
  });

  it("drops stale choices and reloads the bookings when a group changed", async () => {
    create.mockRejectedValue(refusal("decision-required", { groupKeys: [`${DATE}:closed`] }));
    const { dialog, onReload } = renderStep();
    chooseCancelAndSave(dialog);

    expect(
      await within(dialog).findByText(/bookings changed while you were deciding/i)
    ).toBeTruthy();
    expect(onReload).toHaveBeenCalledTimes(1);
    // The old choice is void: the Manager decides again on the fresh group.
    expect(within(dialog).getByRole("button", { name: "Choose for each group" })).toBeDisabled();
  });

  it("sends the reservation ids it was given after a reload, never the old ones", async () => {
    create.mockRejectedValueOnce(refusal("decision-required"));
    const { dialog } = renderStep();
    chooseCancelAndSave(dialog);
    await within(dialog).findByText(/bookings changed while you were deciding/i);
    create.mockResolvedValue({ outcomes: { cancel: 3, move: 0, keep_notify: 0, keep_silent: 0 } });
    chooseCancelAndSave(dialog);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]![0].body.decisions[0].reservationIds).toEqual(["r1", "r2"]);
  });

  it("refreshes the calendar and returns to step 1 on a version conflict", async () => {
    create.mockRejectedValue(refusal("version-conflict"));
    const { dialog, onStale } = renderStep();
    chooseCancelAndSave(dialog);

    await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalled();
    expect(onStale.mock.calls[0]![0]).toMatch(/Availability changed since you opened this/);
  });

  describe("a save whose response was lost", () => {
    const lost = () => new TypeError("Failed to fetch");
    const SAVED = { ruleId: "r", outcomes: { cancel: 2, move: 0, keep_notify: 0, keep_silent: 0 } };

    it("retries an unchanged choice under the same key and rule, which replays the truth", async () => {
      create.mockRejectedValueOnce(lost()).mockResolvedValueOnce(SAVED);
      const { dialog } = renderStep();
      chooseCancelAndSave(dialog);
      await within(dialog).findByText(/Can't reach/);
      fireEvent.click(within(dialog).getByRole("button", { name: /Close and cancel/ }));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      const [first, second] = create.mock.calls.map((c) => c[0]);
      expect(second.idempotencyKey).toBe(first.idempotencyKey);
      expect(second.body.rule.id).toBe(first.body.rule.id);
    });

    it("sends a changed choice as a new attempt, never a replay of the old one", async () => {
      create.mockRejectedValueOnce(lost()).mockRejectedValueOnce(refusal("version-conflict"));
      const { dialog } = renderStep();
      chooseCancelAndSave(dialog);
      await within(dialog).findByText(/Can't reach/);
      fireEvent.click(within(dialog).getByRole("radio", { name: "Keep them and notify" }));
      fireEvent.click(within(dialog).getByRole("button", { name: /Close and keep/ }));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      const [first, second] = create.mock.calls.map((c) => c[0]);
      expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
      expect(second.body.rule.id).not.toBe(first.body.rule.id);
    });

    it("warns and reloads when the Manager leaves after it", async () => {
      create.mockRejectedValueOnce(lost());
      const { dialog, onClose } = renderStep();
      chooseCancelAndSave(dialog);
      await within(dialog).findByText(/Can't reach/);
      refresh.mockClear();

      fireEvent.keyDown(document, { key: "Escape" });

      const ask = screen.getByRole("dialog", { name: "Leave this closure?" });
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(within(ask).getByRole("button", { name: "Leave" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("refreshes and says the closure was already saved when the attempt had committed", async () => {
    create.mockRejectedValue(refusal("closure-exists"));
    const { dialog } = renderStep();
    chooseCancelAndSave(dialog);

    expect(await within(dialog).findByText(/already saved/i)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: /Close and cancel|Choose/ })).toBeDisabled();
  });
});
