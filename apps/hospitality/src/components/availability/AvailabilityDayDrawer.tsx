import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Alert, Drawer, Heading, Skeleton, Stack, Text } from "@mattbutlerengineering/rialto";
import type { ResolvedDay, ResolvedDaySummary } from "@mbe/availability";
import type { TeamRole } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import styles from "./AvailabilityDayDrawer.module.css";

export interface AvailabilityDayDrawerProps {
  /** The service date whose drawer is open; `null` closes it. */
  readonly date: string | null;
  /** The engine's resolution of that date, with its `explanation` layers. */
  readonly day: ResolvedDay | undefined;
  readonly isLoading: boolean;
  readonly error: string | null;
  /** `undefined` while the Team read is in flight. Read-only for everyone in this slice. */
  readonly viewerRole: TeamRole | undefined;
  readonly onClose: () => void;
}

function serviceNames(day: ResolvedDaySummary, locale: string): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(
    day.services.map((s) => s.name)
  );
}

/** "open for Lunch and Dinner" / "closed": what a day looks like with a layer removed. */
function removalText(day: ResolvedDaySummary, locale: string, t: TFunction): string {
  return day.services.length === 0
    ? t("availability.drawer.removalClosed")
    : t("availability.drawer.removalOpen", { services: serviceNames(day, locale) });
}

function summaryText(day: ResolvedDay, weekday: string, locale: string, t: TFunction): string[] {
  if (day.services.length === 0) {
    return [
      day.explanation.length === 0
        ? t("availability.drawer.closedRegular", { weekday })
        : t("availability.drawer.summaryClosed"),
    ];
  }
  const changes = day.explanation.filter((layer) => layer.kind !== "schedule").length;
  return [
    t("availability.drawer.summaryOpen", { services: serviceNames(day, locale) }),
    ...(changes > 0 ? [t("availability.drawer.changes", { count: changes, weekday })] : []),
  ];
}

function DayBody({ day, date }: { readonly day: ResolvedDay; readonly date: string }) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const weekday = format.formatCalendarDate(date, { weekday: "long" });
  // The stack appears once a second layer exists; the regular week alone is just the summary.
  const showStack = day.explanation.length >= 2;

  return (
    <Stack gap="md">
      <Stack gap="xs">
        {summaryText(day, weekday, format.locale, t).map((sentence) => (
          <Text key={sentence} variant="body" color="primary">
            {sentence}
          </Text>
        ))}
      </Stack>
      {showStack && (
        <section aria-labelledby="why-this-day">
          <Heading level={3} size={4} id="why-this-day">
            {t("availability.drawer.whyTitle")}
          </Heading>
          <ol className={styles.layers}>
            {day.explanation.map((layer) => (
              <li key={layer.id} className={styles.layer}>
                <Text as="span" variant="body" color="primary" data-layer-label>
                  {layer.label}
                </Text>
                <Text as="span" variant="caption" color="secondary">
                  {layer.effect}
                </Text>
                <Text as="span" variant="caption" color="secondary">
                  {t("availability.drawer.ifRemoved", {
                    result: removalText(layer.removalResult, format.locale, t),
                  })}
                </Text>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Stack>
  );
}

/**
 * Day drawer, read-only (S3, F-HOST): the plain summary and "Why this day", rendered from
 * the engine's `explanation`. No scope select, editors or Remove exist yet, and a Host is
 * pointed at the Tonight panel instead of being shown disabled controls.
 */
export function AvailabilityDayDrawer(props: AvailabilityDayDrawerProps) {
  const { date, day, isLoading, error, viewerRole, onClose } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();

  let body;
  if (date === null) {
    body = null;
  } else if (error) {
    body = <Alert variant="error">{error}</Alert>;
  } else if (isLoading || !day) {
    body = <Skeleton variant="text" width="100%" height={96} />;
  } else {
    body = <DayBody day={day} date={date} />;
  }

  return (
    <Drawer
      open={date !== null}
      onClose={onClose}
      title={
        date === null
          ? undefined
          : format.formatCalendarDate(date, { weekday: "long", month: "long", day: "numeric" })
      }
    >
      <Stack gap="md">
        {body}
        {viewerRole === "host" && (
          <Text variant="caption" color="secondary">
            {t("availability.hostNote")}
          </Text>
        )}
      </Stack>
    </Drawer>
  );
}
