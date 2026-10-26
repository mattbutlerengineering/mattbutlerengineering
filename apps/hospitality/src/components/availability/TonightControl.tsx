import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { TFunction } from "i18next";
import {
  Button,
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
import type { AvailabilityConfigState, Table } from "@mbe/types";
import { useEndTonight, useSetTonight, type SetTonightRequest } from "../../hooks/useTonight.js";
import { useViewport } from "../../hooks/useViewport.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { CloseDialog } from "./CloseDialog.js";
import { minuteText } from "./closure-band.js";
import { activeTonightChanges, type TonightChange } from "./tonight-state.js";
import styles from "./TonightControl.module.css";

export interface TonightControlProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly now: Date;
  readonly viewerRole: "manager" | "host";
  /** `Venue.hostEmergencyClose`: whether a Host may close the whole venue for tonight. */
  readonly hostEmergencyClose: boolean;
  readonly tables: readonly Table[];
}

type TonightBody = SetTonightRequest["change"];

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);
const ALL_TABLES = "all";
const LOCATION_PREFIX = "location:";
const DEFAULT_CLOSE_AT = 22 * 60;
const DEFAULT_STOP_FROM = 19 * 60 + 30;
const DEFAULT_STOP_TO = 20 * 60;
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
      return t("availability.tonight.chip.blocked", { count: change.tableCount });
    case "pacing":
      return t("availability.tonight.chip.pacing", { count: change.covers });
  }
}

function tableTargets(tables: readonly Table[], target: string): readonly string[] {
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
  const { venueId, state, timezone, today, now, viewerRole, hostEmergencyClose, tables } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const viewport = useViewport();
  const setTonight = useSetTonight();
  const endTonight = useEndTonight();

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closeAt, setCloseAt] = useState(DEFAULT_CLOSE_AT);
  const [stopFrom, setStopFrom] = useState(DEFAULT_STOP_FROM);
  const [stopTo, setStopTo] = useState(DEFAULT_STOP_TO);
  const [blockTarget, setBlockTarget] = useState(ALL_TABLES);
  const [pacing, setPacing] = useState(DEFAULT_PACING);
  // One id per attempt, kept until it succeeds, so a retry replays the first result.
  const attemptIdsRef = useRef<Record<string, string>>({});

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
  ];
  const timeOptions = HALF_HOURS.map((m) => ({
    value: String(m),
    label: minuteText(m, t, format),
  }));

  const run = async (key: string, action: (ruleId: string) => Promise<unknown>) => {
    const ruleId = (attemptIdsRef.current[key] ??= crypto.randomUUID());
    setBusy(key);
    setError(null);
    try {
      await action(ruleId);
      delete attemptIdsRef.current[key];
    } catch {
      setError(t("availability.tonight.error"));
    } finally {
      setBusy(null);
    }
  };

  const apply = (key: string, change: TonightBody) =>
    run(key, (ruleId) =>
      setTonight.mutateAsync({
        venueId,
        body: { expectedVersion: state.version, ruleId, change },
      })
    );

  const end = (ruleId: string) =>
    run(`end:${ruleId}`, () => endTonight.mutateAsync({ venueId, ruleId }));

  const time = (label: string, value: number, set: (m: number) => void) => (
    <Select
      label={label}
      value={String(value)}
      options={timeOptions}
      disabled={busy !== null}
      onChange={(v) => set(Number(v))}
    />
  );

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
            disabled={busy !== null || tableTargets(tables, blockTarget).length === 0}
            isLoading={busy === "block"}
            onClick={() =>
              void apply("block", {
                type: "block_tables",
                tableIds: [...tableTargets(tables, blockTarget)],
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
        {error && (
          <Text variant="caption" color="secondary" role="alert">
            {error}
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
