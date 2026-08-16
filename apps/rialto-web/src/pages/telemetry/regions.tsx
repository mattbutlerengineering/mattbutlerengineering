/**
 * The four HUD regions of `/demos/telemetry`.
 *
 * Each is a different density register drawn from a different component
 * family, so flipping the vibe stresses the design language rather than
 * flattering it: a status bank, a data grid, a meter rail, and a flap board
 * all have to stay legible under the same set of tokens.
 *
 * Every region renders the same slots in every feed state — a value, a
 * skeleton, or a placeholder glyph, never nothing. A HUD that blanks reads as
 * broken, and a frame that resizes as data arrives reads as cheap.
 */

import {
  Button,
  DataTable,
  DepartureBoard,
  Meter,
  Odometer,
  SegmentedControl,
  Skeleton,
  Stat,
  StatusLED,
  Text,
} from "@mattbutlerengineering/rialto";
import type { VibeName } from "@mattbutlerengineering/rialto";
import type { FeedState, TelemetryFrame, TelemetryZone } from "./useTelemetryFeed";
import { PLACEHOLDER_ZONES } from "./useTelemetryFeed";
import styles from "./Telemetry.module.css";

/** Shown wherever a value has not arrived — never an empty slot. */
const PLACEHOLDER = "––";

type FeedKind = FeedState["kind"];

const STATUS_LABEL: Record<FeedKind, string> = {
  connecting: "CONNECTING",
  empty: "STANDBY",
  live: "LIVE",
  hold: "HOLD",
  stale: "STALE",
};

const STATUS_VARIANT: Record<FeedKind, "success" | "warning" | "danger" | "accent" | "off"> = {
  connecting: "warning",
  empty: "off",
  live: "success",
  hold: "accent",
  stale: "danger",
};

