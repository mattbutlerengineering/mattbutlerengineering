import { describe, it, expect } from "vitest";
import { buildDirectionsUrl } from "./directions-url.js";

const ADDRESS = {
  line1: "1 Oak St",
  city: "Portland",
  region: "OR",
  postalCode: "97201",
  country: "US",
};

function query(url: string): string | null {
  const parsed = new URL(url);
  expect(parsed.origin + parsed.pathname).toBe("https://www.google.com/maps/search/");
  expect(parsed.searchParams.get("api")).toBe("1");
  return parsed.searchParams.get("query");
}

describe("buildDirectionsUrl", () => {
  it("searches the venue name and full address when the venue has one", () => {
    expect(query(buildDirectionsUrl("The Oak Table", { ...ADDRESS, line2: "Suite 2" }))).toBe(
      "The Oak Table, 1 Oak St, Suite 2, Portland, OR 97201, US"
    );
  });

  it("falls back to a venue-name search without an address", () => {
    expect(query(buildDirectionsUrl("The Oak Table", undefined))).toBe("The Oak Table");
  });

  it("URL-encodes every component, so hostile text cannot add parameters or change the host", () => {
    const url = buildDirectionsUrl("Fish & Chips #1?x=1", { ...ADDRESS, line1: "5 Main/St&api=2" });
    const parsed = new URL(url);
    expect(parsed.host).toBe("www.google.com");
    expect([...parsed.searchParams.keys()]).toEqual(["api", "query"]);
    expect(parsed.searchParams.get("query")).toContain("Fish & Chips #1?x=1");
    expect(parsed.searchParams.get("query")).toContain("5 Main/St&api=2");
    expect(url).not.toMatch(/[ #]/);
  });
});
