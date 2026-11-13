import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Select, Stack, Text, TimePicker } from "@mattbutlerengineering/rialto";
import type {
  AvailabilityConfig,
  AvailabilityConfigState,
  ScheduleService,
  ScopeConflictMode,
} from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { closeFromClock, lastSeatingFromClock, openFromClock, toClock } from "./clock-minutes.js";
import {
  buildCompareChanges,
  changedRows,
  compareRows,
  compareServiceOptions,
  reapplyEdits,
  rowsChangedSince,
  rowsRemovedSince,
  type CompareRow,
} from "./compare-changes.js";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";
import { DraftPreview } from "./DraftPreview.js";
import { ownChangeDates, scheduleReach, scopeDates } from "./scope-dates.js";
import { FormConflictDialog } from "./FormConflictDialog.js";
import { BlockedReason, OwnChangesChoice, SaveFailure } from "./ScheduleFormParts.js";
import { useDiscardGuard } from "./use-discard-guard.js";
import { useHeldFor } from "./use-held-for.js";
import { useReloadHold } from "./use-reload-hold.js";
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

/** A normal reload ends within this; only one that has not is worth a button of its own. */
const RELOAD_OFFER_AFTER_MS = 2000;

export interface CompareServicesProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  /** The venue's current service date: a regular week replaced before it has no row (#8688). */
  readonly serviceDate: string;
  readonly onStale: () => void;
  /** The reload of the config failed (the page's read); a conflict being reviewed says so. */
  readonly refreshError?: string | null;
  /** Reports whether rows are edited but not saved, so the surface around can ask before closing. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** Opens Edit schedule for a row that has its own days or different hours. */
  readonly onEditSchedule?: (scheduleId: string) => void;
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
  readonly disabled: boolean;
}) {
  const { row, onChange, disabled } = props;
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
        disabled={disabled}
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
  const { venueId, state, timezone, today, serviceDate, onStale, onDirtyChange, onEditSchedule } =
    props;
  const { config } = state;
  const { t } = useTranslation();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);
  const blockedId = useId();

  const options = useMemo(() => compareServiceOptions(config, serviceDate), [config, serviceDate]);
  const [chosen, setChosen] = useState<string | null>(null);
  const serviceId = chosen ?? options[0]?.id ?? null;
  const [edits, setEdits] = useState<Readonly<Record<string, CompareRow>>>({});
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState<BulkFields>(NO_BULK);
  const [mode, setMode] = useState<ScopeConflictMode>("keep");
  // What the edits were made against. A save is checked against `version` (the first edit's), so a
  // colleague's change to any field of an edited row is a conflict the Manager reviews, never
  // silently overwritten by the whole-row save. `rows` holds each edited row as it was when that
  // row was first edited, because that, not the session's first version, is what its edit means.
  const [base, setBase] = useState<{
    version: number;
    rows: Readonly<Record<string, ScheduleService>>;
  } | null>(null);
  // Past the Manager's own save, the config on hand is behind it: rows edited on it would be pinned
  // to the old version and could write the save back. A draft already begun keeps its own pin.
  const { behind, reloadDue } = useReloadHold(venueId, state.version);
  const held = behind && base === null;
  const offerReload = useHeldFor(held && reloadDue, RELOAD_OFFER_AFTER_MS);
  const baselineOf = (b: NonNullable<typeof base>): AvailabilityConfig => ({
    ...config,
    scheduleServices: Object.values(b.rows),
  });

  const rows = useMemo(
    () =>
      serviceId
        ? compareRows(config, serviceId, serviceDate).map((r) => edits[r.scheduleServiceId] ?? r)
        : [],
    [config, serviceId, serviceDate, edits]
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
  // What the preview reaches: the same dates plus any a use_schedule rule sends to these schedules.
  const reach = useMemo(() => {
    const ids = [...new Set(changed.map((r) => r.scheduleId))];
    const all = ids.flatMap((scheduleId) => scheduleReach(scheduleId, { config, timezone, today }));
    return [...new Set(all)].sort();
  }, [changed, config, timezone, today]);
  const scheduleCount = new Set(changed.map((r) => r.scheduleId)).size;
  // Built the way the save builds it, from the rows the edits were made against, so the preview
  // shows what Save would send. A lost race is answered in the conflict dialog, with nothing to preview.
  const previewChanges = useMemo(
    () =>
      base && changed.length > 0 && !saver.conflicted
        ? buildCompareChanges(
            { ...config, scheduleServices: Object.values(base.rows) },
            Object.values(edits)
          )
        : null,
    [base, changed.length, saver.conflicted, config, edits]
  );

  const commitEdits = (next: Readonly<Record<string, CompareRow>>) => {
    setEdits(next);
    // The view stays on the service being edited even if a refetch reorders the services.
    if (Object.keys(next).length > 0) setChosen(serviceId);
    setBase((prev) => {
      if (Object.keys(next).length === 0) return null;
      const stored = new Map(config.scheduleServices.map((s) => [s.id, s]));
      const rows = Object.keys(next).reduce<Record<string, ScheduleService>>((acc, id) => {
        const row = prev?.rows[id] ?? stored.get(id);
        return row ? { ...acc, [id]: row } : acc;
      }, {});
      return { version: prev?.version ?? state.version, rows };
    });
    onDirtyChange?.(changedRows(config, Object.values(next)).length > 0);
  };
  // Choosing another service drops the rows edited for this one, so it asks first.
  const serviceGuard = useDiscardGuard<string>((id) => {
    setChosen(id);
    commitEdits({});
    setSelected([]);
    saver.clearConflict();
  }, changed.length > 0);

  if (options.length === 0 || serviceId === null) {
    return (
      <Text variant="body" color="secondary">
        {t("availabilitySchedules.compare.nothing")}
      </Text>
    );
  }

  const setRow = (row: CompareRow) => {
    if (held) return; // an edit now would pin the version the held rows are behind
    commitEdits({ ...edits, [row.scheduleServiceId]: row });
  };
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));

  const applyToSelected = () => {
    commitEdits(
      rows
        .filter((r) => selected.includes(r.scheduleServiceId))
        .reduce((acc, r) => ({ ...acc, [r.scheduleServiceId]: applyBulk(r, bulk) }), edits)
    );
    setBulk(NO_BULK);
    setBulkOpen(false);
  };

  const submit = async () => {
    if (!base) return; // nothing is edited, so there is nothing to save
    const saved = await saver.save(
      venueId,
      state,
      buildCompareChanges(baselineOf(base), Object.values(edits)),
      dates.length > 1 ? mode : "replace",
      base.version
    );
    if (!saved) return;
    offerUndo({
      venueId,
      saved,
      title: t("availabilitySchedules.compare.saved", { count: scheduleCount }),
    });
    commitEdits({});
    setSelected([]);
  };

  const reapply = () => {
    const next = base
      ? reapplyEdits(baselineOf(base), config, Object.values(edits), serviceDate)
      : edits;
    commitEdits(next);
    // The rows are now built on the winning version, so the next save is checked against it.
    const stored = new Map(config.scheduleServices.map((s) => [s.id, s]));
    const rows = Object.keys(next).flatMap((id) => {
      const row = stored.get(id);
      return row ? [[id, row] as const] : [];
    });
    setBase(rows.length > 0 ? { version: state.version, rows: Object.fromEntries(rows) } : null);
    saver.clearConflict();
  };
  const discard = () => {
    commitEdits({});
    setSelected([]);
    saver.clearConflict();
  };
  const review = saver.conflicted
    ? {
        kind: "edit" as const,
        loaded: base !== null && state.version !== base.version,
        changes: {
          gone: false,
          replacedBy: null,
          renamedTo: null,
          added: [],
          removed: rowsRemovedSince(config, Object.values(edits), serviceDate),
          changed: base ? rowsChangedSince(baselineOf(base), config, Object.values(edits)) : [],
        },
      }
    : null;

  return (
    <Stack gap="md">
      {!review && <SaveFailure messages={saver.failure} stranded={saver.stranded} />}
      <FormConflictDialog
        saver={saver}
        review={review}
        rows={Object.values(edits).map((row) => ({
          key: row.scheduleServiceId,
          name: row.scheduleName,
          opensAt: row.opensAt,
          closesAt: row.closesAt,
        }))}
        reloadError={props.refreshError}
        onReload={onStale}
        onReapply={reapply}
        onStartOver={discard}
        onDiscard={discard}
      />
      <Select
        label={t("availabilitySchedules.compare.service")}
        value={serviceId}
        options={options.map((o) => ({ value: o.id, label: o.name }))}
        onChange={(id) => serviceGuard.request(id)}
      />
      <DiscardChangesDialog
        open={serviceGuard.pending !== null}
        date={null}
        title={t("availabilitySchedules.discard.title")}
        onDiscard={serviceGuard.confirmDiscard}
        onKeepEditing={serviceGuard.keepEditing}
      />
      {held && (
        <Text variant="caption" color="secondary" role="status">
          {t("availability.drawer.waitForReload")}
        </Text>
      )}
      {offerReload && (
        <div>
          <Button variant="ghost" size="sm" onClick={onStale}>
            {t("availability.drawer.reloadHours")}
          </Button>
        </div>
      )}
      {/* The time pickers have no disabled prop and their popover opens from a click on a wrapper,
          which a disabled fieldset does not stop. So a held fieldset also swallows clicks (capture,
          before the popover sees them) and takes no pointer events. */}
      <fieldset
        className={styles.held}
        disabled={held}
        onClickCapture={held ? (event) => event.stopPropagation() : undefined}
      >
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.scheduleServiceId} className={styles.row}>
              <Checkbox
                label={t("availabilitySchedules.compare.select", { name: row.scheduleName })}
                checked={selected.includes(row.scheduleServiceId)}
                disabled={held}
                onCheckedChange={(on) => toggle(row.scheduleServiceId, on)}
              />
              <RowFields row={row} onChange={setRow} disabled={held} />
              {row.different && (
                <div className={styles.different}>
                  <Text variant="caption" color="secondary">
                    {t("availabilitySchedules.compare.different")}
                  </Text>
                  {onEditSchedule && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditSchedule(row.scheduleId)}
                    >
                      {t("availabilitySchedules.compare.editSchedule")}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </fieldset>
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
            disabled={held || selected.length === 0}
            onClick={() => setBulkOpen(true)}
          >
            {t("availabilitySchedules.compare.setSelected")}
          </Button>
        </div>
      )}
      <OwnChangesChoice count={dates.length > 1 ? own.length : 0} value={mode} onChange={setMode} />
      <BlockedReason
        id={blockedId}
        reason={changed.length === 0 ? t("availabilitySchedules.compare.blocked") : null}
      />
      <div className={styles.footer}>
        <Text variant="body" color="primary" role="status">
          {t("availabilitySchedules.compare.impact", {
            schedules: t("availabilitySchedules.compare.impactSchedules", { count: scheduleCount }),
            dates: t("availabilitySchedules.compare.impactDates", { count: dates.length }),
          })}
        </Text>
        <Button
          variant="primary"
          disabled={changed.length === 0 || saver.conflicted}
          aria-describedby={changed.length === 0 ? blockedId : undefined}
          isLoading={saver.isPending}
          onClick={() => void submit()}
        >
          {t("availabilitySchedules.compare.save", { count: scheduleCount })}
        </Button>
      </div>
      {/* Below Save, so the button does not move as the preview loads and grows. */}
      <DraftPreview
        venueId={venueId}
        changes={previewChanges}
        scopeConflicts={dates.length > 1 ? mode : "replace"}
        dates={reach}
        scope={{ from: today }}
        baseVersion={base?.version ?? state.version}
        held={held}
        idle={saver.conflicted ? "conflict" : "untouched"}
      />
    </Stack>
  );
}
