import { describe, it, expect } from "vitest";
import {
  appUrl,
  homeUrl,
  hostConfig,
  legacyPathRedirect,
  manageReservationUrl,
} from "./host-brand.js";

describe("hostConfig", () => {
  it.each(["eat-sheet.com", "www.eat-sheet.com", "EAT-SHEET.COM"])(
    "serves %s standalone at the root under the eat-sheet brand",
    (host) => {
      const config = hostConfig(host);
      expect(config.basename).toBe("");
      expect(config.standalone).toBe(true);
      expect(config.brand.name).toBe("eat-sheet");
      expect(config.brand.logo).toBe("eat-sheet");
    }
  );

  it.each([
    "mattbutlerengineering.com",
    "localhost",
    "evil-eat-sheet.com",
    "eat-sheet.com.evil.io",
  ])("keeps %s on the /hospitality basename and the current brand", (host) => {
    const config = hostConfig(host);
    expect(config.basename).toBe("/hospitality");
    expect(config.standalone).toBe(false);
    expect(config.brand.name).toBe("Matt Butler Engineering");
    expect(config.brand.logo).toBe("MBE");
  });
});

describe("appUrl", () => {
  it("builds an absolute in-app URL on the host the app is served from", () => {
    expect(
      appUrl("/reservations/manage", { origin: "https://eat-sheet.com", hostname: "eat-sheet.com" })
    ).toBe("https://eat-sheet.com/reservations/manage");
    expect(
      appUrl("/reservations/manage", {
        origin: "https://mattbutlerengineering.com",
        hostname: "mattbutlerengineering.com",
      })
    ).toBe("https://mattbutlerengineering.com/hospitality/reservations/manage");
  });
});

describe("homeUrl", () => {
  it.each(["eat-sheet.com", "mattbutlerengineering.com"])(
    "is the root of the serving host %s",
    (hostname) => {
      expect(homeUrl({ origin: `https://${hostname}` })).toBe(`https://${hostname}/`);
    }
  );
});

describe("manageReservationUrl", () => {
  it.each([
    ["eat-sheet.com", "https://eat-sheet.com/reservations/manage?token=a%2Fb"],
    [
      "mattbutlerengineering.com",
      "https://mattbutlerengineering.com/hospitality/reservations/manage?token=a%2Fb",
    ],
  ])("links guests on %s back to the host they booked on", (hostname, expected) => {
    expect(manageReservationUrl("a/b", { origin: `https://${hostname}`, hostname })).toBe(expected);
  });
});

describe("legacyPathRedirect", () => {
  it.each([
    ["/hospitality", "/"],
    ["/hospitality/", "/"],
    ["/hospitality/reservations/manage", "/reservations/manage"],
  ])("maps the legacy %s to %s on a root-served host", (path, expected) => {
    expect(legacyPathRedirect(path, "")).toBe(expected);
  });

  it("leaves paths that only share leading characters alone", () => {
    expect(legacyPathRedirect("/hospitalityx", "")).toBeNull();
    expect(legacyPathRedirect("/book/venue", "")).toBeNull();
  });

  it("never rewrites under the /hospitality basename", () => {
    expect(legacyPathRedirect("/hospitality/book/x", "/hospitality")).toBeNull();
  });
});
