import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ApiClientError } from "@mbe/api-client";
import { ReservationSheet, type ReservationSheetProps } from "./ReservationSheet.js";
import { ERROR_COPY } from "../../lib/describe-api-error.js";
import type { Guest, Reservation, Table } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockUseGuest = vi.fn();

vi.mock("../../hooks/useGuests.js", () => ({
  useGuest: (id: string | null | undefined) => mockUseGuest(id),
}));

vi.mock("../crm/GuestCard.js", () => ({
  GuestCard: ({ guestId }: { guestId: string }) => <div data-testid="guest-card">{guestId}</div>,
}));

// Mock scrollIntoView for JSDOM (the Drawer's focus trap scrolls its first target).
window.HTMLElement.prototype.scrollIntoView = vi.fn();

/** A 500 the way `@mbe/api-client` raises it: `raw` is "<METHOD> <path> failed: 500 …". */
function serverError(method: string, path: string): ApiClientError {
  return new ApiClientError(
    {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "Internal Server Error",
    },
    method,
    path
  );
}

/* ── Fixtures ───────────────────────────────────────── */

const START = new Date(2026, 8, 9, 17, 30).toISOString();
const END = new Date(2026, 8, 9, 19, 30).toISOString();
const OCCUPIED_CAPTION = "Table 4 is still occupied — turn it or move the party.";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    date: "2026-09-09",
    startTime: START,
    endTime: END,
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Priya Shah",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "t4",
    venueId: "venue-1",
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "t4",
    name: "Table 4",
    tableNumber: null,
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    venueId: "venue-1",
    name: "Priya Shah",
    email: "priya@example.com",
    phone: null,
    notes: null,
    visitCount: 1,
    noShowCount: 0,
    riskScore: "trusted",
    lifetimeSpend: null,
    lastVisit: null,
    tags: null,
    dietaryRestrictions: null,
    communicationPreference: "email",
    createdAt: START,
    updatedAt: START,
    ...overrides,
  } as Guest;
}

function renderSheet(overrides: Partial<ReservationSheetProps> = {}) {
  const props: ReservationSheetProps = {
    reservation: makeReservation(),
    tables: [makeTable()],
    seated: false,
    open: true,
    onClose: vi.fn(),
    onSeat: vi.fn().mockResolvedValue(undefined),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<ReservationSheet {...props} />), props };
}

/**
 * rialto ships hashed CSS-module classes (`_compact_wnyls_88`), so a module-local name is
 * matched by its stem, not by string equality.
 */
function hasModuleClass(element: Element, name: string): boolean {
  const scoped = new RegExp(`^_${name}_[a-z0-9]+_\\d+$`);
  return element.className.split(/\s+/).some((cls) => cls === name || scoped.test(cls));
}

/**
 * The Drawer adds a size class for every size but the default (`variantClass` returns "" for
 * `size="default"`), so "default" is the absence of `compact` / `wide` / `full`.
 */
function drawerSize(element: Element): "compact" | "wide" | "full" | "default" {
  for (const name of ["compact", "wide", "full"] as const) {
    if (hasModuleClass(element, name)) return name;
  }
  return "default";
}

const seatButton = () => screen.queryByRole("button", { name: "Seat Guest" });
const moreButton = () => screen.getByRole("button", { name: /^More/ });

