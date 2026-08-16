/**
 * The four HUD regions of `/demos/telemetry`.
 *
 * Each is a different density register drawn from a different component
 * family, so flipping the vibe stresses the design language rather than
 * flattering it: a status bank, a data grid, a meter rail, and a flap board
 * all have to stay legible under the same set of tokens.
 *
 * Every region renders its frame whether or not data has arrived. A HUD that
 * blanks reads as broken — see `ux.md`.
 */

import {
  DataTable,
  DepartureBoard,
  Meter,
  Odometer,
  Stat,
  StatusLED,
  Text,
} from "@mattbutlerengineering/rialto";
import type { FeedState, TelemetryFrame, TelemetryZone } from "./useTelemetryFeed";
import styles from "./Telemetry.module.css";

/** Shown wherever a value has not arrived — never an empty cell. */
const PLACEHOLDER = "––";

const STATUS_LABEL: Record<FeedState["kind"], string> = {
  connecting: "CONNECTING",
  empty: "STANDBY",
  live: "LIVE",
  hold: "HOLD",
  stale: "STALE",
};

const STATUS_VARIANT: Record<
  FeedState["kind"],
  "success" | "warning" | "danger" | "accent" | "off"
> = {
  connecting: "warning",
  empty: "off",
  live: "success",
  hold: "accent",
  stale: "danger",
};

/** Session clock from the frame's own `t` — never the wall clock. */
export function sessionClock(t: number): string {
  const totalSeconds = Math.floor(t / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/* ── Status strip ────────────────────────────── */

export function StatusStrip({
  feed,
  frame,
  children,
}: {
  feed: FeedState;
  frame: TelemetryFrame | null;
  children?: React.ReactNode;
}) {
  const pulsing = feed.kind === "live" || feed.kind === "connecting";

  return (
    <header className={styles.statusStrip} aria-label="Session status">
      <Text className={styles.statusFlag}>
        <StatusLED
          variant={STATUS_VARIANT[feed.kind]}
          pulse={pulsing}
          label={STATUS_LABEL[feed.kind]}
        />
        <Text variant="label">{STATUS_LABEL[feed.kind]}</Text>
      </Text>
      <Text variant="label">LAP {frame ? `${frame.lap}/${frame.totalLaps}` : PLACEHOLDER}</Text>
      <Text variant="label">P{frame ? frame.position : PLACEHOLDER}</Text>
      <Text className={styles.systemMeter}>
        <Meter
          value={frame ? Math.round(frame.vitals.fuel * 100) : 0}
          label="SYS"
          size="sm"
          variant="accent"
        />
      </Text>
      <Text className={styles.statusControls}>{children}</Text>
    </header>
  );
}

/* ── Zone table ──────────────────────────────── */

export function ZoneTable({ frame }: { frame: TelemetryFrame | null }) {
  const columns = [
    { key: "zone", header: "Zone", rowHeader: true, sortable: true },
    { key: "speed", header: "SPD", align: "right" as const, sortable: true },
    { key: "best", header: "Best", align: "right" as const, sortable: true },
    {
      key: "delta",
      header: "Δ",
      align: "right" as const,
      sortable: true,
      render: (row: TelemetryZone) => (
        <Text className={row.delta >= 0 ? styles.deltaUp : styles.deltaDown}>
          {row.delta > 0 ? "+" : ""}
          {row.delta}
        </Text>
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
        data={frame?.zones ?? []}
        rowKey={(row) => row.id}
        density="compact"
        label="Zone times"
        emptyMessage="Awaiting telemetry"
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

export function VitalsRail({ frame }: { frame: TelemetryFrame | null }) {
  const activeZone = frame?.zones.find((zone) => zone.id === frame.activeZoneId);

  return (
    <section className={styles.vitalsRail} aria-label="Vitals">
      {VITAL_ROWS.map(({ key, label, variant }) => (
        <Meter
          key={key}
          value={frame ? Math.round(frame.vitals[key] * 100) : 0}
          label={label}
          variant={variant}
          showValue
          size="sm"
        />
      ))}
      <div className={styles.focal}>
        <Odometer value={activeZone?.speed ?? 0} locale="en-US" size="lg" />
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
