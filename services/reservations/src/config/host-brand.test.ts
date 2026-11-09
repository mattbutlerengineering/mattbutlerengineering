import { describe, it, expect } from "vitest";
import { createHostBrandResolver, hostBrandFor, resolveOriginHost } from "./host-brand.js";

describe("resolveOriginHost", () => {
  it("resolves eat-sheet.com from an Origin header", () => {
    expect(resolveOriginHost("https://eat-sheet.com")).toBe("eat-sheet.com");
  });

  it("resolves www.eat-sheet.com to the apex eat-sheet.com", () => {
    expect(resolveOriginHost("https://www.eat-sheet.com")).toBe("eat-sheet.com");
  });

  it("resolves mattbutlerengineering.com from an Origin header", () => {
    expect(resolveOriginHost("https://mattbutlerengineering.com")).toBe(
      "mattbutlerengineering.com"
    );
  });

  it("returns null for an unrecognized host — never a guessed brand", () => {
    expect(resolveOriginHost("https://evil.example.com")).toBeNull();
  });

  it("returns null when the header is missing", () => {
    expect(resolveOriginHost(undefined)).toBeNull();
  });

  it("returns null for a malformed Origin value rather than throwing", () => {
    expect(resolveOriginHost("not-a-url")).toBeNull();
  });

  it("takes the first value when Fastify hands back an array", () => {
    expect(resolveOriginHost(["https://eat-sheet.com", "https://other.com"])).toBe("eat-sheet.com");
  });
});

describe("hostBrandFor", () => {
  const env = {
    verifiedFromAddress: "reservations@mattbutlerengineering.com",
    eatSheetFromAddress: "reservations@eat-sheet.com",
    mbeManageBaseUrl: "https://mattbutlerengineering.com",
    eatSheetManageBaseUrl: "https://eat-sheet.com",
  };

  it("brands eat-sheet.com bookings with the eat-sheet name, manage base and eat-sheet.com from-address", () => {
    const brand = hostBrandFor("eat-sheet.com", env);
    expect(brand.brandName).toBe("eat-sheet");
    expect(brand.manageBaseUrl).toBe("https://eat-sheet.com");
    // eat-sheet.com is a verified Resend sending domain since 2026-11-09 (#8012).
    expect(brand.fromAddress).toBe("eat-sheet <reservations@eat-sheet.com>");
  });

  it("keeps today's mattbutlerengineering.com behavior for a null origin host", () => {
    const brand = hostBrandFor(null, env);
    expect(brand.brandName).toBe("Matt Butler Engineering");
    expect(brand.manageBaseUrl).toBe("https://mattbutlerengineering.com");
    expect(brand.fromAddress).toBe("reservations@mattbutlerengineering.com");
  });

  it("keeps today's behavior for the mattbutlerengineering.com origin host", () => {
    const brand = hostBrandFor("mattbutlerengineering.com", env);
    expect(brand.brandName).toBe("Matt Butler Engineering");
    expect(brand.fromAddress).toBe("reservations@mattbutlerengineering.com");
  });

  it("preserves an already-named eat-sheet from-address's email when branding eat-sheet", () => {
    const brand = hostBrandFor("eat-sheet.com", {
      ...env,
      eatSheetFromAddress: "Bookings <hello@eat-sheet.com>",
    });
    expect(brand.fromAddress).toBe("eat-sheet <hello@eat-sheet.com>");
  });
});

describe("createHostBrandResolver", () => {
  it("reads env vars once and resolves eat-sheet.com by brand name", () => {
    const resolver = createHostBrandResolver({
      EMAIL_FROM: "reservations@mattbutlerengineering.com",
      EAT_SHEET_EMAIL_FROM: "bookings@eat-sheet.com",
      MANAGE_BASE_URL: "https://mattbutlerengineering.com",
      EAT_SHEET_MANAGE_BASE_URL: "https://eat-sheet.com",
    });

    expect(resolver("eat-sheet.com")).toEqual({
      brandName: "eat-sheet",
      fromAddress: "eat-sheet <bookings@eat-sheet.com>",
      manageBaseUrl: "https://eat-sheet.com",
    });
    expect(resolver(null)).toEqual({
      brandName: "Matt Butler Engineering",
      fromAddress: "reservations@mattbutlerengineering.com",
      manageBaseUrl: "https://mattbutlerengineering.com",
    });
  });

  it("falls back to defaults when env vars are unset", () => {
    const resolver = createHostBrandResolver({});
    expect(resolver("eat-sheet.com").manageBaseUrl).toBe("https://eat-sheet.com");
    expect(resolver("eat-sheet.com").fromAddress).toBe("eat-sheet <reservations@eat-sheet.com>");
    expect(resolver(null).fromAddress).toBe("reservations@mattbutlerengineering.com");
  });

  it("treats any non-eat-sheet.com value (including an unrecognized host) as the default brand", () => {
    const resolver = createHostBrandResolver({});
    expect(resolver("some-other-host.com").brandName).toBe("Matt Butler Engineering");
  });
});
