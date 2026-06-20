import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestDrawer } from "./GuestDrawer.js";
import type { Guest, Reservation } from "@mbe/types";
import type {
  AlertProps,
  ButtonProps,
  CheckboxProps,
  DrawerProps,
  InputProps,
  StackProps,
  TagProps,
  TextProps,
  TextAreaProps,
} from "@mattbutlerengineering/rialto";
import type { GuestCardProps } from "./GuestCard.js";
import React from "react";

const mockToast = vi.fn();

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: AlertProps) => <div data-testid="alert">{children}</div>,
  Button: ({ children, onClick, disabled }: ButtonProps) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Checkbox: ({ label, checked, onCheckedChange }: CheckboxProps) => (
    <label>
      <input
        type="checkbox"
        aria-label={typeof label === "string" ? label : undefined}
        checked={checked ?? false}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
      {label}
    </label>
  ),
  Divider: () => <hr />,
  Drawer: ({ children, open, footer }: DrawerProps) =>
    open ? (
      <div data-testid="drawer">
        {children}
        {footer}
      </div>
    ) : null,
  Input: (props: InputProps) => {
    const id =
      (typeof props.label === "string" ? props.label : "")
        .replace(/\s+/g, "-")
        .toLowerCase() || "input";
    return (
      <div>
        {props.label && <label htmlFor={id}>{props.label}</label>}
        <input
          id={id}
          type={props.type}
          value={(props.value as string) ?? ""}
          onChange={props.onChange}
          onKeyDown={props.onKeyDown}
          placeholder={props.placeholder}
        />
        {props.error && props.hint && <span data-testid={`input-error-${id}`}>{props.hint}</span>}
      </div>
    );
  },
  Stack: ({ children }: StackProps) => <div>{children}</div>,
  Tag: ({ children }: TagProps) => <span data-testid="tag">{children}</span>,
  Text: ({ children }: TextProps) => <span>{children}</span>,
  TextArea: (props: TextAreaProps) => (
    <textarea
      data-testid="textarea"
      value={props.value}
      onChange={(e) => props.onChange?.(e)}
    />
  ),
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("../crm/GuestCard.js", () => ({
  GuestCard: ({ guestId }: GuestCardProps) => (
    <div data-testid="guest-card" data-guest-id={guestId} />
  ),
}));

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    name: "John Doe",
    email: "john@example.com",
    phone: "+15551234",
    visitCount: 5,
    notes: null,
    tags: [],
    dietaryRestrictions: [],
    lastVisit: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    venueId: "venue-1",
    lifetimeSpend: null,
    ...overrides,
  };
}

describe("GuestDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  it("renders nothing when guest is null", () => {
    render(
      <GuestDrawer
        guest={null}
        open={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    expect(screen.queryByTestId("drawer")).toBeNull();
  });

  it("renders drawer when open and guest provided", () => {
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    expect(screen.getByTestId("drawer")).toBeDefined();
  });

  it("shows Close and Edit Guest buttons in view mode", () => {
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    expect(screen.getByText("Close")).toBeDefined();
    expect(screen.getByText("Edit Guest")).toBeDefined();
  });

  it("calls onClose when Close is clicked", () => {
    const onClose = vi.fn();
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={onClose}
        onSave={vi.fn()}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to edit mode when Edit Guest is clicked", async () => {
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());
  });

  it("calls onSave with guest data when Save is clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={vi.fn()}
        onSave={onSave}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("g1", expect.objectContaining({ name: "John Doe" }));
    });
  });

  it("shows success toast after save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={vi.fn()}
        onSave={onSave}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
    });
  });

  it("shows error alert when save fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Network error"));
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={vi.fn()}
        onSave={onSave}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText("Network error")).toBeDefined());
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("disables Save when name is cleared", async () => {
    const user = userEvent.setup();
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    expect(screen.getByText("Save")).toBeDisabled();
  });

  it("shows tags input in edit mode", async () => {
    render(
      <GuestDrawer
        guest={makeGuest({ tags: ["vip"] })}
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());
    expect(screen.getByPlaceholderText(/add tag/i)).toBeDefined();
  });

  it("shows dietary restriction checkboxes in edit mode", async () => {
    render(
      <GuestDrawer
        guest={makeGuest({ dietaryRestrictions: ["vegetarian"] })}
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        guestReservations={[]}
        isLoadingHistory={false}
      />
    );
    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());
    expect(screen.getByLabelText(/vegetarian/i)).toBeDefined();
  });

  it("shows reservation history when provided", () => {
    const reservations: Reservation[] = [
      {
        id: "r1",
        date: "2026-01-15",
        startTime: "19:00",
        endTime: "21:00",
        partySize: 4,
        status: "COMPLETED",
        venueId: "venue-1",
        guestName: "John Doe",
        guestEmail: null,
        guestPhone: null,
        notes: null,
        occasion: null,
        tableId: "table-1",
        cancellationReason: null,
        cancellationNote: null,
        userId: null,
        seatingPreference: null,
        guestId: "g1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    render(
      <GuestDrawer
        guest={makeGuest()}
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        guestReservations={reservations}
        isLoadingHistory={false}
      />
    );
    expect(screen.getByText("Recent Reservations")).toBeDefined();
  });
});
