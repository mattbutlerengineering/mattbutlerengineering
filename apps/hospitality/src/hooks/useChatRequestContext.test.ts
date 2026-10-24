import { describe, it, expect } from "vitest";
import { chatRequestContext } from "./useChatRequestContext.js";

describe("chatRequestContext", () => {
  it("sends the selected venue and its time zone", () => {
    expect(chatRequestContext({ id: "venue-1", ianaTimezone: "America/Los_Angeles" })).toEqual({
      venueId: "venue-1",
      timeZone: "America/Los_Angeles",
    });
  });

  it("sends nothing when no venue is selected", () => {
    expect(chatRequestContext(null)).toEqual({});
  });

  it("drops a zone the runtime rejects, so the server never 400s the whole chat on it", () => {
    expect(chatRequestContext({ id: "venue-1", ianaTimezone: "Bad/Zone" })).toEqual({
      venueId: "venue-1",
    });
  });
});
