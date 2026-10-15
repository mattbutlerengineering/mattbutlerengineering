import { describe, it, expect } from "vitest";
import { CONFIRMATION_COPY } from "./confirmation-copy.js";
import enUS from "../i18n/catalogs/en-US.json";

/**
 * The guest pages render this copy through the message catalog (so it can be
 * translated); the host surfaces still read CONFIRMATION_COPY. The en-US
 * catalog must say exactly what the host is told guests see (SC4).
 */
const GUEST_COPY = enUS.bookingWidget.specialRequests;

/** The confirmation's contact line (PRD SC7), as the guest reads it. */
function contactLine(contact: string): string {
  return enUS.bookingWidget.confirmation.contactLine.replace("{{contact}}", contact);
}

describe("guest catalog copy matches CONFIRMATION_COPY", () => {
  it("uses the same Special Requests label", () => {
    expect(GUEST_COPY.label).toBe(CONFIRMATION_COPY.specialRequestsLabel);
  });

  it("uses the same acknowledgement", () => {
    expect(GUEST_COPY.acknowledgement).toBe(CONFIRMATION_COPY.acknowledgement);
  });
});

describe("CONFIRMATION_COPY", () => {
  it("pins the Special Requests label", () => {
    expect(CONFIRMATION_COPY.specialRequestsLabel).toBe("Special Requests");
  });

  it("pins the acknowledgement, with a straight apostrophe", () => {
    expect(CONFIRMATION_COPY.acknowledgement).toBe("Noted. It's on your reservation for the team.");
  });

  it("pins the host caption, quoting the acknowledgement in curly quotes", () => {
    expect(CONFIRMATION_COPY.hostCaption).toBe(
      "Guests see this with: “Noted. It's on your reservation for the team.”"
    );
  });

  it("is frozen", () => {
    expect(Object.isFrozen(CONFIRMATION_COPY)).toBe(true);
  });
});

describe("contactLine", () => {
  it("interpolates the contact into the honest sentence", () => {
    expect(contactLine("sam@example.com")).toBe(
      "No confirmation email or text is sent for this booking, so save these details. The venue has sam@example.com on your reservation."
    );
  });
});

describe("honesty limits (SC8)", () => {
  const overclaims = [
    "guarantee",
    "confirm",
    "reserved",
    "arranged",
    "kitchen",
    "chef",
    "will ",
    "taken care",
  ];
  const falseSends = ["has been sent", "we've sent", "check your", "will receive"];

  it.each(overclaims)("acknowledgement and host caption never say %j", (word) => {
    expect(CONFIRMATION_COPY.acknowledgement.toLowerCase()).not.toContain(word);
    expect(CONFIRMATION_COPY.hostCaption.toLowerCase()).not.toContain(word);
  });

  it.each(falseSends)("contact line never says %j", (phrase) => {
    expect(contactLine("x@y.z").toLowerCase()).not.toContain(phrase);
  });
});
