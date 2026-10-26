import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule, Table } from "@mbe/types";

const setTonight = vi.hoisted(() => vi.fn());
const endTonight = vi.hoisted(() => vi.fn());
const viewport = vi.hoisted(() => ({ value: "desktop" as "desktop" | "phone" }));

vi.mock("../../hooks/useTonight.js", () => ({
  useSetTonight: () => ({ mutateAsync: setTonight, isPending: false }),
  useEndTonight: () => ({ mutateAsync: endTonight, isPending: false }),
}));
vi.mock("../../hooks/useViewport.js", () => ({ useViewport: () => viewport.value }));
vi.mock("./CloseDialog.js", () => ({
  CloseDialog: (props: { hostLocked?: boolean; onClose: () => void }) => (
    <div role="dialog" aria-label="Close dialog" data-host-locked={String(!!props.hostLocked)}>
      <button type="button" onClick={props.onClose}>
        Dismiss close
      </button>
    </div>
  ),
}));

import { TonightControl, type TonightControlProps } from "./TonightControl.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };
const TODAY = "2026-10-29";
const NOW = new Date("2026-10-29T20:00:00Z");

const TABLES = [
  { id: "t1", name: "P1", location: "Patio", isActive: true },
  { id: "t2", name: "P2", location: "Patio", isActive: true },
  { id: "t3", name: "B1", location: "Bar", isActive: true },
] as unknown as Table[];

const PAUSE_RULE = {
  id: "r-pause",
  kind: "tonight",
  targetKind: "booking",
  bookingTypes: ["online"],
  startsOn: TODAY,
  endsOn: TODAY,
  expiresAt: "2026-10-30T11:00:00.000Z",
  payload: { version: 1, stop: { from: 0, to: 2880 } },
} as DateRule;

function stateWith(...rules: DateRule[]): AvailabilityConfigState {
  return { config: fixtureConfig(...rules), version: 7, source: "rows" };
}

function renderControl(props: Partial<TonightControlProps> = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <main>
          <TonightControl
            venueId="venue-1"
            state={stateWith()}
            timezone="America/Los_Angeles"
            today={TODAY}
            now={NOW}
            viewerRole="manager"
            hostEmergencyClose={false}
            tables={TABLES}
            {...props}
          />
        </main>
      </ToastProvider>
    </MemoryRouter>
  );
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: /^Tonight/ }));
}

describe("TonightControl", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    viewport.value = "desktop";
    setTonight.mockResolvedValue({
      outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    endTonight.mockResolvedValue({ version: 8, changeId: "c" });
  });

  describe("Host without the grant", () => {
    it("hides the emergency close and explains who can use it as text", () => {
      renderControl({ viewerRole: "host", hostEmergencyClose: false });
      open();
      expect(screen.queryByRole("button", { name: /Emergency: close tonight/ })).toBeNull();
      expect(screen.getByText(/Only managers can close in an emergency/)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Who can close in an emergency?" })).toBeNull();
    });

    it("can still pause online booking", async () => {
      renderControl({ viewerRole: "host" });
      open();
      fireEvent.click(screen.getByRole("switch", { name: "Pause online booking" }));
      await waitFor(() => expect(setTonight).toHaveBeenCalledOnce());
      expect(setTonight.mock.calls[0]![0]).toMatchObject({
        venueId: "venue-1",
        body: { expectedVersion: 7, change: { type: "pause_online" } },
      });
    });
  });

  describe("Host with the grant", () => {
    it("opens the Close dialog with What and When locked", () => {
      renderControl({ viewerRole: "host", hostEmergencyClose: true });
      open();
      fireEvent.click(screen.getByRole("button", { name: "Emergency: close tonight…" }));
      expect(screen.getByRole("dialog", { name: "Close dialog" })).toHaveAttribute(
        "data-host-locked",
        "true"
      );
    });

    it("shows the answer as text, not a link", () => {
      renderControl({ viewerRole: "host", hostEmergencyClose: true });
      open();
      expect(screen.getByText(/Hosts can close the whole venue for tonight/)).toBeInTheDocument();
      expect(screen.queryByRole("link")).toBeNull();
    });
  });

  describe("Manager", () => {
    it("opens the Close dialog unlocked and links the footer to Settings", () => {
      renderControl({ viewerRole: "manager" });
      open();
      expect(screen.getByRole("link", { name: "Who can close in an emergency?" })).toHaveAttribute(
        "href",
        "/settings"
      );
      fireEvent.click(screen.getByRole("button", { name: "Emergency: close tonight…" }));
      expect(screen.getByRole("dialog", { name: "Close dialog" })).toHaveAttribute(
        "data-host-locked",
        "false"
      );
    });

    it("blocks every table in a location", async () => {
      renderControl();
      open();
      fireEvent.click(screen.getByRole("combobox", { name: "Block tables" }));
      fireEvent.click(screen.getByRole("option", { name: "All tables in Patio" }));
      fireEvent.click(screen.getByRole("button", { name: "Block" }));
      await waitFor(() => expect(setTonight).toHaveBeenCalledOnce());
      expect(setTonight.mock.calls[0]![0].body.change).toEqual({
        type: "block_tables",
        tableIds: ["t1", "t2"],
      });
    });

    it("shows the failure inline and keeps the control usable", async () => {
      setTonight.mockRejectedValueOnce(new Error("boom"));
      renderControl();
      open();
      fireEvent.click(screen.getByRole("switch", { name: "Pause online booking" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't apply that change");
    });
  });

  describe("chips", () => {
    it("shows each active change and ends it with the chip's remove button", async () => {
      renderControl({ state: stateWith(PAUSE_RULE) });
      const chip = screen.getByText(/Online paused/);
      expect(chip).toBeInTheDocument();
      fireEvent.click(within(chip.closest("span")!).getByRole("button"));
      await waitFor(() =>
        expect(endTonight).toHaveBeenCalledWith({ venueId: "venue-1", ruleId: "r-pause" })
      );
    });

    it("shows the pause toggle on and ends it when switched off", async () => {
      renderControl({ state: stateWith(PAUSE_RULE) });
      open();
      const toggle = screen.getByRole("switch", { name: "Pause online booking" });
      expect(toggle).toBeChecked();
      fireEvent.click(toggle);
      await waitFor(() => expect(endTonight).toHaveBeenCalledOnce());
    });
  });

  describe("on a phone", () => {
    it("opens as a bottom sheet with touch-sized controls", () => {
      viewport.value = "phone";
      renderControl();
      open();
      const sheet = screen.getByRole("dialog", { name: "Tonight" });
      expect(within(sheet).getByTestId("tonight-panel")).toHaveAttribute("data-layout", "sheet");
    });
  });

  it("has no axe violations when open", async () => {
    const { container } = renderControl();
    open();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
