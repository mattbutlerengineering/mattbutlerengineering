import { describe, expect, it } from "vitest";
import {
  parseReservationsIntent,
  parseTimelineIntent,
  stripReservationsIntent,
  stripTimelineIntent,
} from "./timeline-intent.js";

describe("parseTimelineIntent", () => {
  it("reads walkin=true exactly", () => {
    expect(parseTimelineIntent(new URLSearchParams("walkin=true")).walkIn).toBe(true);
    expect(parseTimelineIntent(new URLSearchParams("walkin=TRUE")).walkIn).toBe(false);
    expect(parseTimelineIntent(new URLSearchParams("walkin=1")).walkIn).toBe(false);
    expect(parseTimelineIntent(new URLSearchParams("")).walkIn).toBe(false);
  });

  it("trims the selected id and treats blank as absent", () => {
    expect(parseTimelineIntent(new URLSearchParams("selected= x ")).selectedId).toBe("x");
    expect(parseTimelineIntent(new URLSearchParams("selected=")).selectedId).toBeNull();
    expect(parseTimelineIntent(new URLSearchParams("selected=%20")).selectedId).toBeNull();
    expect(parseTimelineIntent(new URLSearchParams("date=2026-09-04")).selectedId).toBeNull();
  });

  it("reads both intents together", () => {
    expect(parseTimelineIntent(new URLSearchParams("walkin=true&selected=res_1"))).toEqual({
      walkIn: true,
      selectedId: "res_1",
    });
  });
});

describe("stripTimelineIntent", () => {
  it("returns a new instance with both intent keys removed and the date kept", () => {
    const params = new URLSearchParams("date=2026-09-04&walkin=true&selected=res_1");

    const stripped = stripTimelineIntent(params);

    expect(stripped).not.toBe(params);
    expect(stripped.toString()).toBe("date=2026-09-04");
    expect(params.toString()).toBe("date=2026-09-04&walkin=true&selected=res_1");
  });

  it("is a no-op copy when no intent is present", () => {
    expect(stripTimelineIntent(new URLSearchParams("date=2026-09-04")).toString()).toBe(
      "date=2026-09-04"
    );
  });
});

describe("parseReservationsIntent (architecture § Amendment 2026-09-04)", () => {
  it("reads new=true exactly", () => {
    expect(parseReservationsIntent(new URLSearchParams("new=true"))).toEqual({
      newReservation: true,
    });
  });

  it("is value-exact and case-sensitive: new=TRUE, new=1 and absent are no intent", () => {
    expect(parseReservationsIntent(new URLSearchParams("new=TRUE")).newReservation).toBe(false);
    expect(parseReservationsIntent(new URLSearchParams("new=1")).newReservation).toBe(false);
    expect(parseReservationsIntent(new URLSearchParams("")).newReservation).toBe(false);
    expect(
      parseReservationsIntent(new URLSearchParams("date=2026-09-04&status=all")).newReservation
    ).toBe(false);
  });
});

describe("stripReservationsIntent", () => {
  it("returns a different instance without `new`, with date and status intact", () => {
    const params = new URLSearchParams("new=true&date=2026-09-04&status=CONFIRMED");
    const next = stripReservationsIntent(params);
    expect(next).not.toBe(params);
    expect(next.has("new")).toBe(false);
    expect(next.get("date")).toBe("2026-09-04");
    expect(next.get("status")).toBe("CONFIRMED");
    // The input is never mutated.
    expect(params.get("new")).toBe("true");
  });

  it("leaves the Timeline's own intent keys alone — it is the Reservations page's strip, not the Timeline's", () => {
    const next = stripReservationsIntent(
      new URLSearchParams("new=true&walkin=true&selected=res-1")
    );
    expect(next.toString()).toBe("walkin=true&selected=res-1");
  });
});
