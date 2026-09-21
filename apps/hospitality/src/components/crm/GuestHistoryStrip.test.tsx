import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Guest } from "@mbe/types";
import { GuestHistoryStrip } from "./GuestHistoryStrip.js";

/** SC2 fixture: Priya, 4 visits, 1 no-show, shellfish allergy (plus one plain restriction). */
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
    dietaryRestrictions: ["shellfish", "vegetarian"],
    staffNotes: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

const priya = makeGuest();
const firstTimer = makeGuest({
  id: "gst_jordan",
  name: "Jordan Lee",
  visitCount: 0,
  noShowCount: 0,
  riskScore: "trusted",
  tags: null,
  dietaryRestrictions: null,
});

describe("GuestHistoryStrip", () => {
  it("is a group named by the linked title and lists visits, no-shows and risk", () => {
    render(<GuestHistoryStrip guest={priya} mode="linked" onClear={() => {}} />);
    const group = screen.getByRole("group", { name: "Using Priya Shah's profile" });
    expect(group).toHaveTextContent("4 visits");
    expect(group).toHaveTextContent("1 no-show");
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
  });

  it("marks allergies with the error Tag and an Allergy: prefix, other restrictions plain", () => {
    render(<GuestHistoryStrip guest={priya} mode="linked" onClear={() => {}} />);
    const allergy = screen.getByText("Allergy: shellfish");
    expect(allergy.className).toMatch(/_error_/);
    const plain = screen.getByText("vegetarian");
    expect(plain.className).not.toMatch(/_error_/);
    expect(screen.queryByText(/Allergy: vegetarian/)).toBeNull();
  });

  it("clears through a ghost Button named for the guest", () => {
    const onClear = vi.fn();
    render(<GuestHistoryStrip guest={priya} mode="linked" onClear={onClear} />);
    const button = screen.getByRole("button", { name: "Clear Priya Shah" });
    expect(button).toHaveTextContent("Clear");
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders the zero state without a segment Badge, no-shows or tags", () => {
    render(<GuestHistoryStrip guest={firstTimer} mode="linked" onClear={() => {}} />);
    const group = screen.getByRole("group", { name: "Using Jordan Lee's profile" });
    expect(group).toHaveTextContent("No visits on record yet");
    expect(screen.queryByText("New")).toBeNull();
    expect(screen.queryByText("VIP")).toBeNull();
    expect(screen.queryByText("Repeat")).toBeNull();
    expect(group).not.toHaveTextContent("no-show");
    expect(screen.queryByText("Trusted")).toBeNull();
  });

  it("names the group Recognised … in recognised mode", () => {
    render(<GuestHistoryStrip guest={priya} mode="recognised" onClear={() => {}} />);
    expect(screen.getByRole("group", { name: "Recognised Priya Shah" })).toBeInTheDocument();
  });

  it("renders the caption only when given", () => {
    const caption =
      "Edits to email or phone below change this booking only — the profile isn't edited.";
    const { rerender } = render(
      <GuestHistoryStrip guest={priya} mode="linked" caption={caption} onClear={() => {}} />
    );
    expect(screen.getByText(caption)).toBeInTheDocument();
    rerender(<GuestHistoryStrip guest={priya} mode="linked" onClear={() => {}} />);
    expect(screen.queryByText(caption)).toBeNull();
  });
});
