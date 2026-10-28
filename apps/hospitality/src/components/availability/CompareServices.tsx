import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Select, Stack, Text, TimePicker } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { closeFromClock, lastSeatingFromClock, openFromClock, toClock } from "./clock-minutes.js";
import {
  buildCompareChanges,
  changedRows,
  compareRows,
  compareServiceOptions,
  type CompareRow,
} from "./compare-changes.js";
import { ownChangeDates, scopeDates } from "./scope-dates.js";
import { OwnChangesChoice, SaveFailure } from "./ScheduleFormParts.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./CompareServices.module.css";

type BookingTypes = CompareRow["bookingTypes"];
type BookingId = "onlinePhone" | "onlineOnly" | "phoneOnly" | "walkIn";
const BOOKING_OPTIONS: readonly { id: BookingId; types: BookingTypes }[] = [
  { id: "onlinePhone", types: ["online", "phone"] },
  { id: "onlineOnly", types: ["online"] },
  { id: "phoneOnly", types: ["phone"] },
  { id: "walkIn", types: [] },
];
const bookingId = (types: BookingTypes): BookingId =>
  BOOKING_OPTIONS.find((o) => o.types.join() === types.join())?.id ?? "walkIn";

export interface CompareServicesProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
}

/** Fields "Set selected to…" applies; an empty one leaves that field alone. */
interface BulkFields {
  readonly opens: string | null;
  readonly lastSeating: string | null;
  readonly closes: string | null;
  readonly booking: BookingId | "";
}
const NO_BULK: BulkFields = { opens: null, lastSeating: null, closes: null, booking: "" };

function applyBulk(row: CompareRow, bulk: BulkFields): CompareRow {
  const opensAt = bulk.opens ? openFromClock(bulk.opens) : row.opensAt;
  const types = BOOKING_OPTIONS.find((o) => o.id === bulk.booking)?.types;
  return {
    ...row,
    opensAt,
    lastSeatingAt: bulk.lastSeating
      ? lastSeatingFromClock(bulk.lastSeating, opensAt)
      : row.lastSeatingAt,
    closesAt: bulk.closes ? closeFromClock(bulk.closes, opensAt) : row.closesAt,
    bookingTypes: types ?? row.bookingTypes,
  };
}

function RowFields(props: {
  readonly row: CompareRow;
  readonly onChange: (row: CompareRow) => void;
}) {
  const { row, onChange } = props;
  const { t } = useTranslation();
  const label = (field: string) => `${row.scheduleName} · ${field}`;
  return (
    <div className={styles.fields}>
      <TimePicker
        label={label(t("availabilitySchedules.compare.opens"))}
        value={toClock(row.opensAt)}
        onChange={(v) => v && onChange(applyBulk(row, { ...NO_BULK, opens: v }))}
      />
      <TimePicker
        label={label(t("availabilitySchedules.compare.lastSeating"))}
        value={toClock(row.lastSeatingAt)}
        onChange={(v) => v && onChange(applyBulk(row, { ...NO_BULK, lastSeating: v }))}
      />
      <TimePicker
        label={label(t("availabilitySchedules.compare.closes"))}
        value={toClock(row.closesAt)}
        onChange={(v) => v && onChange(applyBulk(row, { ...NO_BULK, closes: v }))}
      />
      <Select
        label={label(t("availabilitySchedules.compare.booking"))}
        value={bookingId(row.bookingTypes)}
        options={BOOKING_OPTIONS.map((o) => ({
          value: o.id,
          label: t(`availability.editor.bookingOptions.${o.id}`),
        }))}
        onChange={(v) => onChange(applyBulk(row, { ...NO_BULK, booking: v as BookingId }))}
      />
    </div>
  );
}

/**
 * Compare services (ux.md F-X): one service's hours in every schedule that runs it, edited in
 * place or for the selected rows at once, then saved as a single change with one combined
 * impact line.
 */
