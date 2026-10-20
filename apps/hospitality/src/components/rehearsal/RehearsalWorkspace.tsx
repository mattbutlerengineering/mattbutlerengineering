import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Heading, SegmentedControl, Stat, Text } from "@mattbutlerengineering/rialto";
import { useMotionPreset } from "@mattbutlerengineering/rialto/providers";
import type { FloorPlan, Table } from "@mbe/types";
import { TimelineGrid } from "../timeline/TimelineGrid";
import { FloorPlanCanvas } from "../floor-plan/FloorPlanCanvas";
import { useVenueFormat } from "../../hooks/useVenueFormat";
import { venueDate } from "../../utils/service-day";
import { RehearsalBanner } from "./RehearsalBanner";
import { TransportBar } from "./TransportBar";
import { describeEvent, partyLabel, rightNowSentence } from "./rehearsal-copy";
import { eventIndexAt, foldEvents } from "./rehearsal-state";
import { buildRehearsalView, minuteToIso, venueMidnightMs } from "./rehearsal-view-model";
import type { RehearsalProfileId } from "./profiles";
import type { RehearsalEvent } from "./simulate-service";
import { shouldAnnounce, type PlaybackSpeed } from "./should-announce";
import { useRehearsalPlayback } from "./use-rehearsal-playback";
import styles from "./RehearsalWorkspace.module.css";

type RehearsalViewId = "timeline" | "floor-plan";

export interface RehearsalWorkspaceProps {
  events: readonly RehearsalEvent[];
  tables: Table[];
  floorPlan: FloorPlan;
  profile: Exclude<RehearsalProfileId, "brunch">;
  seed: number;
  openMinute: number;
  closeMinute: number;
  /** Fixes which calendar day the simulated night is drawn on; stable for the whole run. */
  anchor: Date;
  onLeave: () => void;
}

const noop = () => undefined;

/**
 * The rehearsal screen (ux.md Screens 1 to 4): both views behind one switch, sharing one banner,
 * one transport and one live region. Read-only by construction: no handler it passes can write.
 */
