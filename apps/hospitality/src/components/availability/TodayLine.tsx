import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button, Tag, Text } from "@mattbutlerengineering/rialto";
import { useTodayLine } from "../../hooks/useTodayLine.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { hoursText, todayItemText } from "./today-line-text.js";
import styles from "./TodayLine.module.css";

/** Where "Change tonight" goes: the Timeline, with its Tonight panel open. */
export const CHANGE_TONIGHT_PATH = "/timeline?tonight=open";

export interface TodayLineProps {
  readonly venueId: string;
  /** The online-pause banner is showing, so the line leaves online out. */
  readonly bannerShowsOnline: boolean;
}

/**
 * What is on today, under the Availability header (ux.md F1): the service day, its hours, what
 * is in force on it, and a link to change tonight. Loading keeps the line's height; a failed
 * read says so with Retry and leaves the page working.
 */
export function TodayLine({ venueId, bannerShowsOnline }: TodayLineProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const headingId = useId();
  const { status, model, retry } = useTodayLine(venueId, bannerShowsOnline);

  const heading = (
    <Text as="strong" variant="label" id={headingId}>
      {t("availability.today.title")}
    </Text>
  );

  if (status === "loading" || !model) {
    return (
      <section className={styles.line} aria-labelledby={headingId} aria-busy={status === "loading"}>
        <div className={styles.heading}>
          {heading}
          {status === "error" && (
            <div className={styles.failed}>
              <Text as="span" variant="caption" color="error">
                {t("availability.today.loadError")}
              </Text>
              <Button variant="secondary" size="sm" onClick={retry}>
                {t("errorBanner.retry")}
              </Button>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Two items with the same words (a close-early made both ways) show once.
  const texts = [...new Set(model.items.map((item) => todayItemText(item, t, format)))];
  return (
    <section className={styles.line} aria-labelledby={headingId}>
      <div className={styles.heading}>
        {heading}
        <Text as="span" variant="body" color="secondary">
          {format.formatCalendarDate(model.serviceDate, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </Text>
        <Text as="span" variant="body">
          {hoursText(model, t, format)}
        </Text>
      </div>
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
    </section>
  );
}
