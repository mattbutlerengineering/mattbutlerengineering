import { useMemo, useState, type ReactNode } from "react";
import {
  Card,
  Checkbox,
  Select,
  Stack,
  TapeChart,
  Text,
  type TapeChartReservation,
  type TapeChartRoom,
} from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import { makeReservations, makeRooms } from "../../data/tapechart-fixtures";
import styles from "./AvailabilityHeatmapExamplePage.module.css";

/* ── Domain ──────────────────────────────────── */

/** Fixed, seed-based range so the fixture (and every test against it) is deterministic. */
export const START_DATE = "2026-04-06";
export const END_DATE = "2026-04-20";

export type OccupancyLevel = "low" | "medium" | "high";

export const OCCUPANCY_DENSITY: Record<OccupancyLevel, number> = {
  low: 0.35,
  medium: 0.6,
  high: 0.85,
};

const OCCUPANCY_OPTIONS = [
  { value: "low", label: "Low occupancy" },
  { value: "medium", label: "Medium occupancy" },
  { value: "high", label: "High occupancy" },
];

/* ── Fixture data (no service calls) ─────────── */

export const ROOMS: TapeChartRoom[] = makeRooms(12);

/**
 * Two rooms pulled out of inventory for a maintenance window, independent of
 * the occupancy level — `TapeChart` renders any reservation carrying
 * `blockedReason` with its blocked treatment regardless of `status`.
 */
export function buildMaintenanceBlocks(rooms: TapeChartRoom[]): TapeChartReservation[] {
  const blocks: TapeChartReservation[] = [];
  const first = rooms[0];
  const third = rooms[2];
  if (first) {
    blocks.push({
      id: "block-1",
      roomId: first.id,
      start: "2026-04-08",
      end: "2026-04-10",
      status: "confirmed",
      blockedReason: "Deep clean",
    });
  }
  if (third) {
    blocks.push({
      id: "block-2",
      roomId: third.id,
      start: "2026-04-12",
      end: "2026-04-15",
      status: "confirmed",
      blockedReason: "Maintenance",
    });
  }
  return blocks;
}

function daysBetween(startDate: string, endDate: string): number {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000);
}

function nightsInRange(reservation: TapeChartReservation, startDate: string, endDate: string) {
  const start = Math.max(Date.parse(reservation.start), Date.parse(startDate));
  const end = Math.min(Date.parse(reservation.end), Date.parse(endDate));
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/** Booked (non-blocked) room-nights as a share of total room-nights in range, 0–100. */
export function occupancyRatePercent(
  rooms: TapeChartRoom[],
  reservations: TapeChartReservation[],
  startDate: string,
  endDate: string
): number {
  const totalNights = rooms.length * daysBetween(startDate, endDate);
  if (totalNights <= 0) return 0;
  const bookedNights = reservations
    .filter((r) => !r.blockedReason)
    .reduce((sum, r) => sum + nightsInRange(r, startDate, endDate), 0);
  return Math.round((bookedNights / totalNights) * 100);
}

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `import { TapeChart } from "@mattbutlerengineering/rialto";

// Local fixture — no service calls. A reservation with no \`blockedReason\`
// renders as a booked bar; one with \`blockedReason\` renders blocked
// regardless of status; a day/room with no reservation reads as available.
const reservations = showBlocks
  ? [...makeReservations(rooms, startDate, endDate, density), ...maintenanceBlocks]
  : makeReservations(rooms, startDate, endDate, density);

<TapeChart
  rooms={rooms}
  reservations={reservations}
  startDate={startDate}
  endDate={endDate}
  onReservationClick={(r) => setSelectedId(r.id)}
  selectedReservationId={selectedId}
/>`;

const COMPOSITION_NOTES: ReactNode = (
  <>
    <CompositionNote>
      The rooms × days grid <em>is</em> the availability heatmap — an empty cell reads as available,
      a colored bar reads as booked, and a reservation carrying a <code>blockedReason</code>{" "}
      (maintenance, deep clean) renders with its blocked treatment regardless of status. Occupancy
      level swaps the fixture&apos;s booking density, changing how much color fills the grid.
    </CompositionNote>
    <CompositionNote>
      Occupancy rate is a pure transform over the same reservation list the grid renders — booked
      room-nights divided by total room-nights in range, excluding blocked stretches from the booked
      count.
    </CompositionNote>
  </>
);

/* ── Page component ──────────────────────────── */

export function AvailabilityHeatmapExamplePage() {
  const [occupancy, setOccupancy] = useState<OccupancyLevel>("medium");
  const [showBlocks, setShowBlocks] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const bookedReservations = useMemo(
    () => makeReservations(ROOMS, START_DATE, END_DATE, OCCUPANCY_DENSITY[occupancy]),
    [occupancy]
  );
  const maintenanceBlocks = useMemo(() => buildMaintenanceBlocks(ROOMS), []);
  const reservations = showBlocks
    ? [...bookedReservations, ...maintenanceBlocks]
    : bookedReservations;

  const occupancyRate = useMemo(
    () => occupancyRatePercent(ROOMS, bookedReservations, START_DATE, END_DATE),
    [bookedReservations]
  );

  const selected = reservations.find((r) => r.id === selectedId) ?? null;
  const selectedRoom = selected ? ROOMS.find((room) => room.id === selected.roomId) : undefined;

  return (
    <ExamplePageLayout
      name="Availability Heatmap"
      description="Room availability over a date range as a color-intensity grid — booked, blocked, and open nights per unit per day"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <Stack gap="lg">
        <div className={styles.toolbar}>
          <Select
            label="Occupancy level"
            options={OCCUPANCY_OPTIONS}
            value={occupancy}
            onChange={(value) => setOccupancy(value as OccupancyLevel)}
          />
          <Checkbox
            label="Show maintenance blocks"
            checked={showBlocks}
            onCheckedChange={setShowBlocks}
          />
          <Text variant="label" className={styles.occupancyReadout}>
            {occupancyRate}% booked
          </Text>
        </div>

        <Card>
          <TapeChart
            rooms={ROOMS}
            reservations={reservations}
            startDate={START_DATE}
            endDate={END_DATE}
            currency="USD"
            viewMode="grid"
            onReservationClick={(r) => setSelectedId(r.id)}
            selectedReservationId={selectedId}
          />
        </Card>

        {selected && (
          <Card variant="elevated">
            <Stack gap="xs">
              <Text variant="label">
                {selected.blockedReason ? `Blocked · ${selected.blockedReason}` : "Booked"}
              </Text>
              <Text variant="caption" color="secondary">
                {selected.start} → {selected.end}
                {selectedRoom ? ` · Room ${selectedRoom.name}` : ""}
              </Text>
            </Stack>
          </Card>
        )}
      </Stack>
    </ExamplePageLayout>
  );
}

AvailabilityHeatmapExamplePage.displayName = "AvailabilityHeatmapExamplePage";
