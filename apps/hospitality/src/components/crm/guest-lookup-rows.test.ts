import { describe, it, expect } from "vitest";
import type { Guest } from "@mbe/types";
import {
  formatGuestRowDetail,
  noShowsSentence,
  pickAnnouncement,
  stripTitle,
  visitsSentence,
} from "./guest-lookup-rows.js";

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "gst_priya",
    venueId: "venue-1",
    name: "Priya Shah",
    email: "priya@example.com",
    phone: "(555) 010-0100",
    notes: null,
    visitCount: 12,
    noShowCount: 1,
    riskScore: "risky",
    lifetimeSpend: "1200.00",
    lastVisit: "2026-04-01T00:00:00.000Z",
    tags: ["vip"],
    dietaryRestrictions: ["shellfish", "vegetarian"],
    staffNotes: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("guest-lookup-rows", () => {
  describe("formatGuestRowDetail", () => {
    it("joins phone, email and visits with middle dots (ux.md § Copy)", () => {
      expect(formatGuestRowDetail(makeGuest())).toBe(
        "(555) 010-0100 · priya@example.com · 12 visits"
      );
    });

    it("omits a null contact and singularises one visit", () => {
      expect(formatGuestRowDetail(makeGuest({ phone: null, visitCount: 1 }))).toBe(
        "priya@example.com · 1 visit"
      );
    });

    it("omits visits at zero (Q4) and reads 'no contact on file' when both contacts are null", () => {
      expect(formatGuestRowDetail(makeGuest({ phone: null, email: null, visitCount: 0 }))).toBe(
        "no contact on file"
      );
    });

    it("keeps a contact when only visits are zero", () => {
      expect(formatGuestRowDetail(makeGuest({ email: null, visitCount: 0 }))).toBe(
        "(555) 010-0100"
      );
    });
  });

  describe("visitsSentence", () => {
    it.each([
      [12, "12 visits"],
      [1, "1 visit"],
      [0, "No visits on record yet"],
    ])("%d → %s", (count, sentence) => {
      expect(visitsSentence(count)).toBe(sentence);
    });
  });

  describe("noShowsSentence", () => {
    it.each([
      [1, "1 no-show"],
      [3, "3 no-shows"],
    ])("%d → %s", (count, sentence) => {
      expect(noShowsSentence(count)).toBe(sentence);
    });

    it("is null at zero so the strip omits the row", () => {
      expect(noShowsSentence(0)).toBeNull();
    });
  });

  describe("stripTitle", () => {
    it("names the linked profile and the recognised guest", () => {
      expect(stripTitle("linked", "Priya Shah")).toBe("Using Priya Shah's profile");
      expect(stripTitle("recognised", "Priya Shah")).toBe("Recognised Priya Shah");
    });
  });

  describe("pickAnnouncement", () => {
    it("reads the ux.md pick sentence for a linked profile", () => {
      expect(pickAnnouncement("linked", makeGuest())).toBe(
        "Using Priya Shah's profile — 12 visits, 1 no-show. Allergy: shellfish."
      );
    });

    it("starts with 'Recognised' on the waitlist", () => {
      expect(pickAnnouncement("recognised", makeGuest())).toBe(
        "Recognised Priya Shah — 12 visits, 1 no-show. Allergy: shellfish."
      );
    });

    it("reads the honest zero state without a no-show or allergy clause", () => {
      const jordan = makeGuest({
        name: "Jordan Lee",
        visitCount: 0,
        noShowCount: 0,
        dietaryRestrictions: null,
      });
      expect(pickAnnouncement("linked", jordan)).toBe(
        "Using Jordan Lee's profile — no visits on record yet."
      );
    });

    it("omits the no-show clause at zero and lists every allergy", () => {
      const guest = makeGuest({
        noShowCount: 0,
        dietaryRestrictions: ["vegetarian", "nut allergy", "no dairy"],
      });
      expect(pickAnnouncement("linked", guest)).toBe(
        "Using Priya Shah's profile — 12 visits. Allergy: nut allergy, no dairy."
      );
    });
  });

  it("does not mutate its inputs", () => {
    const guest = makeGuest();
    const before = structuredClone(guest);
    formatGuestRowDetail(guest);
    pickAnnouncement("linked", guest);
    pickAnnouncement("recognised", guest);
    expect(guest).toStrictEqual(before);
  });
});
