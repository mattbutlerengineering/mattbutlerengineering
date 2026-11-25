import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import type { ClosureAlongside, ClosureImpact, DateRule } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: false }),
}));
vi.mock("../../hooks/useAvailability.js", () => ({
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
import { useSeriesGrowthSession } from "./use-series-growth-session.js";
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

type StepProps = {
  readonly venueId: string;
  readonly expectedVersion: number;
  readonly timezone: string;
  readonly today: string;
  readonly rule: DateRule;
  readonly alongside: ClosureAlongside;
  readonly impact: ClosureImpact;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onReload: () => Promise<void>;
  readonly onStale: (message: string) => void;
};

/** The step with the session `SeriesEditDialog` would give it. */
function Step(props: StepProps) {
  const { expectedVersion, rule, alongside, impact, onReload, onStale, onClose, ...rest } = props;
  const growth = { rule, alongside, impact, expectedVersion };
  const session = useSeriesGrowthSession({
    venueId: props.venueId,
    rules: fixtureConfig().dateRules,
    growth,
    refetch: onReload,
    reload: refresh,
    onLeave: onClose,
    onStale,
  });
  return (
    <>
      <SeriesGrowthStepTwo {...rest} growth={growth} session={session} />
      <LeaveSaveDialog attempts={session.attempts} />
    </>
  );
}

function renderStep(props: Partial<StepProps> = {}) {
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
          expectedVersion={7}
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

// Which refusal does what next is the session suite's (use-decisions-session.test.tsx); these pin
// the wiring: what is sent, and what the dialog does with the flow-supplied reactions.
describe("SeriesGrowthStepTwo wiring", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    create.mockReset();
    refresh.mockReset();
  });

  it("sends the pinned version, the plan and the chosen decisions", async () => {
    create.mockResolvedValue({ outcomes: { cancel: 2, move: 0, keep_notify: 0, keep_silent: 0 } });
    const { dialog, onClose } = renderStep();
    chooseCancelAndSave(dialog);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0]![0].body;
    expect(body.expectedVersion).toBe(7);
    expect(body.decisions[0].reservationIds).toEqual(["r1", "r2"]);
  });

  it("asks for the bookings again when a group changed, and the old choice is void", async () => {
    create.mockRejectedValue(refusal("decision-required", { groupKeys: [`${DATE}:closed`] }));
    const { dialog, onReload } = renderStep();
    chooseCancelAndSave(dialog);

    expect(
      await within(dialog).findByText(/bookings changed while you were deciding/i)
    ).toBeTruthy();
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Choose for each group" })).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Choose for each group" })
    ).toHaveAccessibleDescription(/each group/i);
  });

  it("refreshes the calendar and returns to step 1 on a version conflict", async () => {
    create.mockRejectedValue(refusal("version-conflict"));
    const { dialog, onStale } = renderStep();
    chooseCancelAndSave(dialog);

    await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalled();
    expect(onStale.mock.calls[0]![0]).toMatch(/Availability changed since you opened this/);
  });

  it("sends the series it replaces, and a refusal for a changed series opens the same recovery (#8028)", async () => {
    const replaces = { ...RULE, id: "series-1" };
    create.mockRejectedValue(refusal("version-conflict", { winningChange: null }));
    const { dialog, onStale } = renderStep({
      alongside: { upsert: [], remove: ["series-1"], replaces },
    });
    chooseCancelAndSave(dialog);

    await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0].body.alongside.replaces).toEqual(replaces);
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
      await within(dialog).findByText(/may have gone through/);
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
      await within(dialog).findByText(/may have gone through/);
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
      await within(dialog).findByText(/may have gone through/);
      refresh.mockClear();

      fireEvent.keyDown(document, { key: "Escape" });

      const ask = screen.getByRole("alertdialog", { name: "Leave this closure?" });
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(within(ask).getByRole("button", { name: "Leave" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("does not promise nothing changed on a 502, which may have committed (#7978)", async () => {
    create.mockRejectedValue(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Bad Gateway",
          status: 502,
          detail: "Bad gateway",
          code: "bad-gateway",
        } as never,
        "POST",
        "closures"
      )
    );
    const { dialog } = renderStep();
    chooseCancelAndSave(dialog);

    expect(await within(dialog).findByText(/may have gone through/)).toBeTruthy();
    expect(within(dialog).queryByText(/nothing was changed/)).toBeNull();
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
