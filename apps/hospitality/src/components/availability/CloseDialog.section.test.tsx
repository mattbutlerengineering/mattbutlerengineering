import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, FloorPlanSection, Table } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
const sectionsRead = vi.hoisted(() => ({
  value: { data: [] as unknown[], isLoading: false, error: null as unknown },
}));
const tablesRead = vi.hoisted(() => ({ value: { data: [] as unknown[] } }));
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: false }),
  useCreateClosures: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClosureImpacts: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useClosureNoticePreview: () => ({ data: undefined, isLoading: true, error: null }),
  useClosureImpact: () => ({
    data: { reservations: 0, covers: 0, depositsHeld: 0, groups: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => sectionsRead.value,
}));
const useTablesSpy = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useTables.js", () => ({
  useTables: (params: unknown) => {
    useTablesSpy(params);
    return tablesRead.value;
  },
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
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

import { CloseDialog } from "./CloseDialog.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const DATE = "2026-12-24";
const section = (id: string, name: string) => ({ id, name }) as FloorPlanSection;
const table = (id: string, sectionId: string | null) => ({ id, sectionId }) as Table;

function renderDialog(extra: Partial<React.ComponentProps<typeof CloseDialog>> = {}) {
  const state: AvailabilityConfigState = { config: fixtureConfig(), version: 7, source: "rows" };
  return render(
    <MemoryRouter>
      <ToastProvider>
        <main>
          <CloseDialog
            venueId="venue-1"
            state={state}
            timezone="America/Los_Angeles"
            today="2026-12-01"
            initialDate={DATE}
            onClose={vi.fn()}
            {...extra}
          />
        </main>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("CloseDialog: One section (ADR-032)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    create.mockReset();
    sectionsRead.value = {
      data: [section("sec-bar", "Bar"), section("sec-main", "Main Dining")],
      isLoading: false,
      error: null,
    };
    tablesRead.value = {
      data: [table("t1", "sec-bar"), table("t2", "sec-bar"), table("t3", "sec-main")],
    };
  });

  it("closes one named section: a tables closure that names it and carries its tables", async () => {
    create.mockResolvedValue({
      ruleId: "rule",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    });
    renderDialog();
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("radio", { name: "One section" }));
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Section" }));
    fireEvent.click(screen.getByRole("option", { name: "Bar" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close Bar on Thu, Dec 24" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const { body } = create.mock.calls[0]![0];
    expect(body.rule).toMatchObject({
      kind: "closure",
      targetKind: "tables",
      sectionId: "sec-bar",
      tableIds: ["t1", "t2"],
      startsOn: DATE,
      endsOn: DATE,
    });
    expect(await screen.findByText("Bar closed on Thu, Dec 24")).toBeInTheDocument();
  });

  it("reads every active table of the venue, not the first page", () => {
    renderDialog();
    expect(useTablesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", activeOnly: true, limit: 100 })
    );
  });

  it("starts on the section it is opened for", () => {
    renderDialog({ initialSectionId: "sec-main" });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "One section" })).toBeChecked();
    expect(within(dialog).getByRole("combobox", { name: "Section" })).toHaveTextContent(
      "Main Dining"
    );
  });

  it("opens with no preselection for a section the venue does not have", () => {
    renderDialog({ initialSectionId: "gone" });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Whole venue" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "One section" })).not.toBeChecked();
  });

  it("is off with a way to the floor plan while the venue has no sections", () => {
    sectionsRead.value = { data: [], isLoading: false, error: null };
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const choice = within(dialog).getByRole("radio", { name: /^One section/ });
    expect(choice).toBeDisabled();
    // The reason is part of the choice itself, so it is read with it.
    expect(choice).toHaveAccessibleDescription("Add a section to your floor plan first");
    expect(choice.closest("label")).toHaveTextContent("Add a section to your floor plan first");
    expect(within(dialog).getByRole("link", { name: "Open Floor Plan" })).toHaveAttribute(
      "href",
      "/floor-plans"
    );
  });

  it("is off, and says why, when the sections could not load; the other choices stay", () => {
    sectionsRead.value = { data: [], isLoading: false, error: new Error("down") };
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const choice = within(dialog).getByRole("radio", { name: /^One section/ });
    expect(choice).toBeDisabled();
    expect(choice).toHaveAccessibleDescription("Couldn't load the sections.");
    expect(within(dialog).getByRole("radio", { name: "Whole venue" })).toBeEnabled();
  });
});
