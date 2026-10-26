import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Drawer,
  Heading,
  Skeleton,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { Layer, ResolvedDay, ResolvedDaySummary } from "@mbe/availability";
import type { AvailabilityConfigState, TeamRole } from "@mbe/types";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { AvailabilityDayEditor } from "./AvailabilityDayEditor.js";
import { CopyDayAction } from "./CopyDayAction.js";
import { ScheduleNudge } from "./ScheduleNudge.js";
import { diffRemoval, removalChangeText } from "./removal-diff.js";
import styles from "./AvailabilityDayDrawer.module.css";

/** What a Manager needs to change the day; without it the drawer is read-only. */
export interface DayEditing {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onDirtyChange: (dirty: boolean) => void;
  /** The draft was saved or discarded; close without asking. */
  readonly onFinished: () => void;
  /** Reload the config after a schedule save was refused as out of date. */
  readonly onStale?: () => void;
  /** "Close…" (F5): open the Close dialog for this date. */
  readonly onCloseDay?: (date: string) => void;
}

export interface AvailabilityDayDrawerProps {
  /** The service date whose drawer is open; `null` closes it. */
  readonly date: string | null;
  /** The engine's resolution of that date, with its `explanation` layers. */
  readonly day: ResolvedDay | undefined;
  readonly isLoading: boolean;
  readonly error: string | null;
  /** `undefined` while the Team read is in flight. Only a Manager edits; a Host never sees a control. */
  readonly viewerRole: TeamRole | undefined;
  readonly editing?: DayEditing;
  readonly onClose: () => void;
}

const noop = () => undefined;

function serviceNames(day: ResolvedDaySummary, locale: string): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(
    day.services.map((s) => s.name)
  );
}

/** What removing a layer would change, as one phrase: "reopens 10:00 PM – 11:00 PM". */
function removalText(day: ResolvedDay, layer: Layer, format: VenueFormat, t: TFunction): string {
  const changes = diffRemoval(day, layer.removalResult).map((c) => removalChangeText(c, t, format));
  return changes.length === 0
    ? t("availability.drawer.removalNone")
    : new Intl.ListFormat(format.locale, { type: "conjunction" }).format(changes);
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
                    result: removalText(day, layer, format, t),
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
 * Day drawer (S3, F-HOST): the plain summary and "Why this day", rendered from the engine's
 * `explanation`. A Manager also gets the editor (`editing`); a Host gets neither a scope
 * select nor an editor, and is pointed at the Tonight panel instead of being shown disabled
 * controls.
 */
export function AvailabilityDayDrawer(props: AvailabilityDayDrawerProps) {
  const { date, day, isLoading, error, viewerRole, editing, onClose } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();

  let body;
  if (date === null) {
    body = null;
  } else if (error) {
    body = (
      <Alert variant="error" title={t("availability.drawer.loadError")}>
        {error}
      </Alert>
    );
  } else if (isLoading || !day) {
    body = <Skeleton variant="text" width="100%" height={96} />;
  } else {
    body = (
      <>
        <DayBody day={day} date={date} />
        {viewerRole === "manager" && editing && (
          <AvailabilityDayEditor
            // A new date is a new draft.
            key={date}
            venueId={editing.venueId}
            state={editing.state}
            timezone={editing.timezone}
            today={editing.today}
            onDirtyChange={editing.onDirtyChange}
            onFinished={editing.onFinished}
            date={date}
            day={day}
            onCancel={onClose}
          />
        )}
        {viewerRole === "manager" && editing?.onCloseDay && (
          <Button variant="secondary" onClick={() => editing.onCloseDay?.(date)}>
            {t("availability.close.open")}
          </Button>
        )}
        {viewerRole === "manager" && editing && (
          <>
            <CopyDayAction
              venueId={editing.venueId}
              state={editing.state}
              date={date}
              day={day}
              onStale={editing.onStale ?? noop}
            />
            <ScheduleNudge
              venueId={editing.venueId}
              state={editing.state}
              date={date}
              day={day}
              onStale={editing.onStale ?? noop}
            />
          </>
        )}
      </>
    );
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
