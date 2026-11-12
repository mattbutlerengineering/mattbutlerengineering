import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
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
  useToast,
} from "@mattbutlerengineering/rialto";
import {
  type AvailabilityConfigState,
  type ClosureDecision,
  type DateRule,
  type FloorPlanSection,
  type Table,
} from "@mbe/types";
import { useEndTonight, useSetTonight, type SetTonightRequest } from "../../hooks/useTonight.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useViewport } from "../../hooks/useViewport.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { CallListDialog } from "./CallListDialog.js";
import { CloseDialog } from "./CloseDialog.js";
import { conflictOf, isDecisionRequired, type Conflict } from "./conflict-problem.js";
import { useWinningChangeText } from "./use-winning-change-text.js";
import { clockHour } from "../../utils/clock-hour.js";
import { minuteText } from "./closure-band.js";
import { TonightDecisionsDialog } from "./TonightDecisionsDialog.js";
import {
  activeTonightChanges,
  tonightDefaults,
  tonightTimeMinutes,
  tonightChipText,
} from "./tonight-state.js";
import { currentServiceDate } from "../../utils/current-service-date.js";
import { serviceMinuteOf } from "../../utils/service-day.js";
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
  /** The venue's floor-plan sections: the grouping for the block-tables list. */
  readonly sections: readonly FloorPlanSection[];
  /** Start with the panel open: the Today line's "Change tonight" link lands here. */
  readonly defaultOpen?: boolean;
}

type TonightBody = SetTonightRequest["change"];

const ALL_TABLES = "all";
const PICK_TABLES = "pick";
const UNSET = "unset";
const SECTION_PREFIX = "section:";
const DEFAULT_PACING = 10;

/** The server refused the change itself (403): a retry cannot succeed. */
function isForbidden(error: unknown): boolean {
  return (
    (error as { problemDetails?: { status?: unknown } } | null)?.problemDetails?.status === 403
  );
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
  const chosen = target.startsWith(SECTION_PREFIX)
    ? active.filter((table) => table.sectionId === target.slice(SECTION_PREFIX.length))
    : active;
  return chosen.map((table) => table.id);
}

interface TableGroup {
  readonly key: string;
  /** The section's name, or null for the "No section" group (named by the caller's copy). */
  readonly name: string | null;
  readonly tables: readonly Table[];
}

/**
 * Active tables grouped by `sectionId`, in the sections' order, with tables that have no section
 * (or a section this venue no longer lists) last. Empty groups are dropped.
 */
function groupBySection(
  tables: readonly Table[],
  sections: readonly FloorPlanSection[]
): readonly TableGroup[] {
  const active = tables.filter((table) => table.isActive);
  const known = new Set(sections.map((section) => section.id));
  const groups: readonly TableGroup[] = [
    ...sections.map((section) => ({
      key: section.id,
      name: section.name,
      tables: active.filter((table) => table.sectionId === section.id),
    })),
    {
      key: "none",
      name: null,
      tables: active.filter((table) => !table.sectionId || !known.has(table.sectionId)),
    },
  ];
  return groups.filter((group) => group.tables.length > 0);
}

/**
 * The Tonight panel (ux.md F7/S8): header chips for the changes in force and a popover (a bottom
 * sheet on phones) to make them. A Host with the grant sees the emergency close with What and
 * When locked; a Host without it sees why not, as text.
 */
