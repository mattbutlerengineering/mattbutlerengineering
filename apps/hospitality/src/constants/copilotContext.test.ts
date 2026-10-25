import { describe, it, expect } from "vitest";
import { chatRequestContext, describeChatAction } from "./copilotContext.js";

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

describe("describeChatAction", () => {
  const t = (key: string) => `t:${key}`;
  const tableName = (id: string) => (id === "tbl-1" ? "Patio 2" : undefined);

  it("titles the action and shows the table's name, never its id", () => {
    const description = describeChatAction(
      {
        actionId: "a1",
        toolName: "seat_walk_in",
        toolInput: { partySize: 2, tableId: "tbl-1", guestName: "Lee" },
      },
      t,
      tableName
    );

    expect(description.title).toBe("t:chat.actions.seat_walk_in");
    expect(description.details).toEqual([
      { label: "t:chat.actions.fields.partySize", value: "2" },
      { label: "t:chat.actions.fields.tableId", value: "Patio 2" },
      { label: "t:chat.actions.fields.guestName", value: "Lee" },
    ]);
  });

  it("translates a table status and keeps an unresolvable table id visible", () => {
    const description = describeChatAction(
      {
        actionId: "a2",
        toolName: "update_table_status",
        toolInput: { table: "dsf", status: "READY", tableId: "unknown" },
      },
      t,
      tableName
    );

    expect(description.details).toEqual([
      { label: "t:chat.actions.fields.table", value: "dsf" },
      { label: "t:chat.actions.fields.status", value: "t:floorPlan.tableStatus.ready" },
      { label: "t:chat.actions.fields.tableId", value: "unknown" },
    ]);
  });
});

describe("describeChatAction fallbacks", () => {
  it("shows a raw name rather than a translation key for an unknown tool or field", () => {
    const description = describeChatAction(
      { actionId: "a3", toolName: "add_to_waitlist", toolInput: { quotedWait: 15 } },
      (key) => `t:${key}`,
      () => undefined
    );

    expect(description).toEqual({
      title: "add to waitlist",
      details: [{ label: "quotedWait", value: "15" }],
    });
  });
});

describe("describeChatAction dates and times", () => {
  it("shows a booking's date and times as people read them, in the given locale", () => {
    const description = describeChatAction(
      {
        actionId: "a4",
        toolName: "create_reservation",
        toolInput: { date: "2026-10-30", startTime: "19:00", endTime: "20:30" },
      },
      (key) => `t:${key}`,
      () => undefined,
      "en-US"
    );

    expect(description.details.map((detail) => detail.value)).toEqual([
      "Friday, Oct 30",
      "7:00 PM",
      "8:30 PM",
    ]);
  });

  it("keeps a malformed date or time visible as sent: what is confirmed is what executes", () => {
    const description = describeChatAction(
      {
        actionId: "a5",
        toolName: "modify_reservation",
        toolInput: { date: "next Friday", startTime: "7pm" },
      },
      (key) => `t:${key}`,
      () => undefined,
      "en-US"
    );

    expect(description.details.map((detail) => detail.value)).toEqual(["next Friday", "7pm"]);
  });
});
