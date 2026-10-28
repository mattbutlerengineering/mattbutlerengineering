import { describe, it, expect } from "vitest";
import { chatPageContext, chatSuggestionKeys } from "./chatPageContext.js";

describe("chatPageContext", () => {
  it("names the dashboard page the chat is open on", () => {
    expect(chatPageContext("/availability", "")).toEqual({ page: "availability" });
    expect(chatPageContext("/hospitality/guests", "")).toEqual({ page: "guests" });
  });

  it("treats the dashboard root as the timeline", () => {
    expect(chatPageContext("/", "")).toEqual({ page: "timeline" });
  });

  it("sends the timeline's selected reservation and day", () => {
    expect(chatPageContext("/timeline", "?date=2026-10-30&selected=res-42")).toEqual({
      page: "timeline",
      focus: { kind: "reservation", id: "res-42" },
      focusDate: "2026-10-30",
    });
  });

  it("sends the open floor plan and menu from the path", () => {
    expect(chatPageContext("/floor-plans/fp_1", "")).toEqual({
      page: "floor-plans",
      focus: { kind: "floorPlan", id: "fp_1" },
    });
    expect(chatPageContext("/menus/menu-9", "")).toEqual({
      page: "menus",
      focus: { kind: "menu", id: "menu-9" },
    });
  });

  it("sends the day the reservations and briefing pages show", () => {
    expect(chatPageContext("/briefing", "?date=2026-11-01")).toEqual({
      page: "briefing",
      focusDate: "2026-11-01",
    });
  });

  it("leaves out pages the agent doesn't know and values that don't fit", () => {
    expect(chatPageContext("/chat", "")).toEqual({});
    expect(chatPageContext("/admin", "")).toEqual({});
    expect(chatPageContext("/timeline", "?date=tomorrow&selected=a%20b")).toEqual({
      page: "timeline",
    });
  });
});

describe("chatSuggestionKeys", () => {
  it("offers Tonight changes on the Availability page", () => {
    expect(chatSuggestionKeys("availability")).toContain("chat.suggestions.stopOnline");
  });

  it("offers the general questions elsewhere", () => {
    expect(chatSuggestionKeys(undefined)).toEqual([
      "chat.suggestions.tonight",
      "chat.suggestions.openTables",
      "chat.suggestions.availability",
      "chat.suggestions.walkIn",
    ]);
  });
});
