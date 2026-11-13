import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import { GUEST_MESSAGE_MAX_LENGTH, type AvailabilityConfigState } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const offerUndo = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: false }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => refresh }));
vi.mock("../../hooks/useAvailabilityUndo.js", () => ({ useAvailabilityUndo: () => offerUndo }));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { PauseOnlineDialog, type PauseOnlineDialogProps } from "./PauseOnlineDialog.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const TODAY = "2026-12-01";
const SAVED = {
  ruleId: "rule",
  version: 8,
  changeId: "c",
  outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
};
const STATE: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  create.mockReset();
  refresh.mockReset();
  offerUndo.mockReset();
  create.mockResolvedValue(SAVED);
});

function renderDialog(extra: Partial<PauseOnlineDialogProps> = {}) {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <main>
        <PauseOnlineDialog
          venueId="venue-1"
          state={STATE}
          today={TODAY}
          onClose={onClose}
          {...extra}
        />
      </main>
    </ToastProvider>
  );
  return { onClose, dialog: screen.getByRole("dialog", { name: "Pause online booking" }) };
}

/** The page's side of it: a button that opens the dialog, as the header's does. */
function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <ToastProvider>
      <main id="main-content" tabIndex={-1}>
        <button type="button" onClick={() => setOpen(true)}>
          Open pause
        </button>
        {open && (
          <PauseOnlineDialog
            venueId="venue-1"
            state={STATE}
            today={TODAY}
            onClose={() => setOpen(false)}
          />
        )}
      </main>
    </ToastProvider>
  );
}

const problem = (status: number, extra: Record<string, unknown> = {}) =>
  new ApiClientError(
    { type: "about:blank", title: "Refused", status, detail: "boom", ...extra } as never,
    "POST",
    "closures"
  );
const primary = (dialog: HTMLElement) => within(dialog).getByTestId("pause-primary");
const choose = (dialog: HTMLElement, name: string) =>
  fireEvent.click(within(dialog).getByRole("radio", { name }));
const sent = (call = 0) => create.mock.calls[call]![0];

