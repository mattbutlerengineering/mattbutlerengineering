import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FOCUSABLE_SELECTOR } from "@mattbutlerengineering/rialto/hooks";
import { NewReservationDialog } from "./NewReservationDialog.js";
import { ApiClientError } from "@mbe/api-client";
import { ERROR_COPY } from "../../lib/describe-api-error.js";
import type { Guest, Table } from "@mbe/types";
import type { UseGuestLookupParams, UseGuestLookupResult } from "../../hooks/useGuestLookup.js";
import { pickAnnouncement } from "../crm/guest-lookup-rows.js";

const mockUseGuestLookup = vi.fn<(params: UseGuestLookupParams) => UseGuestLookupResult>();

vi.mock("../../hooks/useGuestLookup.js", () => ({
  useGuestLookup: (params: UseGuestLookupParams) => mockUseGuestLookup(params),
}));

const idleLookup: UseGuestLookupResult = {
  rows: [],
  hasMore: false,
  isLoading: false,
  failed: false,
  query: "",
};

// Mock scrollIntoView for JSDOM (rialto Select uses it)
window.HTMLElement.prototype.scrollIntoView = vi.fn();

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "1",
    capacity: 2,
    minCovers: 1,
    maxCovers: 2,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

/** SC2's returning guest: Priya, 4 visits, 1 no-show, shellfish allergy. */
function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "gst_priya",
    venueId: "venue-1",
    name: "Priya Shah",
    email: "priya@example.com",
    phone: "(555) 010-0100",
    notes: null,
    visitCount: 4,
    noShowCount: 1,
    riskScore: "standard",
    lifetimeSpend: "400.00",
    lastVisit: "2026-04-01T00:00:00.000Z",
    tags: ["vip"],
    dietaryRestrictions: ["shellfish"],
    staffNotes: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTables(): Table[] {
  return [
    makeTable({ id: "table-1", name: "Table 1", capacity: 2 }),
    makeTable({ id: "table-2", name: "Table 2", capacity: 4 }),
    makeTable({ id: "table-3", name: "Table 3", capacity: 6, isActive: false }),
    makeTable({ id: "table-4", name: "Table 4", capacity: 8 }),
  ];
}

