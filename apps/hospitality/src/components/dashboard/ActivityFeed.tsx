import { Card, Text } from "@mattbutlerengineering/rialto";
import type { ReservationEvent, ReservationEventType } from "../../hooks/useSSESync.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import styles from "../../pages/HomePage.module.css";

function formatEventTimestamp(timestamp: string, fmt: VenueFormat): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return fmt.formatInstant(date, { year: "numeric", month: "numeric", day: "numeric" });
}

const EVENT_LABELS: Partial<Record<ReservationEventType, string>> = {
  "reservation:created": "New reservation created",
  "reservation:updated": "Reservation updated",
  "reservation:cancelled": "Reservation cancelled",
  "hold:created": "Table hold placed",
  "hold:released": "Table hold released",
  "hold:confirmed": "Hold confirmed as reservation",
  "table:updated": "Table status changed",
  "floor-plan:created": "Floor plan created",
};

function describeEvent(event: ReservationEvent): string {
  return EVENT_LABELS[event.type] ?? event.type;
}

interface ActivityFeedProps {
  readonly events: readonly ReservationEvent[];
  readonly isConnected: boolean;
}

export function ActivityFeed({ events, isConnected }: ActivityFeedProps) {
  const fmt = useVenueFormat();
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
          <li
            key={`${event.type}-${event.venueId}-${event.timestamp}`}
            className={styles.activityItem}
          >
            <Text className={styles.activityDot} />
            <div className={styles.activityContent}>
              <div className={styles.activityMessage}>{describeEvent(event)}</div>
              <div className={styles.activityTimestamp}>
                {formatEventTimestamp(event.timestamp, fmt)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