/** Session clock from the frame's own `t` — never the wall clock. */
function sessionClock(t: number): string {
  const totalSeconds = Math.floor(t / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * One value slot, in whichever form the feed state calls for. The slot itself
 * is always present — only its contents change — which is what keeps the frame
 * from resizing as a session connects.
 */
function ValueSlot({
  kind,
  width = "3rem",
  children,
}: {
  kind: FeedKind;
  width?: string;
  children: React.ReactNode;
}) {
  if (kind === "connecting") {
    return (
      <Text as="span" data-skeleton-slot className={styles.slot}>
        <Skeleton variant="text" width={width} />
      </Text>
    );
  }
  if (kind === "empty") {
    return (
      <Text as="span" className={styles.slot}>
        {PLACEHOLDER}
      </Text>
    );
  }
  return (
    <Text as="span" className={styles.slot}>
      {children}
    </Text>
  );
}

/* ── Status strip ────────────────────────────── */

export function StatusStrip({
  feed,
  frame,
  onReconnect,
  children,
}: {
  feed: FeedState;
  frame: TelemetryFrame | null;
  onReconnect: () => void;
  children?: React.ReactNode;
}) {
  const pulsing = feed.kind === "live" || feed.kind === "connecting";
  const label =
    feed.kind === "stale"
      ? `${STATUS_LABEL.stale} · captured ${sessionClock(feed.since)}`
      : STATUS_LABEL[feed.kind];

  return (
    <header className={styles.statusStrip} aria-label="Session status">
      <div className={styles.statusFlag}>
        <StatusLED
          variant={STATUS_VARIANT[feed.kind]}
          pulse={pulsing}
          label={STATUS_LABEL[feed.kind]}
        />
        <Text variant="label">{label}</Text>
      </div>
      <Text variant="label">
        LAP{" "}
        <ValueSlot kind={feed.kind}>{frame ? `${frame.lap}/${frame.totalLaps}` : null}</ValueSlot>
      </Text>
      <Text variant="label">
        P
        <ValueSlot kind={feed.kind} width="1.5rem">
          {frame ? frame.position : null}
        </ValueSlot>
      </Text>
      <div className={styles.systemMeter}>
        <Meter
          value={frame ? Math.round(frame.vitals.fuel * 100) : 0}
          label="SYS"
          size="sm"
          variant="accent"
        />
      </div>
      <div className={styles.statusControls}>
        {feed.kind === "stale" && (
          <Button size="sm" variant="secondary" onClick={onReconnect}>
            Reconnect
          </Button>
        )}
        {children}
      </div>
    </header>
  );
}

/* ── Zone table ──────────────────────────────── */

export function ZoneTable({ frame, kind }: { frame: TelemetryFrame | null; kind: FeedKind }) {
  const columns = [
    { key: "zone", header: "Zone", rowHeader: true, sortable: true },
    {
      key: "speed",
      header: "SPD",
      align: "right" as const,
      render: (row: TelemetryZone) => <ValueSlot kind={kind}>{row.speed}</ValueSlot>,
    },
    {
      key: "best",
      header: "Best",
      align: "right" as const,
      render: (row: TelemetryZone) => <ValueSlot kind={kind}>{row.best}</ValueSlot>,
    },
    {
      key: "delta",
      header: "Δ",
      align: "right" as const,
      render: (row: TelemetryZone) => (
        <ValueSlot kind={kind} width="2rem">
          <Text className={row.delta >= 0 ? styles.deltaUp : styles.deltaDown}>
            {row.delta > 0 ? "+" : ""}
            {row.delta}
          </Text>
        </ValueSlot>
      ),
    },
    {
      key: "live",
      header: "",
      width: "2rem",
      render: (row: TelemetryZone) =>
        row.id === frame?.activeZoneId ? (
          <StatusLED variant="accent" pulse label={`${row.zone} is the current zone`} />
        ) : null,
    },
  ];

  return (
    <section className={styles.zoneTable} aria-label="Zone times">
      <DataTable
        columns={columns}
        data={frame?.zones ?? PLACEHOLDER_ZONES}
        rowKey={(row) => row.id}
        density="compact"
        label="Zone times"
      />
    </section>
  );
}

/* ── Vitals rail ─────────────────────────────── */

const VITAL_ROWS = [
  { key: "throttle", label: "THROTTLE", variant: "success" as const },
  { key: "brake", label: "BRAKE", variant: "error" as const },
  { key: "fuel", label: "FUEL", variant: "accent" as const },
  { key: "tyreFL", label: "TYRE FL", variant: "default" as const },
  { key: "tyreFR", label: "TYRE FR", variant: "default" as const },
] as const;

export function VitalsRail({ frame, kind }: { frame: TelemetryFrame | null; kind: FeedKind }) {
  const activeZone = frame?.zones.find((zone) => zone.id === frame.activeZoneId);

  return (
    <section className={styles.vitalsRail} aria-label="Vitals">
      {VITAL_ROWS.map(({ key, label, variant }) => {
        const percent = frame ? Math.round(frame.vitals[key] * 100) : 0;
        return (
          <div key={key} className={styles.vitalRow} data-vital={key}>
            {/* Meter renders its own label — a second one here would duplicate
                the accessible name it derives from that same prop. */}
            <Meter value={percent} label={label} variant={variant} size="sm" />
            <ValueSlot kind={kind} width="2.5rem">{`${percent}%`}</ValueSlot>
          </div>
        );
      })}
      <div className={styles.focal}>
        {kind === "connecting" || kind === "empty" ? (
          <ValueSlot kind={kind} width="6rem">
            {null}
          </ValueSlot>
        ) : (
          <Odometer value={activeZone?.speed ?? 0} locale="en-US" size="lg" />
        )}
        <Stat
          value={activeZone ? `${activeZone.best} km/h` : PLACEHOLDER}
          label="Session best"
          delta={activeZone ? `${activeZone.delta > 0 ? "+" : ""}${activeZone.delta}` : undefined}
          trend={activeZone && activeZone.delta >= 0 ? "up" : "down"}
          size="sm"
        />
      </div>
    </section>
  );
}

/* ── Event ticker ────────────────────────────── */

export function EventTicker({ frame, frozen }: { frame: TelemetryFrame | null; frozen: boolean }) {
  const phrases = frame?.events.map((event) => `${sessionClock(event.t)} ${event.label}`) ?? [
    "AWAITING TELEMETRY",
  ];
  // A frozen board must not run its own cycle timer: DepartureBoard only
  // starts one when it has more than one phrase to show.
  const shown = frozen ? phrases.slice(0, 1) : phrases;

  return (
    <footer className={styles.ticker} aria-label="Event feed">
      <DepartureBoard phrases={shown} size="sm" charset="full" />
    </footer>
  );
}

/* ── Vibe switch ─────────────────────────────── */

/** The two vibes this route offers. The rest of the catalog is out of scope here. */
const VIBE_SEGMENTS = [
  { id: "game", label: "Game" },
  { id: "default", label: "Default" },
];

/**
 * The route's whole pitch: flip this and watch the same screen change
 * character. Local state only — the choice is deliberately not persisted and
 * not visible to any other route.
 */
export function VibeSwitch({
  value,
  onChange,
}: {
  value: VibeName;
  onChange: (vibe: VibeName) => void;
}) {
  return (
    <SegmentedControl
      segments={VIBE_SEGMENTS}
      value={value}
      onChange={(id) => onChange(id as VibeName)}
      size="sm"
      aria-label="Vibe"
    />
  );
}