export function RehearsalWorkspace({
  events,
  tables,
  floorPlan,
  profile,
  seed,
  openMinute,
  closeMinute,
  anchor,
  onLeave,
}: RehearsalWorkspaceProps) {
  const { t } = useTranslation();
  const fmt = useVenueFormat();
  const { reduced } = useMotionPreset();
  const [viewId, setViewId] = useState<RehearsalViewId>("timeline");

  // Normal motion: the live region says the state at `announcedMinute`, set by the throttle.
  const [announcedMinute, setAnnouncedMinute] = useState<number | null>(null);
  const lastAnnounceRef = useRef<number | null>(null);
  const speedRef = useRef<PlaybackSpeed>(60);

  const playback = useRehearsalPlayback(events, {
    openMinute,
    closeMinute,
    reducedMotion: reduced,
    onTick: (minute, ts) => {
      if (shouldAnnounce(lastAnnounceRef.current, ts, speedRef.current, false)) {
        lastAnnounceRef.current = ts;
        setAnnouncedMinute(minute);
      }
    },
  });
  const { minute, speed } = playback;
  useEffect(() => {
    speedRef.current = speed;
  });

  const midnight = useMemo(() => venueMidnightMs(anchor, fmt.timeZone), [anchor, fmt.timeZone]);
  const formatMinute = (m: number) => fmt.formatTime(minuteToIso(midnight, m));
  const tableNameById = useMemo(
    () => new Map(tables.map((table) => [table.id, table.tableNumber || table.name])),
    [tables]
  );
  const tableName = (id: string) => tableNameById.get(id) ?? id;

  const state = useMemo(
    () => foldEvents(events, playback.eventIndex),
    [events, playback.eventIndex]
  );
  const view = useMemo(
    () =>
      buildRehearsalView({
        state,
        seed,
        tableIds: tables.map((table) => table.id),
        now: anchor,
        timeZone: fmt.timeZone,
        partyName: (size) => partyLabel(t, size),
      }),
    [state, seed, tables, anchor, fmt.timeZone, t]
  );

  const rightNow = rightNowSentence(t, state);
  const planTables = useMemo(
    () => tables.filter((table) => table.floorPlanId === floorPlan.id),
    [tables, floorPlan.id]
  );
  const gridNow = useMemo(() => new Date(midnight + minute * 60_000), [midnight, minute]);

  const partySize = (partyId: string) => state.parties.get(partyId)?.size ?? 0;
  const announcedState = useMemo(
    () =>
      announcedMinute === null ? null : foldEvents(events, eventIndexAt(events, announcedMinute)),
    [events, announcedMinute]
  );
  let liveText = "";
  if (reduced) {
    liveText = t("rehearsal.live.step", {
      time: formatMinute(minute),
      what: state.lastEvent
        ? describeEvent(t, state.lastEvent, tableName, partySize)
        : t("rehearsal.startOfNight"),
    });
  } else if (announcedState !== null && announcedMinute !== null) {
    liveText = t("rehearsal.live.moment", {
      time: formatMinute(announcedMinute),
      summary: rightNowSentence(t, announcedState),
    });
  }

  const handlePause = () => {
    playback.pause();
    setAnnouncedMinute(minute);
  };
  const handleScrubRelease = () => {
    playback.releaseScrub();
    setAnnouncedMinute(playback.minute);
  };

  const timeLabel = formatMinute(minute);
  const titleKey = profile === "friday" ? "rehearsal.title.friday" : "rehearsal.title.weeknight";
  const startHour = Math.floor(openMinute / 60);
  const endHour = Math.floor((closeMinute - 1) / 60);

  return (
    <div className={styles.workspace} data-testid="rehearsal-workspace">
      <RehearsalBanner onLeave={onLeave} />
      <div className={styles.body}>
        <div className={styles.head}>
          <SegmentedControl
            aria-label={t("rehearsal.view.label")}
            segments={[
              { id: "timeline", label: t("rehearsal.view.timeline") },
              { id: "floor-plan", label: t("rehearsal.view.floorPlan") },
            ]}
            value={viewId}
            onChange={(id) => setViewId(id as RehearsalViewId)}
          />
          <Heading level={2} size={5} className={styles.title}>
            {t(titleKey, { time: timeLabel })}
          </Heading>
        </div>

        <div className={styles.stats}>
          <Stat size="sm" label={t("rehearsal.stats.booked")} value={state.counts.booked} />
          <Stat size="sm" label={t("rehearsal.stats.seated")} value={state.counts.seated} />
          <Stat size="sm" label={t("rehearsal.stats.covers")} value={state.counts.covers} />
          <Stat size="sm" label={t("rehearsal.stats.waiting")} value={state.counts.waiting} />
        </div>

        {reduced ? (
          <Text as="p" className={styles.note}>
            {t("rehearsal.reducedMotionHint")}
          </Text>
        ) : null}
        {state.parties.size === 0 ? (
          <Text as="p" className={styles.note}>
            {t("rehearsal.startOfNight")}
          </Text>
        ) : null}

        {viewId === "timeline" ? (
          <div className={styles.frame}>
            <TimelineGrid
              tables={tables}
              reservations={view.reservations}
              date={venueDate(anchor, fmt.timeZone)}
              startHour={startHour}
              endHour={endHour}
              seatedIds={view.seatedIds}
              readOnly
              now={gridNow}
            />
          </div>
        ) : (
          <div className={styles.frame}>
            <ul className={styles.legend} aria-label={t("rehearsal.legend.label")}>
              <li className={styles.legendItem}>
                <Text
                  as="span"
                  className={`${styles.swatch} ${styles.swatchAvailable}`}
                  aria-hidden="true"
                />
                {t("rehearsal.legend.available")}
              </li>
              <li className={styles.legendItem}>
                <Text
                  as="span"
                  className={`${styles.swatch} ${styles.swatchOccupied}`}
                  aria-hidden="true"
                />
                {t("rehearsal.legend.occupied")}
              </li>
              <li className={styles.legendItem}>
                <Text
                  as="span"
                  className={`${styles.swatch} ${styles.swatchDirty}`}
                  aria-hidden="true"
                />
                {t("rehearsal.legend.dirty")}
              </li>
            </ul>
            <div role="img" aria-label={rightNow}>
              <div inert>
                <FloorPlanCanvas
                  floorPlan={floorPlan}
                  tables={planTables}
                  onTableMove={noop}
                  onTableSelect={noop}
                  selectedTableId={null}
                  readOnly
                  tableStatuses={view.tableStatuses}
                />
              </div>
            </div>
          </div>
        )}

        {view.waiting.map((party) => (
          <Text as="p" key={party.partyId} className={styles.waiting}>
            {t("rehearsal.waitingParty", {
              size: party.size,
              minutes: Math.max(0, Math.floor(minute - party.sinceAt)),
            })}
          </Text>
        ))}

        <Text as="p" className={styles.rightNow}>
          <strong>{t("rehearsal.rightNow.label")}</strong>
          {": "}
          {rightNow}
        </Text>
      </div>

      <TransportBar
        minute={minute}
        openMinute={openMinute}
        closeMinute={closeMinute}
        playing={playback.playing}
        speed={speed}
        atEnd={playback.atEnd}
        reducedMotion={reduced}
        formatMinute={formatMinute}
        onPlay={playback.play}
        onPause={handlePause}
        onSpeed={playback.setSpeed}
        onScrub={playback.scrubTo}
        onScrubRelease={handleScrubRelease}
        onStep={playback.stepEvent}
        onReplay={playback.restart}
      />

      <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {liveText}
      </div>
    </div>
  );
}