beforeEach(() => {
  mockUseGuest.mockReset();
  mockUseGuest.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

/* ── Tests ──────────────────────────────────────────── */

describe("ReservationSheet", () => {
  describe("summary row (ux Screen 4)", () => {
    it("is a bottom drawer named for the guest, with the party, time, table and status", () => {
      renderSheet();
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAccessibleName("Priya Shah");
      expect(within(dialog).getByText("party of 4")).toBeInTheDocument();
      expect(within(dialog).getByText("5:30 PM")).toBeInTheDocument();
      expect(within(dialog).getByText("Table 4")).toBeInTheDocument();
      expect(within(dialog).getByText("Confirmed")).toBeInTheDocument();
    });

    it("reads 'table unknown' when the table is absent from the list", () => {
      renderSheet({ tables: [] });
      expect(screen.getByText("table unknown")).toBeInTheDocument();
    });
  });

  describe("More ▾ (A5.3 sheet half, P13)", () => {
    it("has the compact class until More is pressed, default after, compact again on the second press", () => {
      renderSheet();
      const dialog = screen.getByRole("dialog");
      expect(drawerSize(dialog)).toBe("compact");
      expect(moreButton()).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(moreButton());
      expect(drawerSize(dialog)).toBe("default");
      expect(moreButton()).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(moreButton());
      expect(drawerSize(dialog)).toBe("compact");
      expect(moreButton()).toHaveAttribute("aria-expanded", "false");
    });

    it("reveals the GuestCard, email, phone and notes only once expanded", () => {
      renderSheet({
        reservation: makeReservation({
          guestId: "g1",
          guestEmail: "priya@example.com",
          guestPhone: "+1 555 0100",
          notes: "Window seat",
        }),
      });
      expect(screen.queryByTestId("guest-card")).toBeNull();
      expect(screen.queryByText("priya@example.com")).toBeNull();
      expect(screen.queryByText("Window seat")).toBeNull();

      fireEvent.click(moreButton());
      expect(screen.getByTestId("guest-card")).toHaveTextContent("g1");
      expect(screen.getByText("priya@example.com")).toBeInTheDocument();
      expect(screen.getByText("+1 555 0100")).toBeInTheDocument();
      expect(screen.getByText("Window seat")).toBeInTheDocument();
    });
  });

  describe("tag row (guest-signals)", () => {
    it("shows the segment badge and the allergy tags from the guest profile", () => {
      mockUseGuest.mockReturnValue({
        data: makeGuest({
          visitCount: 12,
          tags: ["vip"],
          dietaryRestrictions: ["Nut allergy", "vegetarian"],
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderSheet({ reservation: makeReservation({ guestId: "g1" }) });
      expect(mockUseGuest).toHaveBeenCalledWith("g1");
      expect(screen.getByText("VIP")).toBeInTheDocument();
      expect(screen.getByText("Allergy: Nut allergy")).toBeInTheDocument();
      expect(screen.queryByText("vegetarian")).toBeNull();
    });

    it("shows no tag row for a party without a profile", () => {
      renderSheet();
      expect(mockUseGuest).toHaveBeenCalledWith(null);
      expect(screen.queryByText("New")).toBeNull();
    });
  });

  describe("Seat Guest (ux Screen 5)", () => {
    it("offers Seat Guest for a PENDING party on a free table", () => {
      renderSheet({ reservation: makeReservation({ status: "PENDING" }) });
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(seatButton()).toBeInTheDocument();
    });

    it("hides Seat Guest and explains when the table is OCCUPIED by another party", () => {
      renderSheet({ tables: [makeTable({ status: "OCCUPIED" })] });
      expect(seatButton()).toBeNull();
      expect(screen.getByText(OCCUPIED_CAPTION)).toBeInTheDocument();
    });

    it("reads 'Seated' once the party is seated", () => {
      renderSheet({ tables: [makeTable({ status: "OCCUPIED" })], seated: true });
      expect(screen.getByText("Seated")).toBeInTheDocument();
      expect(seatButton()).toBeNull();
      expect(screen.queryByText(OCCUPIED_CAPTION)).toBeNull();
    });

    it("renders 'Guest not seated.' and keeps focus on the button when onSeat rejects", async () => {
      const onSeat = vi.fn().mockRejectedValue(serverError("POST", "/api/v1/reservations/r1/seat"));
      renderSheet({ onSeat });

      const button = seatButton()!;
      button.focus();
      fireEvent.click(button);

      const alert = await screen.findByRole("alert");
      expect(
        alert.textContent?.startsWith(`Guest not seated.${ERROR_COPY.serverError.detail}`)
      ).toBe(true);
      await waitFor(() => {
        expect(seatButton()).toHaveFocus();
      });
      expect(seatButton()).not.toBeDisabled();
    });
  });

  describe("action row (NF INCLUSIVE)", () => {
    it("routes Edit, Cancel and Close to the page", () => {
      const { props } = renderSheet();
      fireEvent.click(screen.getByRole("button", { name: "Edit reservation" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel reservation" }));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(props.onEdit).toHaveBeenCalledTimes(1);
      expect(props.onCancel).toHaveBeenCalledTimes(1);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("gives every action a 44 px minimum under the coarse-pointer / tablet query", () => {
      const css = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "ReservationSheet.module.css"),
        "utf-8"
      );
      const coarseBlock = css.match(
        /@media \(pointer: coarse\), \(max-width: 1024px\) \{([\s\S]*?)\n\}/
      );
      expect(coarseBlock).not.toBeNull();
      expect(coarseBlock?.[1]).toMatch(/\.actions > button\s*\{[^}]*min-block-size:\s*44px/);
    });
  });

  describe("accessibility contract (xcut H)", () => {
    it("is a named modal dialog whose controls all have names and whose More button announces what it controls", () => {
      renderSheet({ reservation: makeReservation({ guestEmail: "priya@example.com" }) });
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAccessibleName("Priya Shah");
      for (const control of within(dialog).getAllByRole("button")) {
        expect(control).toHaveAccessibleName();
      }

      const more = moreButton();
      const controlsId = more.getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
      fireEvent.click(more);
      const detail = document.getElementById(controlsId!);
      expect(detail).not.toBeNull();
      expect(detail).toHaveTextContent("priya@example.com");
    });
  });
});