describe("PauseOnlineDialog", () => {
  it("offers Tonight, Until I resume and Until a date, with Tonight chosen", () => {
    const { dialog } = renderDialog();
    const radios = within(dialog).getAllByRole("radio");
    expect(
      radios.map((r) => r.closest("label")?.textContent ?? r.getAttribute("aria-label"))
    ).toEqual(["Tonight", "Until I resume", "Until a date"]);
    expect(within(dialog).getByRole("radio", { name: "Tonight" })).toBeChecked();
    expect(primary(dialog)).toHaveTextContent(/^Pause until tonight ends$/);
    expect(primary(dialog)).toBeEnabled();
  });

  it("pauses tonight in one press once it is open, with one write", async () => {
    const { dialog, onClose } = renderDialog();
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
    expect(sent().venueId).toBe("venue-1");
    expect(sent().idempotencyKey).toEqual(expect.any(String));
    expect(sent().body).toEqual({
      expectedVersion: 7,
      rule: {
        id: expect.any(String),
        kind: "closure",
        targetKind: "booking",
        bookingTypes: ["online"],
        startsOn: TODAY,
        endsOn: TODAY,
        window: null,
      },
      decisions: [],
    });
  });

  it("Until I resume sends a pause with no end", async () => {
    const { dialog, onClose } = renderDialog();
    choose(dialog, "Until I resume");
    expect(primary(dialog)).toHaveTextContent(/^Pause until I resume$/);
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent().body.rule).toMatchObject({ startsOn: TODAY, endsOn: null });
  });

  it("Until a date asks for the date, then sends it as the end", async () => {
    const { dialog, onClose } = renderDialog();
    expect(within(dialog).queryByRole("combobox", { name: "Pause until" })).toBeNull();
    choose(dialog, "Until a date");
    expect(primary(dialog)).toHaveTextContent(/^Choose a date$/);
    expect(primary(dialog)).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Pause until" }));
    fireEvent.click(
      Array.from(document.querySelectorAll<HTMLElement>('[data-date="2026-12-05"]')).at(-1)!
    );
    expect(primary(dialog)).toHaveTextContent(/^Pause until Sat, Dec 5$/);
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent().body.rule).toMatchObject({ startsOn: TODAY, endsOn: "2026-12-05" });
  });

  it("offers no end date past 366 days from today, the API's cap", () => {
    const { dialog } = renderDialog();
    choose(dialog, "Until a date");
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Pause until" }));
    // The picker opens on December 2026; the cap falls on Dec 2, 2027.
    for (let month = 0; month < 12; month += 1) {
      fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    }
    const day = (date: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-date="${date}"]`)).at(-1)!;
    expect(day("2027-12-02")).not.toHaveAttribute("aria-disabled");
    expect(day("2027-12-03")).toHaveAttribute("aria-disabled", "true");
  });

  it("sends the guest message, and refuses one that is too long", async () => {
    const { dialog, onClose } = renderDialog();
    const message = within(dialog).getByLabelText(/Message for guests/);
    fireEvent.change(message, { target: { value: "x".repeat(GUEST_MESSAGE_MAX_LENGTH + 1) } });
    expect(primary(dialog)).toBeDisabled();
    fireEvent.change(message, { target: { value: "Back at 8" } });
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent().body.rule).toMatchObject({ guestMessage: "Back at 8" });
  });

  it("offers Undo under what it saved, through the caller when it asks to", async () => {
    const first = renderDialog();
    fireEvent.click(primary(first.dialog));
    await waitFor(() => expect(first.onClose).toHaveBeenCalled());
    expect(offerUndo).toHaveBeenCalledWith({
      venueId: "venue-1",
      title: "Online booking paused until tonight ends",
      saved: SAVED,
    });
  });

  it("hands the save to onSaved in place of its own Undo, before it closes", async () => {
    const order: string[] = [];
    const onSaved = vi.fn(() => order.push("saved"));
    const { dialog } = renderDialog({ onSaved, onClose: () => order.push("closed") });
    choose(dialog, "Until I resume");
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(order).toEqual(["saved", "closed"]));
    expect(onSaved).toHaveBeenCalledWith(SAVED, "Online booking paused until you resume");
    expect(offerUndo).not.toHaveBeenCalled();
  });

  it("stays open with the reason when the save is refused", async () => {
    create.mockRejectedValue(problem(422));
    const { dialog, onClose } = renderDialog();
    fireEvent.click(primary(dialog));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't pause online booking");
    expect(alert).toHaveTextContent("boom");
    expect(onClose).not.toHaveBeenCalled();
    expect(offerUndo).not.toHaveBeenCalled();
  });

  it("on a version conflict says so, loads the latest and stays open", async () => {
    create.mockRejectedValue(
      problem(409, {
        code: "version-conflict",
        winningChange: {
          id: "c1",
          actorId: "auth0|ana",
          at: "2026-12-01T20:15:00Z",
          kind: "closure",
          summary: "Closed Thu Dec 24",
        },
      })
    );
    const { dialog, onClose } = renderDialog();
    fireEvent.click(primary(dialog));
    expect(
      await within(dialog).findByText(/Availability changed since you opened this/)
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/changed first by a teammate: Closed Thu Dec 24/i)
    ).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("retries the same pause with the same key, and a changed one with a new key", async () => {
    create.mockRejectedValueOnce(problem(500)).mockRejectedValueOnce(problem(500));
    const { dialog, onClose } = renderDialog();
    fireEvent.click(primary(dialog));
    await within(dialog).findByRole("alert");
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(sent(1).idempotencyKey).toBe(sent(0).idempotencyKey);
    expect(sent(1).body.rule.id).toBe(sent(0).body.rule.id);
    await within(dialog).findByRole("alert");
    choose(dialog, "Until I resume");
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent(2).idempotencyKey).not.toBe(sent(0).idempotencyKey);
    expect(sent(2).body.rule.id).not.toBe(sent(0).body.rule.id);
  });

  it("asks before leaving a save that may have gone through, and not otherwise", async () => {
    create.mockRejectedValue(problem(500));
    const { dialog, onClose } = renderDialog();
    fireEvent.click(primary(dialog));
    await within(dialog).findByRole("alert");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    const ask = await screen.findByRole("alertdialog", { name: "Leave this pause?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("leaves at once on Cancel when nothing was sent", () => {
    const { dialog, onClose } = renderDialog();
    choose(dialog, "Until I resume");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("puts focus on the chosen option when it opens, and back on its opener after a save", async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Open pause" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Pause online booking" });
    await waitFor(() =>
      expect(within(dialog).getByRole("radio", { name: "Tonight" })).toHaveFocus()
    );
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
