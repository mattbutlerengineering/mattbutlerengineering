import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { GuestCard } from "./GuestCard.js";
import type { Guest, Reservation } from "@mbe/types";

// Mock scrollIntoView for JSDOM
window.HTMLElement.prototype.scrollIntoView = vi.fn();

/* ── Hook mocks ─────────────────────────────────────── */

const mockUseGuest = vi.fn();
const mockUseReservations = vi.fn();
const mockAddStaffNoteMutateAsync = vi.fn();
const mockUseAddStaffNote = vi.fn();

vi.mock("../../hooks/useGuests.js", () => ({
  useGuest: (id: string) => mockUseGuest(id),
  useAddStaffNote: () => mockUseAddStaffNote(),
}));

vi.mock("../../hooks/useReservations.js", () => ({
  useReservations: (params: unknown) => mockUseReservations(params),
}));

/* ── Fixtures ───────────────────────────────────────── */

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    venueId: "venue-1",
    name: "Alice Smith",
    email: "alice@example.com",
    phone: "+1 555 000 0001",
    notes: null,
    visitCount: 5,
    lifetimeSpend: "250.00",
    lastVisit: "2026-04-01T00:00:00.000Z",
    tags: ["vip"],
    dietaryRestrictions: null,
    staffNotes: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-03-15",
    startTime: "2026-03-15T18:00:00.000Z",
    endTime: "2026-03-15T20:00:00.000Z",
    partySize: 2,
    status: "COMPLETED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Alice Smith",
    guestEmail: "alice@example.com",
    guestPhone: null,
    guestId: "guest-1",
    userId: null,
    tableId: "table-1",
    venueId: "venue-1",
    occasion: "birthday",
    seatingPreference: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-15T20:00:00.000Z",
    ...overrides,
  };
}

/* ── Setup default mocks ─────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGuest.mockReturnValue({
    data: makeGuest(),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseReservations.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  });
  mockUseAddStaffNote.mockReturnValue({
    mutateAsync: mockAddStaffNoteMutateAsync,
    isPending: false,
  });
  mockAddStaffNoteMutateAsync.mockResolvedValue(makeGuest());
});

/* ── Tests ───────────────────────────────────────────── */

