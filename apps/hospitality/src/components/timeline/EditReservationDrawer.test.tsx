import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditReservationDrawer } from "./EditReservationDrawer.js";
import type { Reservation, Table } from "@mbe/types";

// Mock scrollIntoView for JSDOM
window.HTMLElement.prototype.scrollIntoView = vi.fn();

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-05-14",
    startTime: "2026-05-14T18:00:00.000Z",
    endTime: "2026-05-14T20:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: "Window seat preferred",
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    venueId: null,
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

function makeTables(): Table[] {
  return [
    {
      id: "table-1",
      name: "Table 1",
      capacity: 4,
      isActive: true,
      status: "AVAILABLE",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
    {
      id: "table-2",
      name: "Table 2",
      capacity: 6,
      isActive: true,
      status: "AVAILABLE",
      x: 200,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
    {
      id: "table-3",
      name: "Patio 1",
      capacity: 2,
      isActive: false,
      status: "AVAILABLE",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
      shape: "CIRCLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
  ];
}

describe("EditReservationDrawer", () => {
  const defaultProps = {
    reservation: makeReservation(),
    tables: makeTables(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the drawer with title", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    expect(screen.getByText("Edit Reservation")).toBeDefined();
  });

  it("should render with dialog role", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("should pre-fill start time from reservation", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const input = screen.getByLabelText("Start Time") as HTMLInputElement;
    // UTC 18:00 → local time conversion via toTimeInputValue
    expect(input.value).toBeDefined();
    expect(input.type).toBe("time");
  });

  it("should pre-fill end time from reservation", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const input = screen.getByLabelText("End Time") as HTMLInputElement;
    expect(input.value).toBeDefined();
    expect(input.type).toBe("time");
  });

  it("should pre-fill party size from reservation", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const input = screen.getByLabelText("Party Size") as HTMLInputElement;
    expect(input.value).toBe("4");
  });

  it("should pre-fill notes from reservation", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const textarea = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Window seat preferred");
  });

  it("should use empty string for notes when reservation notes is null", () => {
    render(
      <EditReservationDrawer
        {...defaultProps}
        reservation={makeReservation({ notes: null })}
      />
    );
    const textarea = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("should only show active tables in the table select", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const trigger = screen.getByRole("combobox", { name: /assign table/i });
    fireEvent.click(trigger);

    // table-1 and table-2 are active
    const listbox = screen.getByRole("listbox");
    expect(listbox.textContent).toContain("Table 1");
    expect(listbox.textContent).toContain("Table 2");
    // table-3 (Patio 1) is inactive — should not appear
    expect(listbox.textContent).not.toContain("Patio 1");
  });

  it("should show table capacity in option labels", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const trigger = screen.getByRole("combobox", { name: /assign table/i });
    fireEvent.click(trigger);

    expect(
      screen.getByRole("option", { name: /Table 1 \(cap\. 4\)/ })
    ).toBeDefined();
    expect(
      screen.getByRole("option", { name: /Table 2 \(cap\. 6\)/ })
    ).toBeDefined();
  });

  it("should allow changing party size", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const input = screen.getByLabelText("Party Size") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "6" } });
    expect(input.value).toBe("6");
  });

  it("should allow changing notes", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const textarea = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Updated note" } });
    expect(textarea.value).toBe("Updated note");
  });

  it("should call onClose when Cancel button is clicked", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("should call onSave with updated data when Save Changes is clicked", async () => {
    render(<EditReservationDrawer {...defaultProps} />);

    // Change party size
    const partySizeInput = screen.getByLabelText(
      "Party Size"
    ) as HTMLInputElement;
    fireEvent.change(partySizeInput, { target: { value: "6" } });

    // Change notes
    const textarea = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Booth preferred" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledOnce();
    });

    const [id, data] = defaultProps.onSave.mock.calls[0];
    expect(id).toBe("res-1");
    expect(data.partySize).toBe(6);
    expect(data.notes).toBe("Booth preferred");
    expect(data.tableId).toBe("table-1");
  });

  it("should show error for invalid party size", async () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const input = screen.getByLabelText("Party Size") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("Party size must be a positive number.")
      ).toBeDefined();
    });
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it("should show error for non-numeric party size", async () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const input = screen.getByLabelText("Party Size") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("Party size must be a positive number.")
      ).toBeDefined();
    });
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it("should show error when end time is before start time", async () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const startInput = screen.getByLabelText("Start Time") as HTMLInputElement;
    const endInput = screen.getByLabelText("End Time") as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: "20:00" } });
    fireEvent.change(endInput, { target: { value: "18:00" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("End time must be after start time.")
      ).toBeDefined();
    });
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it("should show error when start and end times are equal", async () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const startInput = screen.getByLabelText("Start Time") as HTMLInputElement;
    const endInput = screen.getByLabelText("End Time") as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: "18:00" } });
    fireEvent.change(endInput, { target: { value: "18:00" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("End time must be after start time.")
      ).toBeDefined();
    });
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it("should show error when start time is empty", async () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const startInput = screen.getByLabelText("Start Time") as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("Start and end times are required.")
      ).toBeDefined();
    });
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it("should display error when onSave throws an Error", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<EditReservationDrawer {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
  });

  it("should display fallback error when onSave throws a non-Error", async () => {
    const onSave = vi.fn().mockRejectedValue("something broke");
    render(<EditReservationDrawer {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to save changes.")).toBeDefined();
    });
  });

  it("should show loading state while saving", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<EditReservationDrawer {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByText("Saving…")).toBeDefined();
    });

    // Cancel button should be disabled during save
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolvePromise!(undefined);
  });

  it("should disable inputs while saving", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<EditReservationDrawer {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Party Size")).toBeDisabled();
    });
    expect(screen.getByLabelText("Start Time")).toBeDisabled();
    expect(screen.getByLabelText("End Time")).toBeDisabled();
    expect(screen.getByLabelText("Notes")).toBeDisabled();

    resolvePromise!(undefined);
  });

  it("should strip whitespace-only notes to undefined", async () => {
    render(<EditReservationDrawer {...defaultProps} />);
    const textarea = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledOnce();
    });

    const [, data] = defaultProps.onSave.mock.calls[0];
    expect(data.notes).toBeUndefined();
  });

  it("should call onClose when drawer close button is clicked", () => {
    render(<EditReservationDrawer {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });
});
