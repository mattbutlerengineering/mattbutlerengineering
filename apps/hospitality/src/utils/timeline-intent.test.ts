import { describe, expect, it } from "vitest";
import { parseTimelineIntent, stripTimelineIntent } from "./timeline-intent.js";

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
