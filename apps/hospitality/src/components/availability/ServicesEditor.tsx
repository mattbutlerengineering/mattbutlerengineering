import { useTranslation } from "react-i18next";
import { Button, Input, Select, Stack, Text, TimePicker } from "@mattbutlerengineering/rialto";
import { MINUTES_PER_DAY, addDays } from "@mbe/availability";
import type { Seating, VenueService } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { closeFromClock, lastSeatingFromClock, openFromClock, toClock } from "./clock-minutes.js";
import type { DraftService } from "./draft-changes.js";
import { minuteText } from "./closure-band.js";
import styles from "./ServicesEditor.module.css";

type BookingTypes = DraftService["bookingTypes"];

const INTERVALS = [5, 10, 15, 20, 30, 60] as const;
const NEW_SERVICE = "__new__";
/** Hours a service added from the editor starts with; the Manager adjusts them. */
const NEW_SERVICE_HOURS = {
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1320,
  seating: { version: 1, interval: 15 } as Seating,
  bookingTypes: ["online", "phone"] as BookingTypes,
};

type BookingId = "onlinePhone" | "onlineOnly" | "phoneOnly" | "walkIn";
const BOOKING_OPTIONS: readonly { id: BookingId; types: BookingTypes }[] = [
  { id: "onlinePhone", types: ["online", "phone"] },
  { id: "onlineOnly", types: ["online"] },
  { id: "phoneOnly", types: ["phone"] },
  { id: "walkIn", types: [] },
];

const bookingId = (types: BookingTypes): BookingId =>
  BOOKING_OPTIONS.find((o) => o.types.join() === types.join())?.id ?? "walkIn";

export interface ServicesEditorProps {
  readonly services: readonly DraftService[];
  /** The venue's services, so one it has had before can be added back. */
  readonly venueServices: readonly VenueService[];
  /** The date being looked at, for the "next day" hint. */
  readonly date: string;
  /** Offer "New service…" (default). Off where only the venue's existing services can be saved. */
  readonly allowNew?: boolean;
  readonly onChange: (services: DraftService[]) => void;
}

function withOpensAt(service: DraftService, clock: string): DraftService {
  const opensAt = openFromClock(clock);
  return {
    ...service,
    opensAt,
    // Keep the clocks the Manager sees; only which day they fall on can change.
    lastSeatingAt: lastSeatingFromClock(toClock(service.lastSeatingAt), opensAt),
    closesAt: closeFromClock(toClock(service.closesAt), opensAt),
  };
}

function ServiceRow(props: {
  readonly service: DraftService;
  readonly date: string;
  readonly onChange: (service: DraftService) => void;
  readonly onRemove: () => void;
}) {
  const { service, date, onChange, onRemove } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const interval = "interval" in service.seating ? service.seating.interval : null;
  const intervals =
    interval !== null && !INTERVALS.some((n) => n === interval)
      ? [...INTERVALS, interval].sort((a, b) => a - b)
      : INTERVALS;
  const overnight = service.closesAt >= MINUTES_PER_DAY;
  const name = service.name.trim() || t("availability.editor.newServiceName");

  return (
    <fieldset className={styles.row}>
      <legend className={styles.legend}>{name}</legend>
      {service.venueServiceId === null && (
        <Input
          label={t("availability.editor.serviceName")}
          value={service.name}
          maxLength={40}
          required
          onChange={(e) => onChange({ ...service, name: e.target.value })}
        />
      )}
      <div className={styles.times}>
        <TimePicker
          label={t("availability.editor.opens")}
          value={toClock(service.opensAt)}
          onChange={(v) => v && onChange(withOpensAt(service, v))}
        />
        <TimePicker
          label={t("availability.editor.lastSeating")}
          value={toClock(service.lastSeatingAt)}
          onChange={(v) =>
            v && onChange({ ...service, lastSeatingAt: lastSeatingFromClock(v, service.opensAt) })
          }
        />
        <TimePicker
          label={t("availability.editor.closes")}
          value={toClock(service.closesAt)}
          onChange={(v) =>
            v && onChange({ ...service, closesAt: closeFromClock(v, service.opensAt) })
          }
        />
      </div>
      {overnight && (
        <Text variant="caption" color="secondary">
          {t("availability.editor.overnight", {
            time: minuteText(service.closesAt % MINUTES_PER_DAY, t, format),
            weekday: format.formatCalendarDate(addDays(date, 1), { weekday: "long" }),
          })}
        </Text>
      )}
      <div className={styles.times}>
        {interval !== null ? (
          <Select
            label={t("availability.editor.seating")}
            value={String(interval)}
            options={intervals.map((n) => ({
              value: String(n),
              label: t("availability.editor.interval", { minutes: n }),
            }))}
            onChange={(v) => onChange({ ...service, seating: { version: 1, interval: Number(v) } })}
          />
        ) : (
          <Text variant="caption" color="secondary">
            {t("availability.editor.fixedTimes", {
              times:
                "fixed" in service.seating
                  ? new Intl.ListFormat(format.locale, { type: "conjunction" }).format(
                      service.seating.fixed.map((m) => minuteText(m, t, format))
                    )
                  : "",
            })}
          </Text>
        )}
        <Select
          label={t("availability.editor.booking")}
          value={bookingId(service.bookingTypes)}
          options={BOOKING_OPTIONS.map((o) => ({
            value: o.id,
            label: t(`availability.editor.bookingOptions.${o.id}`),
          }))}
          onChange={(v) =>
            onChange({
              ...service,
              bookingTypes: BOOKING_OPTIONS.find((o) => o.id === v)?.types ?? [],
            })
          }
        />
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove}>
        {t("availability.editor.remove", { name })}
      </Button>
    </fieldset>
  );
}

/** The services of a draft: hours, seating and booking type per row, plus add and remove. */
export function ServicesEditor(props: ServicesEditorProps) {
  const { services, venueServices, date, onChange } = props;
  const { t } = useTranslation();

  const used = new Set(services.map((s) => s.venueServiceId));
  const addable = venueServices.filter((v) => !v.archivedAt && !used.has(v.id));

  const add = (id: string) => {
    const existing = venueServices.find((v) => v.id === id);
    const created = id === NEW_SERVICE || !existing;
    onChange([
      ...services,
      {
        ...NEW_SERVICE_HOURS,
        key: created ? `new-${services.length}-${Date.now()}` : id,
        venueServiceId: created ? null : id,
        scheduleServiceId: null,
        name: created ? "" : (existing?.name ?? ""),
      },
    ]);
  };

  return (
    <Stack gap="md">
      {services.map((service) => (
        <ServiceRow
          key={service.key}
          service={service}
          date={date}
          onChange={(next) => onChange(services.map((s) => (s.key === service.key ? next : s)))}
          onRemove={() => onChange(services.filter((s) => s.key !== service.key))}
        />
      ))}
      <Select
        aria-label={t("availability.editor.addService")}
        placeholder={t("availability.editor.addServicePlaceholder")}
        value=""
        options={[
          ...addable.map((v) => ({ value: v.id, label: v.name })),
          ...(props.allowNew === false
            ? []
            : [{ value: NEW_SERVICE, label: t("availability.editor.newService") }]),
        ]}
        onChange={add}
      />
    </Stack>
  );
}