export function CompareServices(props: CompareServicesProps) {
  const { venueId, state, timezone, today, onStale } = props;
  const { config } = state;
  const { t } = useTranslation();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);

  const options = useMemo(() => compareServiceOptions(config), [config]);
  const [chosen, setChosen] = useState<string | null>(null);
  const serviceId = chosen ?? options[0]?.id ?? null;
  const [edits, setEdits] = useState<Readonly<Record<string, CompareRow>>>({});
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState<BulkFields>(NO_BULK);
  const [mode, setMode] = useState<ScopeConflictMode>("keep");

  const rows = useMemo(
    () =>
      serviceId ? compareRows(config, serviceId).map((r) => edits[r.scheduleServiceId] ?? r) : [],
    [config, serviceId, edits]
  );
  const changed = useMemo(() => changedRows(config, rows), [config, rows]);
  const dates = useMemo(() => {
    const ids = [...new Set(changed.map((r) => r.scheduleId))];
    const all = ids.flatMap((scheduleId) =>
      scopeDates({ kind: "schedule", scheduleId }, { config, timezone, today })
    );
    return [...new Set(all)];
  }, [changed, config, timezone, today]);
  const own = useMemo(() => ownChangeDates(config, dates, null), [config, dates]);
  const scheduleCount = new Set(changed.map((r) => r.scheduleId)).size;

  if (options.length === 0 || serviceId === null) {
    return (
      <Text variant="body" color="secondary">
        {t("availabilitySchedules.compare.nothing")}
      </Text>
    );
  }

  const setRow = (row: CompareRow) =>
    setEdits((prev) => ({ ...prev, [row.scheduleServiceId]: row }));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));

  const applyToSelected = () => {
    rows
      .filter((r) => selected.includes(r.scheduleServiceId))
      .forEach((r) => setRow(applyBulk(r, bulk)));
    setBulk(NO_BULK);
    setBulkOpen(false);
  };

  const submit = async () => {
    const saved = await saver.save(
      venueId,
      state,
      buildCompareChanges(config, rows),
      dates.length > 1 ? mode : "replace"
    );
    if (!saved) return;
    offerUndo({
      venueId,
      saved,
      title: t("availabilitySchedules.compare.saved", { count: scheduleCount }),
    });
    setEdits({});
    setSelected([]);
  };

  return (
    <Stack gap="md">
      <SaveFailure messages={saver.failure} />
      <Select
        label={t("availabilitySchedules.compare.service")}
        value={serviceId}
        options={options.map((o) => ({ value: o.id, label: o.name }))}
        onChange={(id) => {
          setChosen(id);
          setEdits({});
          setSelected([]);
        }}
      />
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.scheduleServiceId} className={styles.row}>
            <Checkbox
              label={t("availabilitySchedules.compare.select", { name: row.scheduleName })}
              checked={selected.includes(row.scheduleServiceId)}
              onCheckedChange={(on) => toggle(row.scheduleServiceId, on)}
            />
            <RowFields row={row} onChange={setRow} />
          </li>
        ))}
      </ul>
      {bulkOpen ? (
        <div className={styles.fields}>
          <TimePicker
            label={t("availabilitySchedules.compare.opens")}
            value={bulk.opens}
            onChange={(opens) => setBulk({ ...bulk, opens })}
          />
          <TimePicker
            label={t("availabilitySchedules.compare.lastSeating")}
            value={bulk.lastSeating}
            onChange={(lastSeating) => setBulk({ ...bulk, lastSeating })}
          />
          <TimePicker
            label={t("availabilitySchedules.compare.closes")}
            value={bulk.closes}
            onChange={(closes) => setBulk({ ...bulk, closes })}
          />
          <Select
            label={t("availabilitySchedules.compare.booking")}
            placeholder={t("availabilitySchedules.compare.leaveAsIs")}
            value={bulk.booking}
            options={BOOKING_OPTIONS.map((o) => ({
              value: o.id,
              label: t(`availability.editor.bookingOptions.${o.id}`),
            }))}
            onChange={(booking) => setBulk({ ...bulk, booking: booking as BookingId })}
          />
          <Button variant="primary" size="sm" onClick={applyToSelected}>
            {t("availabilitySchedules.compare.apply", { count: selected.length })}
          </Button>
        </div>
      ) : (
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => setBulkOpen(true)}
          >
            {t("availabilitySchedules.compare.setSelected")}
          </Button>
        </div>
      )}
      <OwnChangesChoice count={dates.length > 1 ? own.length : 0} value={mode} onChange={setMode} />
      <div className={styles.footer}>
        <Text variant="body" color="primary" role="status">
          {t("availabilitySchedules.compare.impact", {
            schedules: t("availabilitySchedules.compare.impactSchedules", { count: scheduleCount }),
            dates: t("availabilitySchedules.compare.impactDates", { count: dates.length }),
          })}
        </Text>
        <Button
          variant="primary"
          disabled={changed.length === 0}
          isLoading={saver.isPending}
          onClick={() => void submit()}
        >
          {t("availabilitySchedules.compare.save", { count: scheduleCount })}
        </Button>
      </div>
    </Stack>
  );
}
