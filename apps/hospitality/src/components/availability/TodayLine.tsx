import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button, Tag, Text } from "@mattbutlerengineering/rialto";
import { useTodayLine } from "../../hooks/useTodayLine.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { hoursText, todayItemText } from "./today-line-text.js";
import styles from "./TodayLine.module.css";

/** Where "Change tonight" goes: the Timeline, with its Tonight panel open. */
const CHANGE_TONIGHT_PATH = "/timeline?tonight=open";

export interface TodayLineProps {
  readonly venueId: string;
  /** The online-pause banner is showing, so the line leaves online out. */
  readonly bannerShowsOnline: boolean;
}

/**
 * What is on today, in the Availability header's description slot (ux.md F1): one flowing line
 * with the service day, its hours, what is in force on it, and a link to change tonight. While
 * the day loads the slot keeps the page's static description, so nothing moves when it fills;
 * a failed read says so with Retry in the same slot and leaves the page working.
 */
export function TodayLine({ venueId, bannerShowsOnline }: TodayLineProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const headingId = useId();
  const { status, model, retry } = useTodayLine(venueId, bannerShowsOnline);

  if (status === "error") {
    return (
      <Text variant="caption" color="secondary">
        {t("availability.today.loadError")}{" "}
        <Button variant="secondary" size="sm" onClick={retry}>
          {t("errorBanner.retry")}
        </Button>
      </Text>
    );
  }
  if (!model) {
    return (
      <Text variant="caption" color="secondary">
        {t("availability.description")}
      </Text>
    );
  }

  // Two items with the same words (a close-early made both ways) show once.
  const texts = [...new Set(model.items.map((item) => todayItemText(item, t, format)))];
  const date = format.formatCalendarDate(model.serviceDate, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <Text
      as="section"
      variant="caption"
      color="secondary"
      className={styles.line}
      aria-labelledby={headingId}
    >
      <Text as="strong" variant="caption" color="primary" id={headingId}>
        {t("availability.today.title")}
      </Text>
      {` · ${[date, hoursText(model, t, format)].filter(Boolean).join(" · ")} `}
      {texts.length > 0 && (
        <ul className={styles.items} aria-label={t("availability.today.itemsLabel")}>
          {texts.map((text) => (
            <li key={text}>
              <Tag>{text}</Tag>
            </li>
          ))}
        </ul>
      )}
      <Link to={CHANGE_TONIGHT_PATH} className={styles.change}>
        {t("availability.today.change")}
      </Link>
    </Text>
  );
}