export function TonightControl(props: TonightControlProps) {
  const { venueId, state, timezone, now, viewerRole, hostEmergencyClose, tables, sections } = props;
  // Tonight is the service day, which stays on yesterday's date until a late service closes.
  const today = currentServiceDate(state.config, timezone, now);
  const { t } = useTranslation();
  const format = useVenueFormat();
  const viewport = useViewport();
  const setTonight = useSetTonight();
  const endTonight = useEndTonight();
  const refresh = useRefreshAvailability();
  const { toast } = useToast();

  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [closing, setClosing] = useState(false);
  const [needsDecisions, setNeedsDecisions] = useState<{
    readonly ruleId: string;
    readonly closeAt: number;
  } | null>(null);
  const [callListFor, setCallListFor] = useState<string | null>(null);
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

  const tableGroups = useMemo(() => groupBySection(tables, sections), [tables, sections]);
  const blockOptions = [
    { value: ALL_TABLES, label: t("availability.tonight.block.all") },
    ...tableGroups.flatMap((group) =>
      group.name === null
        ? []
        : [
            {
              value: `${SECTION_PREFIX}${group.key}`,
              label: t("availability.tonight.block.section", { section: group.name }),
            },
          ]
    ),
    { value: PICK_TABLES, label: t("availability.tonight.block.pick") },
  ];
  const blockIds = tableTargets(tables, blockTarget, pickedTables);
  // "Now" is the current minute of the service day; past midnight on the same service day it is 1440+.
  const nowServiceMinute = serviceMinuteOf(now, timezone, today);
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
        setError(
          t(isForbidden(failure) ? "availability.tonight.forbidden" : "availability.tonight.error")
        );
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

  const confirmDecisions = async (decisions: ClosureDecision[], ruleId: string) => {
    if (!needsDecisions) return;
    const { closeAt: closedAt } = needsDecisions;
    const result = await setTonight.mutateAsync({
      venueId,
      body: {
        expectedVersion: state.version,
        ruleId,
        change: { type: "close_early", closeAt: closedAt },
        decisions,
      },
    });
    delete attemptIdsRef.current.closeAt;
    setNeedsDecisions(null);
    // The Manager decided on real bookings: say what happened to them, and where to call.
    const { cancel, move, keep_notify } = result.outcomes;
    const notified = cancel + move + keep_notify;
    const closed = t("availability.tonight.toast.closed", {
      time: minuteText(closedAt, t, format),
      count: clockHour(closedAt),
    });
    toast({
      title:
        notified > 0
          ? t("availability.tonight.toast.closedNotified", { closed, count: notified })
          : closed,
      variant: "success",
      ...(notified > 0
        ? {
            action: {
              label: t("availability.tonight.toast.callList"),
              onClick: () => setCallListFor(ruleId),
            },
          }
        : {}),
    });
  };

  const failure = (error || conflict) && (
    <Text variant="caption" color="secondary" role="alert">
      {error ??
        (conflict?.code === "version-conflict"
          ? winnerText
          : t("availability.tonight.alreadyApplied"))}
    </Text>
  );

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
        </div>
        {blockTarget === PICK_TABLES && (
          <div
            role="group"
            aria-label={t("availability.tonight.block.pickLabel")}
            className={styles.tablePicker}
          >
            {tableGroups.map((group) => {
              const groupName = group.name ?? t("availability.tonight.block.noSection");
              return (
                <div
                  key={group.key}
                  role="group"
                  aria-label={groupName}
                  className={styles.tableGroup}
                >
                  <Text as="span" variant="caption" color="secondary" aria-hidden="true">
                    {groupName}
                  </Text>
                  {group.tables.map((table) => (
                    <Checkbox
                      key={table.id}
                      label={table.name}
                      checked={pickedTables.includes(table.id)}
                      disabled={busy !== null}
                      onCheckedChange={(on) => togglePicked(table.id, on)}
                    />
                  ))}
                </div>
              );
            })}
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
        {failure}
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
                {tonightChipText(change, t, format)}
              </Tag>
            </li>
          ))}
        </ul>
      )}
      {/* A chip ✕ works with the panel closed, so its failure can't live only inside the panel. */}
      {!open && failure}
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
          // A column of fields over the timeline grid: glass let the grid show through them.
          solid
        >
          {panel}
        </Popover>
      )}
      {needsDecisions && (
        <TonightDecisionsDialog
          venueId={venueId}
          rule={closeEarlyRule(needsDecisions.ruleId, today, needsDecisions.closeAt)}
          rules={rules}
          today={today}
          closeAt={needsDecisions.closeAt}
          nowMinute={nowServiceMinute}
          onConfirm={confirmDecisions}
          onCallList={setCallListFor}
          onClose={() => setNeedsDecisions(null)}
        />
      )}
      {callListFor && (
        <CallListDialog
          venueId={venueId}
          ruleId={callListFor}
          onClose={() => setCallListFor(null)}
        />
      )}
      {closing && (
        <CloseDialog
          venueId={venueId}
          state={state}
          timezone={timezone}
          today={today}
          initialDate={null}
          startTonight
          hostLocked={viewerRole === "host"}
          onClose={() => setClosing(false)}
        />
      )}
    </>
  );
}
