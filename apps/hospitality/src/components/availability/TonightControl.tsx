import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { TFunction } from "i18next";
import {
  Button,
  Checkbox,
  Divider,
  Drawer,
  NumberInput,
  Popover,
  Select,
  Stack,
  Tag,
  Text,
  Toggle,
} from "@mattbutlerengineering/rialto";
import {
  AvailabilityConfigProblemSchema,
  type AvailabilityConfigState,
  type ClosureDecision,
  type DateRule,
  type Table,
} from "@mbe/types";
import { useEndTonight, useSetTonight, type SetTonightRequest } from "../../hooks/useTonight.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useViewport } from "../../hooks/useViewport.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { CloseDialog } from "./CloseDialog.js";
import { conflictOf, type Conflict } from "./conflict-problem.js";
import { useWinningChangeText } from "./use-winning-change-text.js";
import { minuteText } from "./closure-band.js";
import { TonightDecisionsDialog } from "./TonightDecisionsDialog.js";
import {
  activeTonightChanges,
  tonightDefaults,
  tonightTimeMinutes,
  type TonightChange,
} from "./tonight-state.js";
import { currentServiceDate } from "../../utils/current-service-date.js";
import { minutesOfDayIn, venueDate } from "../../utils/service-day.js";
import styles from "./TonightControl.module.css";

export interface TonightControlProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  readonly now: Date;
  readonly viewerRole: "manager" | "host";
  /** `Venue.hostEmergencyClose`: whether a Host may close the whole venue for tonight. */
  readonly hostEmergencyClose: boolean;
  readonly tables: readonly Table[];
}

type TonightBody = SetTonightRequest["change"];

/**`MinuteSchema` allows a service day up to two days of minutes (ADR-029). */
const MAX_MINUTE = 2880;
const MINUTES_PER_DAY = 1440;
const ALL_TABLES = "all";
const PICK_TABLES = "pick";
const UNSET = "unset";
const LOCATION_PREFIX = "location:";
const DEFAULT_PACING = 10;

function chipText(change: TonightChange, t: TFunction, format: VenueFormat): string {
  switch (change.kind) {
    case "pause_online":
      return t("availability.tonight.chip.pause");
    case "close_early":
      return t("availability.tonight.chip.closeEarly", {
        time: minuteText(change.closeAt, t, format),
      });
    case "stop_window":
      return t("availability.tonight.chip.stopWindow", {
        from: minuteText(change.from, t, format),
        to: minuteText(change.to, t, format),
      });
    case "block_tables":
      // The server stores "rest of tonight" as 0 to the two-day maximum.
      if (change.to >= MAX_MINUTE) {
        return change.from === 0
          ? t("availability.tonight.chip.blocked", { count: change.tableCount })
          : t("availability.tonight.chip.blockedFrom", {
              count: change.tableCount,
              from: minuteText(change.from, t, format),
            });
      }
      return t("availability.tonight.chip.blockedWindow", {
        count: change.tableCount,
        from: minuteText(change.from, t, format),
        to: minuteText(change.to, t, format),
      });
    case "pacing":
      return t("availability.tonight.chip.pacing", { count: change.covers });
  }
}

function isDecisionRequired(error: unknown): boolean {
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const problem = AvailabilityConfigProblemSchema.safeParse(details);
  return problem.success && problem.data.code === "decision-required";
}

/** The Tonight rule the server builds for a close-early, for the impact preview. */
function closeEarlyRule(id: string, today: string, closeAt: number): DateRule {
  return {
    id,
    kind: "tonight",
    targetKind: "venue",
    startsOn: today,
    endsOn: today,
    payload: { version: 1, closeAt },
  };
}

function tableTargets(
  tables: readonly Table[],
  target: string,
  picked: readonly string[]
): readonly string[] {
  if (target === PICK_TABLES) return picked;
  const active = tables.filter((table) => table.isActive);
  const chosen = target.startsWith(LOCATION_PREFIX)
    ? active.filter((table) => table.location === target.slice(LOCATION_PREFIX.length))
    : active;
  return chosen.map((table) => table.id);
}

/**
 * The Tonight panel (ux.md F7/S8): header chips for the changes in force and a popover (a bottom
 * sheet on phones) to make them. A Host with the grant sees the emergency close with What and
 * When locked; a Host without it sees why not, as text.
 */
