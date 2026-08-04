import { useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SegmentedControl,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import {
  NOTIFICATIONS,
  filterNotifications,
  formatRelativeTime,
  markAllRead,
  markRead,
  sortByRecency,
  typeLabel,
  unreadCount,
  type NotificationFilter,
  type NotificationItem,
} from "./notification-center";
import styles from "./NotificationCenterExamplePage.module.css";

/* ── Filter segments ──────────────────────────── */

const FILTER_SEGMENTS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
];

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `const [notifications, setNotifications] = useState(NOTIFICATIONS);
const [filter, setFilter] = useState<NotificationFilter>("all");

const unread = unreadCount(notifications);
const visible = sortByRecency(filterNotifications(notifications, filter));

<SegmentedControl
  aria-label="Filter notifications"
  segments={[{ id: "all", label: "All" }, { id: "unread", label: "Unread" }]}
  value={filter}
  onChange={(id) => setFilter(id === "unread" ? "unread" : "all")}
/>
<Badge aria-label={\`\${unread} unread notifications\`}>{unread}</Badge>
<Button onClick={() => setNotifications((prev) => markAllRead(prev))}>Mark all read</Button>

{visible.length === 0 ? (
  <EmptyState heading="You're all caught up" description="No unread notifications." />
) : (
  visible.map((n) => (
    <button onClick={() => setNotifications((prev) => markRead(prev, n.id))} data-read={n.read}>
      <Badge>{typeLabel(n.type)}</Badge>
      {!n.read && <Badge variant="accent">Unread</Badge>}
      <Text variant={n.read ? "body" : "label"}>{n.title}</Text>
    </button>
  ))
)}`;

const COMPOSITION_NOTES: ReactNode = (
  <Stack gap="sm">
    <CompositionNote>
      A local fixture of ten notifications across three types (booking, payment, system) drives the
      whole page — the visible list is always a pure transform of a single source of truth: filter →
      sort-by-recency, so nothing can drift out of sync.
    </CompositionNote>
    <CompositionNote>
      Unread state is signalled three ways, never by colour alone — an accent-tinted row with a
      heavier left border, a text “Unread” Badge, and a bolder title weight. The unread count Badge
      carries an <code>aria-label</code> spelling out “N unread notifications” rather than exposing
      a bare number to assistive tech.
    </CompositionNote>
    <CompositionNote>
      The <code>SegmentedControl</code> (a WAI-ARIA radiogroup) switches between All and Unread;
      clicking a row or pressing “Mark all read” both call the same pure <code>markRead</code> /
      <code>markAllRead</code> helpers, returning new arrays rather than mutating state. Filtering
      to Unread with none left renders an EmptyState instead of a blank list.
    </CompositionNote>
  </Stack>
);

/* ── Notification row ────────────────────────── */

function NotificationRow({
  notification,
  onSelect,
}: {
  notification: NotificationItem;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <Button
        type="button"
        className={notification.read ? styles.item : styles.itemUnread}
        data-read={notification.read}
        onClick={() => onSelect(notification.id)}
      >
        <div className={styles.itemHeader}>
          <Badge variant="neutral" size="sm">
            {typeLabel(notification.type)}
          </Badge>
          {!notification.read && (
            <Badge variant="accent" size="sm">
              Unread
            </Badge>
          )}
          <Text as="span" variant="caption" color="tertiary" className={styles.time}>
            {formatRelativeTime(notification.timestamp)}
          </Text>
        </div>
        <Text as="span" variant={notification.read ? "body" : "label"} className={styles.title}>
          {notification.title}
        </Text>
        <Text as="span" variant="caption" className={styles.message}>
          {notification.message}
        </Text>
      </Button>
    </li>
  );
}

/* ── Page component ──────────────────────────── */

export function NotificationCenterExamplePage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(NOTIFICATIONS);
  const [filter, setFilter] = useState<NotificationFilter>("all");

  const unread = unreadCount(notifications);
  const visible = sortByRecency(filterNotifications(notifications, filter));

  const handleSelect = (id: string) => {
    setNotifications((prev) => markRead(prev, id));
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => markAllRead(prev));
  };

  return (
    <ExamplePageLayout
      name="Notification Center"
      description="Inbox pattern: time-ordered notifications with read/unread state, type badges, filtering, and bulk actions"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <Stack gap="lg">
        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <SegmentedControl
              aria-label="Filter notifications"
              segments={FILTER_SEGMENTS}
              value={filter}
              onChange={(id) => setFilter(id === "unread" ? "unread" : "all")}
            />
            <Badge
              variant={unread > 0 ? "accent" : "neutral"}
              className={styles.unreadCount}
              aria-label={`${unread} unread notification${unread === 1 ? "" : "s"}`}
            >
              {unread}
            </Badge>
          </div>
          <Button variant="secondary" size="sm" onClick={handleMarkAllRead} disabled={unread === 0}>
            Mark all read
          </Button>
        </div>

        <Card>
          {visible.length === 0 ? (
            <EmptyState
              heading="You're all caught up"
              description={
                filter === "unread" ? "No unread notifications." : "Notifications will appear here."
              }
            />
          ) : (
            <ul className={styles.list} aria-label="Notifications">
              {visible.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onSelect={handleSelect}
                />
              ))}
            </ul>
          )}
        </Card>
      </Stack>
    </ExamplePageLayout>
  );
}

NotificationCenterExamplePage.displayName = "NotificationCenterExamplePage";
