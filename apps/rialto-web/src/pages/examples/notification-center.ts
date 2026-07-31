/**
 * Notification-center fixture + pure logic — filtering, read/unread state,
 * and relative-time formatting for the inbox example.
 *
 * Framework-free so filtering, marking-read, and time formatting can be
 * unit-tested without React. The showcase page (NotificationCenterExamplePage)
 * holds the state in React and delegates every decision here.
 */

/* ── Domain ──────────────────────────────────── */

export type NotificationType = "booking" | "payment" | "system";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** ISO timestamp. */
  timestamp: string;
  read: boolean;
}

export type NotificationFilter = "all" | "unread";

const TYPE_LABEL: Record<NotificationType, string> = {
  booking: "Booking",
  payment: "Payment",
  system: "System",
};

/** Human-readable label for a notification type — used on the type badge. */
export function typeLabel(type: NotificationType): string {
  return TYPE_LABEL[type];
}

/* ── Fixture data (no service calls) ─────────── */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Offsets are computed from the moment the module loads, so the showcase
// always reads as a freshly-updated inbox rather than a stale fixed date.
const NOW = Date.now();

function agoIso(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

export const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "N-1",
    type: "booking",
    title: "New reservation confirmed",
    message: "Elena Marchetti booked Suite 402 for Aug 14–18.",
    timestamp: agoIso(4 * MINUTE),
    read: false,
  },
  {
    id: "N-2",
    type: "payment",
    title: "Payment received",
    message: "$1,740 charged for reservation RES-1107.",
    timestamp: agoIso(22 * MINUTE),
    read: false,
  },
  {
    id: "N-3",
    type: "system",
    title: "Nightly sync completed",
    message: "Channel manager sync finished with no errors.",
    timestamp: agoIso(HOUR),
    read: true,
  },
  {
    id: "N-4",
    type: "booking",
    title: "Guest checked in",
    message: "Marcus Webb checked into Deluxe 218.",
    timestamp: agoIso(3 * HOUR),
    read: false,
  },
  {
    id: "N-5",
    type: "payment",
    title: "Refund issued",
    message: "$320 refunded for cancelled reservation RES-0764.",
    timestamp: agoIso(5 * HOUR),
    read: true,
  },
  {
    id: "N-6",
    type: "system",
    title: "Rate plan updated",
    message: "Weekend rates for Suite rooms increased 8%.",
    timestamp: agoIso(9 * HOUR),
    read: true,
  },
  {
    id: "N-7",
    type: "booking",
    title: "Reservation cancelled",
    message: "RES-0518 was cancelled by the guest.",
    timestamp: agoIso(DAY),
    read: false,
  },
  {
    id: "N-8",
    type: "payment",
    title: "Payment failed",
    message: "Card declined on reservation RES-1152 — retry required.",
    timestamp: agoIso(DAY + 6 * HOUR),
    read: false,
  },
  {
    id: "N-9",
    type: "system",
    title: "Storage nearing capacity",
    message: "Document storage is at 82% of plan capacity.",
    timestamp: agoIso(2 * DAY),
    read: true,
  },
  {
    id: "N-10",
    type: "booking",
    title: "Upgrade requested",
    message: "Guest requested an upgrade to Rooftop Suite.",
    timestamp: agoIso(3 * DAY),
    read: true,
  },
];

/* ── Pure data transforms (exported for direct testing) ─────────── */

/** Copy of `items` sorted newest first; does not mutate the input. */
export function sortByRecency(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Count of unread items. */
export function unreadCount(items: NotificationItem[]): number {
  return items.filter((n) => !n.read).length;
}

/** Subset matching the filter; `"all"` passes every item through. */
export function filterNotifications(
  items: NotificationItem[],
  filter: NotificationFilter
): NotificationItem[] {
  return filter === "unread" ? items.filter((n) => !n.read) : items;
}

/** Copy of `items` with `id` marked read; other items are unchanged. */
export function markRead(items: NotificationItem[], id: string): NotificationItem[] {
  return items.map((n) => (n.id === id ? { ...n, read: true } : n));
}

/** Copy of `items` with every item marked read. */
export function markAllRead(items: NotificationItem[]): NotificationItem[] {
  return items.map((n) => (n.read ? n : { ...n, read: true }));
}

/* ── Relative time ───────────────────────────── */

/** e.g. `formatRelativeTime(iso)` → `"5 minutes ago"`, `"yesterday"`, `"3 days ago"`. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMs = new Date(iso).getTime() - now.getTime();
  const diffSecs = Math.round(diffMs / 1000);
  if (Math.abs(diffSecs) < 60) return rtf.format(diffSecs, "second");
  const diffMins = Math.round(diffSecs / 60);
  if (Math.abs(diffMins) < 60) return rtf.format(diffMins, "minute");
  const diffHours = Math.round(diffMins / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}
