import { useId } from "react";
import { Badge, Button, Drawer, Stack, Tag, Text } from "@mattbutlerengineering/rialto";
import type { Reservation, Table } from "@mbe/types";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { GuestCard } from "../crm/GuestCard.js";
import { getSegmentLabel, getSegmentVariant, isAllergyTag } from "../crm/guest-signals.js";
import { useGuest } from "../../hooks/useGuests.js";
import { useDepositByReservation } from "../../hooks/useDeposits.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { findReservationTable, occupiedCaption, statusWord, useSeatGuest } from "./seat-guest.js";
import { canSeat } from "../../utils/seating.js";
import { StaffDepositSection } from "./StaffDepositSection.js";
import { SpecialRequestsTicket } from "./SpecialRequestsTicket.js";
import { reservationSheetSize } from "./sheet-size.js";
import styles from "./ReservationSheet.module.css";

export interface ReservationSheetProps {
  reservation: Reservation;
  /** The authoritative table list — the reservation's own `table` snapshot may be stale. */
  tables: Table[];
  /** Computed by the page from `seatedReservationIds` (ux Decision a). */
  seated: boolean;
  /** The page's clock — lets `occupiedCaption` tell an overrun party from a different one (#5270). */
  now: Date;
  open: boolean;
  onClose: () => void;
  /** Rejects on failure — the sheet owns showing it (architecture § Dialog contracts). */
  onSeat: () => Promise<void>;
  onEdit: () => void;
  onCancel: () => void;
  /** Opens the Mark No-Show confirmation (only offered for CONFIRMED — the only valid source state). */
  onMarkNoShow: () => void;
  /** Whether More ▾ is open. The page owns it, so the grid's inset can follow the sheet's height. */
  expanded: boolean;
  /** More ▾ was pressed; the owner flips `expanded`. */
  onToggleExpanded: () => void;
}

/**
 * The phone's bottom sheet (ux.md Screen 4): the summary row, the guest's signals, any Special
 * Requests, and the actions, at compact height, or at the default height when there are Special
 * Requests; More ▾ grows it to the default height and reveals the `GuestCard` and contact details.
 * The height change is a class swap — no transition — so the sheet never animates under a thumb.
 */
export function ReservationSheet({
  reservation,
  tables,
  seated,
  now,
  open,
  onClose,
  onSeat,
  onEdit,
  onCancel,
  onMarkNoShow,
  expanded,
  onToggleExpanded,
}: ReservationSheetProps) {
  const fmt = useVenueFormat();
  const detailId = useId();

  const table = findReservationTable(reservation, tables);
  const caption = occupiedCaption(reservation, table, now);
  const { seating, failure, seatRef, seat } = useSeatGuest(onSeat);
  const { data: guest } = useGuest(reservation.guestId);
  const {
    data: deposit,
    isLoading: depositLoading,
    error: depositError,
  } = useDepositByReservation(reservation.id);

  const segmentLabel = guest ? getSegmentLabel(guest.visitCount, guest.tags) : null;
  const allergies = (guest?.dietaryRestrictions ?? []).filter(isAllergyTag);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="bottom"
      size={reservationSheetSize(reservation.notes, expanded)}
      title={reservation.guestName || "Guest"}
    >
      <Stack gap="md">
        <div className={styles.summary}>
          <Text as="span" variant="caption" color="secondary">
            party of {reservation.partySize}
          </Text>
          <Text as="span" variant="caption" color="tertiary" aria-hidden="true">
            ·
          </Text>
          <Text as="span" variant="caption" color="secondary">
            {fmt.formatTime(reservation.startTime)}
          </Text>
          <Text as="span" variant="caption" color="tertiary" aria-hidden="true">
            ·
          </Text>
          {table ? (
            <Text as="span" variant="caption" color="secondary">
              {table.name}
            </Text>
          ) : (
            <>
              <Text as="span" variant="caption" color="secondary" aria-hidden="true">
                —
              </Text>
              <Text as="span" className={styles.visuallyHidden}>
                table unknown
              </Text>
            </>
          )}
          <Text as="span" variant="caption" color="tertiary" aria-hidden="true">
            ·
          </Text>
          <Text as="span" variant="caption" color="primary" className={styles.status}>
            {statusWord(reservation, seated)}
          </Text>
        </div>

        {caption && (
          <Text variant="caption" color="secondary" as="div">
            {caption}
          </Text>
        )}

        {segmentLabel && (
          <Stack direction="row" gap="xs" wrap>
            <Badge variant={getSegmentVariant(segmentLabel)} size="sm">
              {segmentLabel}
            </Badge>
            {allergies.map((restriction) => (
              <Tag key={restriction} variant="error">
                {`Allergy: ${restriction}`}
              </Tag>
            ))}
          </Stack>
        )}

        <SpecialRequestsTicket notes={reservation.notes} />

        {failure && (
          <ErrorRetryBanner
            title="Guest not seated."
            error={failure.detail}
            details={failure.raw}
          />
        )}

        <div className={styles.actions}>
          {canSeat(reservation, table) && (
            <Button
              ref={seatRef}
              variant="secondary"
              onClick={() => void seat()}
              isLoading={seating}
              loadingText="Seating…"
            >
              Seat Guest
            </Button>
          )}
          <Button variant="primary" onClick={onEdit} disabled={seating}>
            Edit reservation
          </Button>
          {reservation.status !== "CANCELLED" && (
            <Button variant="ghost" onClick={onCancel} disabled={seating}>
              Cancel reservation
            </Button>
          )}
          {reservation.status === "CONFIRMED" && (
            <Button variant="ghost" onClick={onMarkNoShow} disabled={seating}>
              Mark No-Show
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls={expanded ? detailId : undefined}
            disabled={seating}
          >
            More{" "}
            <Text as="span" aria-hidden="true">
              ▾
            </Text>
          </Button>
        </div>

        {expanded && (
          <Stack id={detailId} gap="md">
            {reservation.guestId && <GuestCard guestId={reservation.guestId} />}
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
            <StaffDepositSection
              reservationId={reservation.id}
              existingDeposit={deposit ?? null}
              isLoading={depositLoading}
              fetchError={depositError}
            />
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}