export function TonightControl(props: TonightControlProps) {
  const { venueId, state, timezone, now, viewerRole, hostEmergencyClose, tables } = props;
  // Tonight is the service day, which stays on yesterday's date until a late service closes.
  const today = currentServiceDate(state.config, timezone, now);
  const { t } = useTranslation();
  const format = useVenueFormat();
  const viewport = useViewport();
  const setTonight = useSetTonight();
  const endTonight = useEndTonight();
  const refresh = useRefreshAvailability();

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [needsDecisions, setNeedsDecisions] = useState<{
    readonly ruleId: string;
    readonly closeAt: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const winnerText = useWinningChangeText(
    conflict?.code === "version-conflict" ? conflict.winningChange : null
  );
  // Null until picked: the shown value is then the default clamped into tonight's options.
  const [closeAtPick, setCloseAt] = useState<number | null>(null);
  const [stopFromPick, setStopFrom] = useState<number | null>(null);
  const [stopToPick, setStopTo] = useState<number | null>(null);
  const [blockTarget, setBlockTarget] = useState(ALL_TABLES);
  const [pickedTables, setPickedTables] = useState<readonly string[]>([]);
  const [blockFrom, setBlockFrom] = useState<number | null>(null);
  const [blockTo, setBlockTo] = useState<number | null>(null);
  const [pacing, setPacing] = useState(DEFAULT_PACING);
  // One id per attempt, kept until it succeeds, so a retry of the same change replays the first
  // result. A different change (its fingerprint) is a new attempt with a new id.
  const attemptIdsRef = useRef<Record<string, { fingerprint: string; id: string }>>({});

  const rules = state.config.dateRules;
  const changes = activeTonightChanges(rules, today, now);
  const pauseChange = changes.find((c) => c.kind === "pause_online");
  const endsAt = rules.flatMap((r) =>
    r.kind === "tonight" && r.startsOn === today && r.expiresAt ? [r.expiresAt] : []
  )[0];
  const canEmergencyClose = viewerRole === "manager" || hostEmergencyClose;
  const isSheet = viewport === "phone";

  const locations = useMemo(
    () => [...new Set(tables.filter((tb) => tb.isActive && tb.location).map((tb) => tb.location!))],
    [tables]
  );
  const blockOptions = [
    { value: ALL_TABLES, label: t("availability.tonight.block.all") },
    ...locations.map((location) => ({
      value: `${LOCATION_PREFIX}${location}`,
      label: t("availability.tonight.block.location", { location }),
    })),
    { value: PICK_TABLES, label: t("availability.tonight.block.pick") },
  ];
  const activeTables = tables.filter((tb) => tb.isActive);
  const blockIds = tableTargets(tables, blockTarget, pickedTables);
  // "Now" is the current minute of the service day; past midnight on the same service day it is 1440+.
  const nowServiceMinute =
    minutesOfDayIn(now, timezone) + (venueDate(now, timezone) > today ? MINUTES_PER_DAY : 0);
  const effectiveFrom = blockFrom ?? nowServiceMinute;
  const blockWindowInvalid = blockTo !== null && blockTo <= effectiveFrom;
  const tonightMinutes = tonightTimeMinutes(state.config, timezone, today);
  const defaults = tonightDefaults(tonightMinutes);
  const closeAt = closeAtPick ?? defaults.closeAt;
  const stopFrom = stopFromPick ?? defaults.stopFrom;
  const stopTo = stopToPick ?? defaults.stopTo;
  const timeOptions = tonightMinutes.map((m) => ({
    value: String(m),
    label: minuteText(m, t, format),
  }));

  const run = async (
    key: string,
    fingerprint: string,
    action: (ruleId: string) => Promise<unknown>,
    // Returns true when the failure was a question for the user rather than an error.
    askUser?: (error: unknown, ruleId: string) => boolean
  ) => {
    const previous = attemptIdsRef.current[key];
    const ruleId = previous?.fingerprint === fingerprint ? previous.id : crypto.randomUUID();
    attemptIdsRef.current[key] = { fingerprint, id: ruleId };
    setBusy(key);
    setError(null);
    setConflict(null);
    try {
      await action(ruleId);
      delete attemptIdsRef.current[key];
    } catch (failure) {
      if (askUser?.(failure, ruleId)) return;
      const lost = conflictOf(failure);
      if (lost) {
        // Someone else's change won, or this attempt already committed: its id is spent, and the
        // screen must show the state that is now true rather than loop on it.
        delete attemptIdsRef.current[key];
        setConflict(lost);
        refresh();
      } else {
        setError(t("availability.tonight.error"));
      }
    } finally {
      setBusy(null);
    }
  };

  const apply = (key: string, change: TonightBody) =>
    run(
      key,
      JSON.stringify(change),
      (ruleId) =>
        setTonight.mutateAsync({
          venueId,
          body: { expectedVersion: state.version, ruleId, change },
        }),
      (failure, ruleId) => {
        // A close-early with bookings after the new close needs a decision per group (F7.3).
        if (change.type !== "close_early" || !isDecisionRequired(failure)) return false;
        setOpen(false);
        setNeedsDecisions({ ruleId, closeAt: change.closeAt });
        return true;
      }
    );

  const confirmDecisions = async (decisions: ClosureDecision[]) => {
    if (!needsDecisions) return;
    await setTonight.mutateAsync({
      venueId,
      body: {
        expectedVersion: state.version,
        ruleId: needsDecisions.ruleId,
        change: { type: "close_early", closeAt: needsDecisions.closeAt },
        decisions,
      },
    });
    delete attemptIdsRef.current.closeAt;
    setNeedsDecisions(null);
  };

  const end = (ruleId: string) =>
    run(`end:${ruleId}`, "", () => endTonight.mutateAsync({ venueId, ruleId }));

  const time = (label: string, value: number, set: (m: number) => void) => (
    <Select
      label={label}
      value={String(value)}
      options={timeOptions}
      disabled={busy !== null}
      onChange={(v) => set(Number(v))}
    />
  );

  // Optional bound: the first option leaves it unset, so the server keeps the whole night.
  const blockTime = (
    label: string,
    unsetLabel: string,
    value: number | null,
    set: (m: number | null) => void
  ) => (
    <Select
      label={label}
      value={value === null ? UNSET : String(value)}
      options={[{ value: UNSET, label: unsetLabel }, ...timeOptions]}
      disabled={busy !== null}
      onChange={(v) => set(v === UNSET ? null : Number(v))}
    />
  );

  const togglePicked = (id: string, on: boolean) =>
    setPickedTables(on ? [...pickedTables, id] : pickedTables.filter((p) => p !== id));

  const panel = (
    <div
      className={styles.panel}
      data-testid="tonight-panel"
      data-layout={isSheet ? "sheet" : "popover"}
    >
      <Stack gap="md">
        <Toggle
          label={t("availability.tonight.pause")}
          checked={pauseChange !== undefined}
          disabled={busy !== null}
          onCheckedChange={(on) =>
            on ? void apply("pause", { type: "pause_online" }) : void end(pauseChange!.ruleId)
          }
        />
        <div className={styles.row}>
          {time(t("availability.tonight.closeEarly"), closeAt, setCloseAt)}
          <Button
            variant="secondary"
            disabled={busy !== null}
            isLoading={busy === "closeAt"}
            onClick={() => void apply("closeAt", { type: "close_early", closeAt })}
          >
            {t("availability.tonight.apply")}
          </Button>
        </div>
        <div className={styles.row}>
          {time(t("availability.tonight.stopFrom"), stopFrom, setStopFrom)}
          {time(t("availability.tonight.stopTo"), stopTo, setStopTo)}
          <Button
            variant="secondary"
            disabled={busy !== null || stopTo <= stopFrom}
            isLoading={busy === "stop"}
            onClick={() => void apply("stop", { type: "stop_window", from: stopFrom, to: stopTo })}
          >
            {t("availability.tonight.apply")}
          </Button>
        </div>
        <div className={styles.row}>
          <Select
            label={t("availability.tonight.block.label")}
            value={blockTarget}
            options={blockOptions}
            disabled={busy !== null}
            onChange={setBlockTarget}
          />
          <Button
            variant="secondary"
            disabled={busy !== null || blockIds.length === 0 || blockWindowInvalid}
            isLoading={busy === "block"}
            onClick={() =>
              void apply("block", {
                type: "block_tables",
                tableIds: [...blockIds],
                from: effectiveFrom,
                ...(blockTo !== null ? { to: blockTo } : {}),
              })
            }
          >
            {t("availability.tonight.block.button")}
          </Button>
        </div>
        {blockTarget === PICK_TABLES && (
          <div
            role="group"
            aria-label={t("availability.tonight.block.pickLabel")}
            className={styles.tablePicker}
          >
            {activeTables.map((table) => (
              <Checkbox
                key={table.id}
                label={table.location ? `${table.name} · ${table.location}` : table.name}
                checked={pickedTables.includes(table.id)}
                disabled={busy !== null}
                onCheckedChange={(on) => togglePicked(table.id, on)}
              />
            ))}
          </div>
        )}
        <div className={styles.row}>
          {blockTime(
            t("availability.tonight.block.from"),
            t("availability.tonight.block.now"),
            blockFrom,
            setBlockFrom
          )}
          {blockTime(
            t("availability.tonight.block.until"),
            t("availability.tonight.block.endOfTonight"),
            blockTo,
            setBlockTo
          )}
        </div>
        <div className={styles.row}>
          <NumberInput
            label={t("availability.tonight.pacing")}
            value={pacing}
            min={1}
            disabled={busy !== null}
            onChange={setPacing}
          />
          <Button
            variant="secondary"
            disabled={busy !== null}
            isLoading={busy === "pacing"}
            onClick={() => void apply("pacing", { type: "pacing", covers: pacing })}
          >
            {t("availability.tonight.apply")}
          </Button>
        </div>
        {(error || conflict) && (
          <Text variant="caption" color="secondary" role="alert">
            {error ??
              (conflict?.code === "version-conflict"
                ? winnerText
                : t("availability.tonight.alreadyApplied"))}
          </Text>
        )}
        {endsAt && (
          <Text variant="caption" color="secondary">
            {t("availability.tonight.ends", {
              time: format.formatInstant(endsAt, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              }),
            })}
          </Text>
        )}
        <Divider spacing="compact" />
        {canEmergencyClose && (
          <Button
            variant="primary"
            disabled={busy !== null}
            onClick={() => {
              setOpen(false);
              setClosing(true);
            }}
          >
            {t("availability.tonight.emergency")}
          </Button>
        )}
        {viewerRole === "manager" ? (
          <Link to="/settings" className={styles.footerLink}>
            {t("availability.tonight.whoCanClose")}
          </Link>
        ) : (
          <Text variant="caption" color="secondary">
            {hostEmergencyClose
              ? t("availability.tonight.hostGranted")
              : t("availability.tonight.hostNotGranted")}
          </Text>
        )}
      </Stack>
    </div>
  );

  const trigger = (
    <Button
      variant="secondary"
      size="md"
      className={styles.trigger}
      aria-expanded={open}
      onClick={isSheet ? () => setOpen(!open) : undefined}
    >
      {t("availability.tonight.open")}
    </Button>
  );

  return (
    <>
      {changes.length > 0 && (
        <ul className={styles.chips} aria-label={t("availability.tonight.chips")}>
          {changes.map((change) => (
            <li key={change.ruleId}>
              <Tag variant="accent" dismissible onDismiss={() => void end(change.ruleId)}>
                {chipText(change, t, format)}
              </Tag>
            </li>
          ))}
        </ul>
      )}
      {isSheet ? (
        <>
          {trigger}
          <Drawer
            open={open}
            onClose={() => setOpen(false)}
            side="bottom"
            title={t("availability.tonight.title")}
          >
            {panel}
          </Drawer>
        </>
      ) : (
        <Popover
          trigger={trigger}
          title={t("availability.tonight.title")}
          placement="bottom"
          open={open}
          onOpenChange={setOpen}
        >
          {panel}
        </Popover>
      )}
      {needsDecisions && (
        <TonightDecisionsDialog
          venueId={venueId}
          rule={closeEarlyRule(needsDecisions.ruleId, today, needsDecisions.closeAt)}
          today={today}
          closeAt={needsDecisions.closeAt}
          nowMinute={nowServiceMinute}
          onConfirm={confirmDecisions}
          onClose={() => setNeedsDecisions(null)}
        />
      )}
      {closing && (
        <CloseDialog
          venueId={venueId}
          state={state}
          timezone={timezone}
          today={today}
          initialDate={null}
          hostLocked={viewerRole === "host"}
          onClose={() => setClosing(false)}
        />
      )}
    </>
  );
}
