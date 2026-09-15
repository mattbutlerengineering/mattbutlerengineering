import { useMemo, useState, type ReactNode } from "react";
import {
  Card,
  Stack,
  TapeChart,
  Text,
  type TapeChartReservation,
} from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import { defaultDateRange, makeReservations, makeRooms } from "../../data/tapechart-fixtures";
import styles from "./ReservationTimelineExamplePage.module.css";

/** Rooms shown as timeline rows — enough to demonstrate the layout without crowding it. */
export const ROOM_COUNT = 10;

/** Fraction of the date range each room's fixture reservations fill. */
export const RESERVATION_DENSITY = 0.6;

const SOURCE_JSX = `import { TapeChart } from "@mattbutlerengineering/rialto";

// Local fixture — no service calls
<TapeChart
  rooms={rooms}
  reservations={reservations}
  startDate={startDate}
  endDate={endDate}
  onReservationClick={(r) => setSelectedId(r.id)}
  selectedReservationId={selectedId}
/>`;

const COMPOSITION_NOTES: ReactNode = (
  <CompositionNote>
    One Gantt-style timeline composed from a single <code>TapeChart</code> — one row per room, one
    bar per reservation spanning its stay. Clicking a bar reports the selection back through
    <code>onReservationClick</code>; the details card below reads the same fixture data the chart
    was given.
  </CompositionNote>
);

export function ReservationTimelineExamplePage() {
  const { startDate, endDate } = useMemo(() => defaultDateRange(), []);
  const rooms = useMemo(() => makeRooms(ROOM_COUNT), []);
  const reservations = useMemo(
    () => makeReservations(rooms, startDate, endDate, RESERVATION_DENSITY),
    [rooms, startDate, endDate]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? reservations.find((r) => r.id === selectedId) : null;

  const handleReservationClick = (reservation: TapeChartReservation) => {
    setSelectedId(reservation.id);
  };

  return (
    <ExamplePageLayout
      name="Reservation Timeline"
      description="Gantt-style horizontal timeline of reservations across rooms — one row per room, one bar per stay"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <Stack gap="lg">
        <div className={styles.summary}>
          <Text variant="caption" color="secondary">
            {rooms.length} rooms
          </Text>
          <Text variant="caption" color="secondary">
            {startDate} → {endDate}
          </Text>
        </div>

        <Card variant="flat">
          <TapeChart
            rooms={rooms}
            reservations={reservations}
            startDate={startDate}
            endDate={endDate}
            locale="en-US"
            currency="USD"
            density="comfortable"
            viewMode="grid"
            onReservationClick={handleReservationClick}
            selectedReservationId={selectedId}
          />
        </Card>

        {selected && (
          <Card variant="elevated" data-testid="reservation-timeline-selection">
            <Stack gap="xs">
              <Text variant="label">
                {selected.guestName ?? "Reservation"} ·{" "}
                {rooms.find((room) => room.id === selected.roomId)?.name}
              </Text>
              <Text variant="caption" color="secondary">
                {selected.start} → {selected.end} · {selected.source} · {selected.status}
              </Text>
            </Stack>
          </Card>
        )}
      </Stack>
    </ExamplePageLayout>
  );
}

ReservationTimelineExamplePage.displayName = "ReservationTimelineExamplePage";
