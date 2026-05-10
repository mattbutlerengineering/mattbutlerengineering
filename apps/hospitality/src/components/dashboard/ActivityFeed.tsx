import { Card, Text } from "@mattbutlerengineering/rialto";
import type { ReservationEvent } from "../../hooks/useReservationEvents";
import styles from "../../pages/HomePage.module.css";

function formatEventTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return date.toLocaleDateString();
}

const EVENT_LABELS: Record<string, string> = {
  "reservation:created": "New reservation created",
  "reservation:updated": "Reservation updated",
  "reservation:cancelled": "Reservation cancelled",
  "hold:created": "Table hold placed",
  "hold:released": "Table hold released",
  "hold:confirmed": "Hold confirmed as reservation",
  "table:updated": "Table status changed",
};

function describeEvent(event: ReservationEvent): string {
  return EVENT_LABELS[event.type] ?? event.type;
}

interface ActivityFeedProps {
  readonly events: readonly ReservationEvent[];
  readonly isConnected: boolean;
}

export function ActivityFeed({ events, isConnected }: ActivityFeedProps) {
  if (!isConnected && events.length === 0) {
    return (
      <Card title="Live Activity">
        <div className={styles.connectingMessage}>
          <Text className={styles.connectingDot} />
          <Text variant="body" color="secondary">
            Connecting to live updates...
          </Text>
        </div>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card title="Live Activity">
        <Text variant="body" color="secondary">
          No recent activity
        </Text>
      </Card>
    );
  }

  return (
    <Card title="Live Activity">
      <ul className={styles.activityFeed} aria-live="polite" role="status">
        {events.map((event) => (
          <li key={`${event.type}-${event.venueId}-${event.timestamp}`} className={styles.activityItem}>
            <Text className={styles.activityDot} />
            <div className={styles.activityContent}>
              <div className={styles.activityMessage}>{describeEvent(event)}</div>
              <div className={styles.activityTimestamp}>
                {formatEventTimestamp(event.timestamp)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
