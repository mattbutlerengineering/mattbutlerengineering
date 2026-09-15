import { Button, Divider, Stack, Text } from "@mattbutlerengineering/rialto";
import type { Reservation, Table } from "@mbe/types";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { GuestCard } from "../crm/GuestCard.js";
import { formatTime } from "../../utils/format.js";
import {
  canSeat,
  findReservationTable,
  occupiedCaption,
  statusWord,
  useSeatGuest,
} from "./seat-guest.js";
import styles from "./ReservationDetails.module.css";

export interface ReservationDetailsProps {
  reservation: Reservation;
  /** The authoritative table list — the reservation's own `table` snapshot may be stale. */
  tables: Table[];
  /** Computed by the page from `seatedReservationIds` (ux Decision a). */
  seated: boolean;
  onEdit: () => void;
  /** Rejects on failure — the panel owns showing it (architecture § Dialog contracts). */
  onSeat: () => Promise<void>;
  onCancel: () => void;
}

function getStatusBadgeClass(reservation: Reservation, seated: boolean): string {
  if (seated) return styles.statusSeated ?? "";
  switch (reservation.status) {
    case "CONFIRMED":
      return styles.statusConfirmed ?? "";
    case "PENDING":
      return styles.statusPending ?? "";
    case "COMPLETED":
      return styles.statusCompleted ?? "";
    case "CANCELLED":
      return styles.statusCancelled ?? "";
    default:
      return styles.statusNoShow ?? "";
  }
}

/**
 * The desktop sidebar's detail panel (ux.md Screen 5): says what is true about this party, and the
 * one thing the Host does is tap Seat Guest exactly once. A rejected `onSeat` is rendered here as
 * "Guest not seated." with focus back on the button; the page never sees the failure.
 */
export function ReservationDetails({
  reservation,
  tables,
  seated,
  onEdit,
  onSeat,
  onCancel,
}: ReservationDetailsProps) {
  const table = findReservationTable(reservation, tables);
  const caption = occupiedCaption(reservation, table, seated);
  const { seating, failure, seatRef, seat } = useSeatGuest(onSeat);

  return (
    <Stack gap="lg" className={styles.detailsStack}>
      {reservation.guestId ? (
        <>
          <GuestCard guestId={reservation.guestId} />
          <Divider />
        </>
      ) : (
        <div>
          <Text variant="label" color="secondary">
            Guest
          </Text>
          <Text variant="display" as="div">
            {reservation.guestName || "Guest"}
          </Text>
        </div>
      )}

      {reservation.guestEmail && (
        <div>
          <Text variant="label" color="secondary">
            Email
          </Text>
          <Text variant="body" as="div">
            {reservation.guestEmail}
          </Text>
        </div>
      )}

      {reservation.guestPhone && (
        <div>
          <Text variant="label" color="secondary">
            Phone
          </Text>
          <Text variant="body" as="div">
            {reservation.guestPhone}
          </Text>
        </div>
      )}

      <div>
        <Text variant="label" color="secondary">
          Time
        </Text>
        <Text variant="body" as="div">
          {formatTime(reservation.startTime)}
          {" - "}
          {formatTime(reservation.endTime)}
        </Text>
      </div>

      <div>
        <Text variant="label" color="secondary">
          Party Size
        </Text>
        <Text variant="body" as="div">
          {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
        </Text>
      </div>

      <div>
        <Text variant="label" color="secondary">
          Table
        </Text>
        <Text variant="body" as="div">
          {table ? (
            table.name
          ) : (
            <>
              <Text as="span" aria-hidden="true">
                —
              </Text>
              <Text as="span" className={styles.visuallyHidden}>
                table unknown
              </Text>
            </>
          )}
        </Text>
      </div>

      <div>
        <Text variant="label" color="secondary">
          Status
        </Text>
        <Text className={`${styles.statusBadge} ${getStatusBadgeClass(reservation, seated)}`}>
          {statusWord(reservation, seated)}
        </Text>
        {caption && (
          <Text variant="caption" color="secondary" as="div" className={styles.statusCaption}>
            {caption}
          </Text>
        )}
      </div>

      {reservation.notes && (
        <div>
          <Text variant="label" color="secondary">
            Notes
          </Text>
          <Text variant="body" as="div" className={styles.notesValue}>
            {reservation.notes}
          </Text>
        </div>
      )}

      {failure && (
        <ErrorRetryBanner title="Guest not seated." error={failure.detail} details={failure.raw} />
      )}

      <Stack gap="sm" className={styles.actionsDivider}>
        <Button variant="primary" onClick={onEdit} className={styles.fullWidth} disabled={seating}>
          Edit Reservation
        </Button>
        {canSeat(reservation, table) && (
          <Button
            ref={seatRef}
            variant="secondary"
            onClick={() => void seat()}
            className={styles.fullWidth}
            isLoading={seating}
            loadingText="Seating…"
          >
            Seat Guest
          </Button>
        )}
        {reservation.status !== "CANCELLED" && (
          <Button
            variant="ghost"
            onClick={onCancel}
            className={styles.fullWidth}
            disabled={seating}
          >
            Cancel Reservation
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
