import { describe, it, expect } from "vitest";
import { localeRuntime } from "./runtime.js";
import enUS from "./catalogs/en-US.json";
import enGB from "./catalogs/en-GB.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";

/**
 * The Special Requests copy lives in the message catalog, and every surface
 * (guest pages and the host ticket) reads it through `t()`. The host caption
 * quotes the guest acknowledgement by nesting its key, so guest and host read
 * the same words in every locale (SC4). Pinned here in en-US, resolved
 * through the app's own i18next instance so the nesting is exercised.
 */
const t = localeRuntime.i18n.getFixedT("en-US");
const NESTED_ACKNOWLEDGEMENT = "$t(bookingWidget.specialRequests.acknowledgement)";

const label = t("bookingWidget.specialRequests.label");
const acknowledgement = t("bookingWidget.specialRequests.acknowledgement");
const hostCaption = t("bookingWidget.specialRequests.hostCaption");

/** The confirmation's contact line (PRD SC7), as the guest reads it. */
function contactLine(contact: string): string {
  return t("bookingWidget.confirmation.contactLine", { contact });
}

describe("en-US Special Requests copy", () => {
  it("pins the Special Requests label", () => {
    expect(label).toBe("Special Requests");
  });

  it("pins the acknowledgement, with a straight apostrophe", () => {
    expect(acknowledgement).toBe("Noted. It's on your reservation for the team.");
  });

  it("pins the host caption, quoting the acknowledgement in curly quotes", () => {
    expect(hostCaption).toBe(
      "Guests see this with: “Noted. It's on your reservation for the team.”"
    );
  });
});

describe("host caption nests the acknowledgement by key", () => {
  it.each([
    ["en-US", enUS],
    ["es-MX", esMX],
    ["fr-CA", frCA],
  ] as const)("%s nests the key and does not retype the sentence", (_tag, catalog) => {
    const copy = catalog.bookingWidget.specialRequests;
    expect(copy.hostCaption).toContain(NESTED_ACKNOWLEDGEMENT);
    expect(copy.hostCaption).not.toContain(copy.acknowledgement);
  });

  it.each([
    ["es-MX", esMX],
    ["fr-CA", frCA],
  ] as const)("%s resolves to a caption containing its own acknowledgement", (tag, catalog) => {
    localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
    const resolved = localeRuntime.i18n.getFixedT(tag)("bookingWidget.specialRequests.hostCaption");
    expect(resolved).toContain(catalog.bookingWidget.specialRequests.acknowledgement);
    expect(resolved).not.toContain("$t(");
  });

  it("en-GB omits the keys and falls back to en-US", () => {
    expect(JSON.stringify(enGB)).not.toContain("hostCaption");
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
    expect(acknowledgement.toLowerCase()).not.toContain(word);
    expect(hostCaption.toLowerCase()).not.toContain(word);
  });

  it.each(falseSends)("contact line never says %j", (phrase) => {
    expect(contactLine("x@y.z").toLowerCase()).not.toContain(phrase);
  });
});
