import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card, Text } from "@mattbutlerengineering/rialto";
import type { ReservationEvent, ReservationEventType } from "../../hooks/useSSESync.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import styles from "../../pages/HomePage.module.css";

function formatEventTimestamp(timestamp: string, fmt: VenueFormat, t: TFunction): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return t("home.activity.justNow");
  if (diffMin < 60) return t("home.activity.minutesAgo", { count: diffMin });
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return t("home.activity.hoursAgo", { count: diffHrs });
  return fmt.formatInstant(date, { year: "numeric", month: "numeric", day: "numeric" });
}

const EVENT_LABEL_KEYS = {
  "reservation:created": "home.activity.events.reservationCreated",
  "reservation:updated": "home.activity.events.reservationUpdated",
  "reservation:cancelled": "home.activity.events.reservationCancelled",
  "hold:created": "home.activity.events.holdCreated",
  "hold:released": "home.activity.events.holdReleased",
  "hold:confirmed": "home.activity.events.holdConfirmed",
  "table:updated": "home.activity.events.tableUpdated",
  "floor-plan:created": "home.activity.events.floorPlanCreated",
} as const satisfies Partial<Record<ReservationEventType, string>>;

type LabelledEventType = keyof typeof EVENT_LABEL_KEYS;

function isLabelled(type: string): type is LabelledEventType {
  return type in EVENT_LABEL_KEYS;
}

function describeEvent(event: ReservationEvent, t: TFunction): string {
  return isLabelled(event.type) ? t(EVENT_LABEL_KEYS[event.type]) : event.type;
}

interface ActivityFeedProps {
  readonly events: readonly ReservationEvent[];
  readonly isConnected: boolean;
}

export function ActivityFeed({ events, isConnected }: ActivityFeedProps) {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  const title = t("home.activity.title");

  if (!isConnected && events.length === 0) {
    return (
      <Card title={title}>
        <div className={styles.connectingMessage}>
          <Text className={styles.connectingDot} />
          <Text variant="body" color="secondary">
            {t("home.activity.connecting")}
          </Text>
        </div>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card title={title}>
        <Text variant="body" color="secondary">
          {t("home.activity.empty")}
        </Text>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <ul className={styles.activityFeed} aria-live="polite" role="status">
        {events.map((event) => (
          <li
            key={`${event.type}-${event.venueId}-${event.timestamp}`}
            className={styles.activityItem}
          >
            <Text className={styles.activityDot} />
            <div className={styles.activityContent}>
              <div className={styles.activityMessage}>{describeEvent(event, t)}</div>
              <div className={styles.activityTimestamp}>
                {formatEventTimestamp(event.timestamp, fmt, t)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