describe("NewReservationDialog", () => {
  const defaultProps = {
    tables: makeTables(),
    venueId: "venue-1",
    defaultDate: "2026-04-10",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGuestLookup.mockReset();
    mockUseGuestLookup.mockReturnValue(idleLookup);
  });

  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByLabelText(/guest email/i), {
      target: { value: "smith@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:30" } });
  }

  it("should render the dialog with title", () => {
    render(<NewReservationDialog {...defaultProps} />);
    expect(screen.getByText("New Reservation")).toBeDefined();
  });

  it("should render with dialog role and aria-modal", () => {
    render(<NewReservationDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("should default the date field to defaultDate", () => {
    render(<NewReservationDialog {...defaultProps} />);
    const dateInput = screen.getByLabelText(/^date/i) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-04-10");
  });

  it("should default to party size 2 and auto-select the best-fit active table", () => {
    render(<NewReservationDialog {...defaultProps} />);
    const btn = screen.getByRole("button", { name: "2" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    const trigger = screen.getByRole("combobox", { name: /table/i });
    expect(trigger).toHaveTextContent("Table 1 (seats 2)");
  });

  it("should exclude inactive tables from the table select", () => {
    render(<NewReservationDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "6" }));

    // Table 3 (cap 6) is inactive, so best fit becomes Table 4 (cap 8)
    const trigger = screen.getByRole("combobox", { name: /table/i });
    expect(trigger).toHaveTextContent("Table 4 (seats 8)");
  });

  it("should show a message and disable submit when no table fits", () => {
    const smallTables = [makeTable({ id: "tiny", name: "Tiny", capacity: 1 })];
    render(<NewReservationDialog {...defaultProps} tables={smallTables} />);

    expect(screen.getByText(/no tables available for a party of 2/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Create Reservation" })).toBeDisabled();
  });

  it("should require guest name", async () => {
    render(<NewReservationDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/guest email/i), {
      target: { value: "smith@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:30" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText(/guest name is required/i)).toBeDefined();
    });
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it("announces the validation error to screen readers via role=alert", async () => {
    render(<NewReservationDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/guest email/i), {
      target: { value: "smith@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:30" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/guest name is required/i);
    });
  });

  it("should require a guest email or phone number", async () => {
    render(<NewReservationDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:30" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText(/provide a guest email or phone/i)).toBeDefined();
    });
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it("should call onConfirm with a complete CreateReservationRequest on submit", async () => {
    render(<NewReservationDialog {...defaultProps} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data).toMatchObject({
      date: "2026-04-10",
      startTime: "2026-04-10T18:30:00",
      endTime: "2026-04-10T20:00:00",
      partySize: 2,
      tableId: "table-1",
      venueId: "venue-1",
      guestName: "Smith",
      guestEmail: "smith@example.com",
    });
    expect(data.guestPhone).toBeUndefined();
  });

  it("should roll endTime to the next calendar day when start time is within the duration of midnight", async () => {
    render(<NewReservationDialog {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByLabelText(/guest email/i), {
      target: { value: "smith@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "23:15" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.startTime).toBe("2026-04-10T23:15:00");
    expect(data.endTime).toBe("2026-04-11T00:45:00");
    expect(new Date(data.endTime).getTime()).toBeGreaterThan(new Date(data.startTime).getTime());
  });

  it("should call onClose when Cancel is clicked", () => {
    render(<NewReservationDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("shows the house serverError sentence, never the raw message, when onConfirm rejects with a 500", async () => {
    const onConfirm = vi.fn().mockRejectedValue(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Internal Server Error",
          status: 500,
          detail: "Internal Server Error",
        },
        "POST",
        "/api/v1/reservations"
      )
    );
    render(<NewReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText(ERROR_COPY.serverError.detail)).toBeDefined();
    });
    expect(screen.queryByText(/failed: 500/)).toBeNull();
  });

  it("shows the server's own detail for a 409 conflict — that one is written for the person", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValue(
        new ApiClientError(
          { type: "about:blank", title: "Conflict", status: 409, detail: "Table is not available" },
          "POST",
          "/api/v1/reservations"
        )
      );
    render(<NewReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText("Table is not available")).toBeDefined();
    });
    expect(screen.queryByText(/failed: 409/)).toBeNull();
  });

  it("should display a fallback error when onConfirm rejects with a non-Error", async () => {
    const onConfirm = vi.fn().mockRejectedValue("boom");
    render(<NewReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText(ERROR_COPY.unknown.detail)).toBeDefined();
    });
  });

  it("should show loading state while submitting", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<NewReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));

    await waitFor(() => {
      expect(screen.getByText("Creating…")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolvePromise!(undefined);
  });

  describe("returning guest lookup", () => {
    const priya = makeGuest();
    const priyaRows: UseGuestLookupResult = { ...idleLookup, rows: [priya], query: "pri" };
    const LINK_CAPTION =
      "Edits to email or phone below change this booking only — the profile isn't edited.";

    function guestNameField() {
      return screen.getByRole("combobox", { name: /guest name/i });
    }

    function fillDateAndTime() {
      fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-04-10" } });
      fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:30" } });
    }

    /** Type "Pri", tap the Priya row, then let the lookup go quiet again. */
    function pickPriya() {
      mockUseGuestLookup.mockReturnValue(priyaRows);
      fireEvent.change(guestNameField(), { target: { value: "Pri" } });
      fireEvent.mouseDown(screen.getByRole("option", { name: /Priya Shah/ }));
      mockUseGuestLookup.mockReturnValue(idleLookup);
    }

    it("wires the lookup field with the returning-guest hint", () => {
      render(<NewReservationDialog {...defaultProps} />);
      expect(guestNameField()).toBeInTheDocument();
      expect(
        screen.getByText("Name, email or phone — returning guests appear as you type.")
      ).toBeInTheDocument();
      expect(mockUseGuestLookup).toHaveBeenLastCalledWith({ venueId: "venue-1", text: "" });
    });

    it("picking Priya links the booking, prefills her contact details and shows the strip", async () => {
      render(<NewReservationDialog {...defaultProps} />);
      pickPriya();

      const strip = screen.getByRole("group", { name: "Using Priya Shah's profile" });
      expect(strip).toHaveTextContent(LINK_CAPTION);
      expect(guestNameField()).toHaveValue("Priya Shah");
      expect(screen.getByLabelText(/guest email/i)).toHaveValue("priya@example.com");
      expect(screen.getByLabelText(/guest phone/i)).toHaveValue("(555) 010-0100");
      expect(screen.queryByRole("listbox", { name: "Guest suggestions" })).toBeNull();

      fillDateAndTime();
      fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));
      await waitFor(() => {
        expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
      });
      expect(defaultProps.onConfirm.mock.calls[0][0]).toMatchObject({
        guestId: "gst_priya",
        guestName: "Priya Shah",
        guestEmail: "priya@example.com",
        guestPhone: "(555) 010-0100",
      });
    });

    it("Clear keeps an edited email, restores the previous phone, drops the strip and the guestId", async () => {
      render(<NewReservationDialog {...defaultProps} />);
      fireEvent.change(screen.getByLabelText(/guest phone/i), {
        target: { value: "(555) 999-0000" },
      });
      pickPriya();
      expect(screen.getByLabelText(/guest phone/i)).toHaveValue("(555) 010-0100");
      fireEvent.change(screen.getByLabelText(/guest email/i), {
        target: { value: "new@example.com" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Clear Priya Shah" }));

      expect(screen.queryByRole("group", { name: /profile/ })).toBeNull();
      expect(screen.getByLabelText(/guest email/i)).toHaveValue("new@example.com");
      expect(screen.getByLabelText(/guest phone/i)).toHaveValue("(555) 999-0000");
      expect(document.activeElement).toBe(guestNameField());

      fillDateAndTime();
      fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));
      await waitFor(() => {
        expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
      });
      const data = defaultProps.onConfirm.mock.calls[0][0];
      expect(data).not.toHaveProperty("guestId");
      expect(data).toMatchObject({ guestEmail: "new@example.com", guestPhone: "(555) 999-0000" });
    });

    it("leaves today's payload untouched when the lookup is ignored (no guestId key)", async () => {
      render(<NewReservationDialog {...defaultProps} />);
      fillRequiredFields();
      fireEvent.click(screen.getByRole("button", { name: "Create Reservation" }));
      await waitFor(() => {
        expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
      });
      expect(defaultProps.onConfirm.mock.calls[0][0]).toStrictEqual({
        date: "2026-04-10",
        startTime: "2026-04-10T18:30:00",
        endTime: "2026-04-10T20:00:00",
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
        guestName: "Smith",
        guestEmail: "smith@example.com",
        guestPhone: undefined,
      });
    });

    it("a failed lookup never blocks submit (SC6)", async () => {
      mockUseGuestLookup.mockReturnValue({ ...idleLookup, failed: true, query: "smi" });
      render(<NewReservationDialog {...defaultProps} />);
      fillRequiredFields();
      // The sentence appears twice: the caption under the hint and its one polite announcement.
      const copies = screen.getAllByText(
        "Can't look up guests right now — type the details as usual."
      );
      expect(copies.some((el) => el.closest('[role="status"]') === null)).toBe(true);
      expect(copies.filter((el) => el.closest('[role="status"]') !== null)).toHaveLength(1);
      const submit = screen.getByRole("button", { name: "Create Reservation" });
      expect(submit).toBeEnabled();
      fireEvent.click(submit);
      await waitFor(() => {
        expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
      });
    });

    it("speaks the pick and the clear through the dialog's own LiveStatus", () => {
      render(<NewReservationDialog {...defaultProps} />);
      pickPriya();
      const sentence = pickAnnouncement("linked", priya);
      const spoken = screen.getByText(sentence);
      expect(spoken.closest('[role="status"]')).not.toBeNull();
      expect(screen.getByRole("dialog")).toContainElement(spoken);

      fireEvent.click(screen.getByRole("button", { name: "Clear Priya Shah" }));
      expect(screen.queryByText(sentence)).toBeNull();
      const cleared = screen.getByText("Guest cleared.");
      expect(cleared.closest('[role="status"]')).not.toBeNull();
      expect(screen.getByRole("dialog")).toContainElement(cleared);
    });

    it("Escape with the listbox open closes the list, not the dialog", () => {
      mockUseGuestLookup.mockReturnValue(priyaRows);
      render(<NewReservationDialog {...defaultProps} />);
      fireEvent.change(guestNameField(), { target: { value: "Pri" } });
      expect(screen.getByRole("listbox", { name: "Guest suggestions" })).toBeInTheDocument();

      fireEvent.keyDown(guestNameField(), { key: "Escape" });

      expect(screen.queryByRole("listbox", { name: "Guest suggestions" })).toBeNull();
      expect(defaultProps.onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("accessibility (focus trap + return focus)", () => {
    it("traps Tab focus within the dialog", () => {
      const { container } = render(<NewReservationDialog {...defaultProps} />);
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      last.focus();
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      expect(document.activeElement).toBe(first);

      fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    });

    it("returns focus to the trigger element when closed via Cancel", () => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();

      render(<NewReservationDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(document.activeElement).toBe(trigger);
      document.body.removeChild(trigger);
    });

    it("closes and returns focus on Escape key", () => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();

      render(<NewReservationDialog {...defaultProps} />);
      fireEvent.keyDown(document, { key: "Escape" });

      expect(defaultProps.onClose).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(trigger);
      document.body.removeChild(trigger);
    });

    it("returns focus when closed via backdrop click", () => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();

      const { container } = render(<NewReservationDialog {...defaultProps} />);
      const overlay = container.firstChild as HTMLElement;
      fireEvent.click(overlay);

      expect(defaultProps.onClose).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(trigger);
      document.body.removeChild(trigger);
    });
  });
});
