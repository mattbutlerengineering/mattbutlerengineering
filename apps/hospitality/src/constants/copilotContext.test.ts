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

  it("keeps an impossible calendar date as sent rather than rolling it over", () => {
    const description = describeChatAction(
      {
        actionId: "a6",
        toolName: "modify_reservation",
        toolInput: { date: "2026-13-45" },
      },
      (key) => `t:${key}`,
      () => undefined,
      "en-US"
    );
    const feb = describeChatAction(
      { actionId: "a7", toolName: "modify_reservation", toolInput: { date: "2026-02-31" } },
      (key) => `t:${key}`,
      () => undefined,
      "en-US"
    );

    expect(description.details.map((detail) => detail.value)).toEqual(["2026-13-45"]);
    expect(feb.details.map((detail) => detail.value)).toEqual(["2026-02-31"]);
  });
});

// #7918: the chat's Tonight availability changes, as the confirm bar shows them.
describe("describeChatAction Tonight availability", () => {
  const t = (key: string) => `t:${key}`;

  it("names the change type and shows its times in the given locale", () => {
    const description = describeChatAction(
      {
        actionId: "a8",
        toolName: "change_tonight_availability",
        toolInput: { change: "stop_window", from: "19:30", to: "20:00" },
      },
      t,
      () => undefined,
      "en-US"
    );

    expect(description).toEqual({
      title: "t:chat.actions.change_tonight_availability",
      details: [
        {
          label: "t:chat.actions.fields.change",
          value: "t:chat.actions.tonightChanges.stop_window",
        },
        { label: "t:chat.actions.fields.from", value: "7:30 PM" },
        { label: "t:chat.actions.fields.to", value: "8:00 PM" },
      ],
    });
  });

  it("shows a close-early time and a list of tables as people read them", () => {
    const closeEarly = describeChatAction(
      {
        actionId: "a9",
        toolName: "change_tonight_availability",
        toolInput: { change: "close_early", closeAt: "22:00" },
      },
      t,
      () => undefined,
      "en-US"
    );
    const block = describeChatAction(
      {
        actionId: "a10",
        toolName: "change_tonight_availability",
        toolInput: { change: "block_tables", tables: ["Patio 2", "12"] },
      },
      t,
      () => undefined,
      "en-US"
    );

    expect(closeEarly.details[1]).toEqual({
      label: "t:chat.actions.fields.closeAt",
      value: "10:00 PM",
    });
    expect(block.details[1]).toEqual({
      label: "t:chat.actions.fields.tables",
      value: "Patio 2, 12",
    });
  });

  it("titles ending a change and undoing one", () => {
    const end = describeChatAction(
      { actionId: "a11", toolName: "end_tonight_change", toolInput: { change: "pause_online" } },
      t,
      () => undefined
    );
    const undo = describeChatAction(
      {
        actionId: "a12",
        toolName: "undo_availability_change",
        toolInput: { summary: "Paused online booking tonight" },
      },
      t,
      () => undefined
    );

    expect(end.title).toBe("t:chat.actions.end_tonight_change");
    expect(end.details[0]!.value).toBe("t:chat.actions.tonightChanges.pause_online");
    expect(undo).toEqual({
      title: "t:chat.actions.undo_availability_change",
      details: [{ label: "t:chat.actions.fields.summary", value: "Paused online booking tonight" }],
    });
  });
});
