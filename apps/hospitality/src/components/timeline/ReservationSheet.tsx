import { useId, useState } from "react";
import { Badge, Button, Drawer, Stack, Tag, Text } from "@mattbutlerengineering/rialto";
import type { Reservation, Table } from "@mbe/types";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { GuestCard } from "../crm/GuestCard.js";
import { getSegmentLabel, getSegmentVariant, isAllergyTag } from "../crm/guest-signals.js";
import { useGuest } from "../../hooks/useGuests.js";
import { formatTime } from "../../utils/format.js";
import {
  canSeat,
  findReservationTable,
  occupiedCaption,
  statusWord,
  useSeatGuest,
} from "./seat-guest.js";
import styles from "./ReservationSheet.module.css";

export interface ReservationSheetProps {
  reservation: Reservation;
  /** The authoritative table list — the reservation's own `table` snapshot may be stale. */
  tables: Table[];
  /** Computed by the page from `seatedReservationIds` (ux Decision a). */
  seated: boolean;
  open: boolean;
  onClose: () => void;
  /** Rejects on failure — the sheet owns showing it (architecture § Dialog contracts). */
  onSeat: () => Promise<void>;
  onEdit: () => void;
  onCancel: () => void;
}

/**
 * The phone's bottom sheet (ux.md Screen 4): the summary row, the guest's signals, and the actions,
 * at compact height; More ▾ grows it to the default height and reveals the `GuestCard`, contact
 * details and notes. The height change is a class swap — no transition — so the sheet never
 * animates under a thumb.
 */
export function ReservationSheet({
  reservation,
  tables,
  seated,
  open,
  onClose,
  onSeat,
  onEdit,
  onCancel,
}: ReservationSheetProps) {
  // Keyed by reservation so a fresh selection opens compact again without an effect.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === reservation.id;
  const detailId = useId();

  const table = findReservationTable(reservation, tables);
  const caption = occupiedCaption(reservation, table, seated);
  const { seating, failure, seatRef, seat } = useSeatGuest(onSeat);
  const { data: guest } = useGuest(reservation.guestId);

  const segmentLabel = guest ? getSegmentLabel(guest.visitCount, guest.tags) : null;
  const allergies = (guest?.dietaryRestrictions ?? []).filter(isAllergyTag);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="bottom"
      size={expanded ? "default" : "compact"}
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
            {formatTime(reservation.startTime)}
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
          <Button
            variant="ghost"
            onClick={() => setExpandedFor(expanded ? null : reservation.id)}
            aria-expanded={expanded}
            aria-controls={detailId}
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
            {reservation.notes && (
              <div>
                <Text variant="label" color="secondary">
                  Notes
                </Text>
                <Text variant="body" as="div">
                  {reservation.notes}
                </Text>
              </div>
            )}
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}