describe("GuestCard", () => {
  describe("loading state", () => {
    it("renders skeleton while loading", () => {
      mockUseGuest.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByTestId("guest-card-loading")).toBeDefined();
    });
  });

  describe("error state", () => {
    it("renders error message when fetch fails", () => {
      mockUseGuest.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Not found"),
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByTestId("guest-card-error")).toBeDefined();
    });

    it("renders retry button in error state", () => {
      const refetch = vi.fn();
      mockUseGuest.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Network error"),
        refetch,
      });
      render(<GuestCard guestId="guest-1" />);
      const btn = screen.getByRole("button", { name: /retry/i });
      fireEvent.click(btn);
      expect(refetch).toHaveBeenCalledOnce();
    });
  });

  describe("empty / no guest", () => {
    it("renders nothing when guestId is null", () => {
      const { container } = render(<GuestCard guestId={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("header", () => {
    it("renders guest name", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText("Alice Smith")).toBeDefined();
    });

    it("renders visit count", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText(/5\s*visits?/i)).toBeDefined();
    });

    it("shows VIP badge when visitCount >= 10 and has vip tag", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({ visitCount: 12, tags: ["vip"] }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText("VIP")).toBeDefined();
    });

    it("shows Repeat badge when visitCount >= 2 and not VIP", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({ visitCount: 3, tags: [] }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText("Repeat")).toBeDefined();
    });

    it("shows New badge when visitCount is 0 or 1", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({ visitCount: 1, tags: [] }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText("New")).toBeDefined();
    });
  });

  describe("allergy warnings", () => {
    it("shows allergy banner when dietary restrictions include known allergens", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({ dietaryRestrictions: ["nut", "shellfish"] }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByTestId("allergy-warning-banner")).toBeDefined();
    });

    it("does not show allergy banner when no allergens", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({ dietaryRestrictions: ["vegan"] }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.queryByTestId("allergy-warning-banner")).toBeNull();
    });

    it("does not show allergy banner when dietaryRestrictions is null", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.queryByTestId("allergy-warning-banner")).toBeNull();
    });

    it("shows all allergen names in banner", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({ dietaryRestrictions: ["nut", "dairy"] }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      const banner = screen.getByTestId("allergy-warning-banner");
      expect(banner.textContent).toContain("nut");
      expect(banner.textContent).toContain("dairy");
    });
  });

  describe("dietary restrictions", () => {
    it("renders dietary restrictions as badges", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({ dietaryRestrictions: ["vegan", "gluten-free"] }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText("vegan")).toBeDefined();
      expect(screen.getByText("gluten-free")).toBeDefined();
    });

    it("does not render dietary section when null", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.queryByTestId("dietary-restrictions")).toBeNull();
    });
  });

  describe("contact", () => {
    it("renders email", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText("alice@example.com")).toBeDefined();
    });

    it("renders phone", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText("+1 555 000 0001")).toBeDefined();
    });

    it("renders email as mailto link", () => {
      render(<GuestCard guestId="guest-1" />);
      const link = screen.getByRole("link", { name: /alice@example.com/i });
      expect(link.getAttribute("href")).toBe("mailto:alice@example.com");
    });

    it("renders phone as tel link", () => {
      render(<GuestCard guestId="guest-1" />);
      const link = screen.getByRole("link", { name: /\+1 555 000 0001/i });
      expect(link.getAttribute("href")).toContain("tel:");
    });
  });

  describe("occasion history", () => {
    it("shows occasions from linked reservations", () => {
      mockUseReservations.mockReturnValue({
        data: [
          makeReservation({ occasion: "birthday", date: "2026-03-15" }),
          makeReservation({ id: "res-2", occasion: "anniversary", date: "2026-01-08" }),
        ],
        isLoading: false,
        error: null,
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByText(/birthday/i)).toBeDefined();
      expect(screen.getByText(/anniversary/i)).toBeDefined();
    });

    it("omits reservations with no occasion or occasion=none", () => {
      mockUseReservations.mockReturnValue({
        data: [
          makeReservation({ occasion: null }),
          makeReservation({ id: "res-2", occasion: "none" }),
        ],
        isLoading: false,
        error: null,
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.queryByTestId("occasion-history")).toBeNull();
    });

    it("does not render occasion section when no reservations", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.queryByTestId("occasion-history")).toBeNull();
    });
  });

  describe("staff notes", () => {
    it("shows latest 3 staff notes", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({
          staffNotes: [
            { text: "Note 1", createdBy: "staff-1", createdAt: "2026-04-01T10:00:00.000Z" },
            { text: "Note 2", createdBy: "staff-2", createdAt: "2026-04-02T10:00:00.000Z" },
            { text: "Note 3", createdBy: "staff-3", createdAt: "2026-04-03T10:00:00.000Z" },
            { text: "Note 4", createdBy: "staff-4", createdAt: "2026-04-04T10:00:00.000Z" },
          ],
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      // Latest 3 shown (Note 4, Note 3, Note 2)
      expect(screen.getByText("Note 4")).toBeDefined();
      expect(screen.getByText("Note 3")).toBeDefined();
      expect(screen.getByText("Note 2")).toBeDefined();
      expect(screen.queryByText("Note 1")).toBeNull();
    });

    it("shows show all button when more than 3 notes", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({
          staffNotes: [
            { text: "Note 1", createdBy: "staff-1", createdAt: "2026-04-01T10:00:00.000Z" },
            { text: "Note 2", createdBy: "staff-2", createdAt: "2026-04-02T10:00:00.000Z" },
            { text: "Note 3", createdBy: "staff-3", createdAt: "2026-04-03T10:00:00.000Z" },
            { text: "Note 4", createdBy: "staff-4", createdAt: "2026-04-04T10:00:00.000Z" },
          ],
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByRole("button", { name: /show all/i })).toBeDefined();
    });

    it("expands to show all notes when show all clicked", async () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({
          staffNotes: [
            { text: "Note 1", createdBy: "staff-1", createdAt: "2026-04-01T10:00:00.000Z" },
            { text: "Note 2", createdBy: "staff-2", createdAt: "2026-04-02T10:00:00.000Z" },
            { text: "Note 3", createdBy: "staff-3", createdAt: "2026-04-03T10:00:00.000Z" },
            { text: "Note 4", createdBy: "staff-4", createdAt: "2026-04-04T10:00:00.000Z" },
          ],
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      fireEvent.click(screen.getByRole("button", { name: /show all/i }));
      await waitFor(() => {
        expect(screen.getByText("Note 1")).toBeDefined();
      });
    });

    it("does not show show all when 3 or fewer notes", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({
          staffNotes: [
            { text: "Note 1", createdBy: "staff-1", createdAt: "2026-04-01T10:00:00.000Z" },
            { text: "Note 2", createdBy: "staff-2", createdAt: "2026-04-02T10:00:00.000Z" },
          ],
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<GuestCard guestId="guest-1" />);
      expect(screen.queryByRole("button", { name: /show all/i })).toBeNull();
    });

    it("does not render notes section when staffNotes empty", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.queryByTestId("staff-notes")).toBeNull();
    });
  });

  describe("add note inline action", () => {
    it("renders Add Note button", () => {
      render(<GuestCard guestId="guest-1" />);
      expect(screen.getByRole("button", { name: /add note/i })).toBeDefined();
    });

    it("shows textarea after clicking Add Note", async () => {
      render(<GuestCard guestId="guest-1" />);
      fireEvent.click(screen.getByRole("button", { name: /add note/i }));
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/type a note/i)).toBeDefined();
      });
    });

    it("calls addNote mutation on submit", async () => {
      render(<GuestCard guestId="guest-1" />);
      fireEvent.click(screen.getByRole("button", { name: /add note/i }));
      const textarea = await screen.findByPlaceholderText(/type a note/i);
      fireEvent.change(textarea, { target: { value: "Great guest" } });
      fireEvent.click(screen.getByRole("button", { name: /save note/i }));
      await waitFor(() => {
        expect(mockAddStaffNoteMutateAsync).toHaveBeenCalledWith({
          guestId: "guest-1",
          text: "Great guest",
        });
      });
    });

    it("hides form after successful note save", async () => {
      render(<GuestCard guestId="guest-1" />);
      fireEvent.click(screen.getByRole("button", { name: /add note/i }));
      const textarea = await screen.findByPlaceholderText(/type a note/i);
      fireEvent.change(textarea, { target: { value: "Great guest" } });
      fireEvent.click(screen.getByRole("button", { name: /save note/i }));
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/type a note/i)).toBeNull();
      });
    });

    it("cancel hides the note form without saving", async () => {
      render(<GuestCard guestId="guest-1" />);
      fireEvent.click(screen.getByRole("button", { name: /add note/i }));
      await screen.findByPlaceholderText(/type a note/i);
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/type a note/i)).toBeNull();
      });
      expect(mockAddStaffNoteMutateAsync).not.toHaveBeenCalled();
    });

    it("save note button disabled when textarea empty", async () => {
      render(<GuestCard guestId="guest-1" />);
      fireEvent.click(screen.getByRole("button", { name: /add note/i }));
      await screen.findByPlaceholderText(/type a note/i);
      expect(screen.getByRole("button", { name: /save note/i })).toBeDisabled();
    });
  });

  describe("quick actions", () => {
    it("renders Edit Profile link when onEditProfile provided", () => {
      render(<GuestCard guestId="guest-1" onEditProfile={vi.fn()} />);
      expect(screen.getByRole("button", { name: /edit profile/i })).toBeDefined();
    });
  });
});
