import { describe, it, expect } from "vitest";
import {
  NOTIFICATIONS,
  typeLabel,
  sortByRecency,
  unreadCount,
  filterNotifications,
  markRead,
  markAllRead,
  formatRelativeTime,
  type NotificationItem,
} from "./notification-center.js";

function item(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: "N-x",
    type: "system",
    title: "Title",
    message: "Message",
    timestamp: "2026-07-31T00:00:00.000Z",
    read: false,
    ...overrides,
  };
}

describe("NOTIFICATIONS fixture", () => {
  it("has at least ten notifications spanning at least three types", () => {
    expect(NOTIFICATIONS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(NOTIFICATIONS.map((n) => n.type)).size).toBeGreaterThanOrEqual(3);
  });

  it("has unique ids", () => {
    expect(new Set(NOTIFICATIONS.map((n) => n.id)).size).toBe(NOTIFICATIONS.length);
  });

  it("mixes read and unread notifications", () => {
    expect(unreadCount(NOTIFICATIONS)).toBeGreaterThan(0);
    expect(unreadCount(NOTIFICATIONS)).toBeLessThan(NOTIFICATIONS.length);
  });
});

describe("typeLabel", () => {
  it("returns a human-readable label per type", () => {
    expect(typeLabel("booking")).toBe("Booking");
    expect(typeLabel("payment")).toBe("Payment");
    expect(typeLabel("system")).toBe("System");
  });
});

describe("sortByRecency", () => {
  it("orders newest-first without mutating the input", () => {
    const input = [
      item({ id: "a", timestamp: "2026-07-01T00:00:00.000Z" }),
      item({ id: "b", timestamp: "2026-07-03T00:00:00.000Z" }),
      item({ id: "c", timestamp: "2026-07-02T00:00:00.000Z" }),
    ];
    const sorted = sortByRecency(input);
    expect(sorted.map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(input.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("unreadCount", () => {
  it("counts only unread items", () => {
    const items = [
      item({ id: "a", read: true }),
      item({ id: "b", read: false }),
      item({ id: "c", read: false }),
    ];
    expect(unreadCount(items)).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});

describe("filterNotifications", () => {
  const items = [
    item({ id: "a", read: true }),
    item({ id: "b", read: false }),
    item({ id: "c", read: false }),
  ];

  it("'all' passes every item through", () => {
    expect(filterNotifications(items, "all")).toEqual(items);
  });

  it("'unread' keeps only unread items", () => {
    expect(filterNotifications(items, "unread").map((n) => n.id)).toEqual(["b", "c"]);
  });
});

describe("markRead", () => {
  it("marks only the targeted item read, without mutating the input", () => {
    const input = [item({ id: "a", read: false }), item({ id: "b", read: false })];
    const next = markRead(input, "a");
    expect(next.find((n) => n.id === "a")?.read).toBe(true);
    expect(next.find((n) => n.id === "b")?.read).toBe(false);
    expect(input.every((n) => !n.read)).toBe(true);
  });
});

describe("markAllRead", () => {
  it("marks every item read, without mutating the input", () => {
    const input = [item({ id: "a", read: false }), item({ id: "b", read: true })];
    const next = markAllRead(input);
    expect(next.every((n) => n.read)).toBe(true);
    expect(input.find((n) => n.id === "a")?.read).toBe(false);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("formats seconds ago", () => {
    expect(formatRelativeTime("2026-07-31T11:59:30.000Z", now)).toBe("30 seconds ago");
  });

  it("formats minutes ago", () => {
    expect(formatRelativeTime("2026-07-31T11:55:00.000Z", now)).toBe("5 minutes ago");
  });

  it("formats hours ago", () => {
    expect(formatRelativeTime("2026-07-31T09:00:00.000Z", now)).toBe("3 hours ago");
  });

  it("formats days ago", () => {
    expect(formatRelativeTime("2026-07-28T12:00:00.000Z", now)).toBe("3 days ago");
  });
});
