import { useState } from "react";
import {
  Drawer,
  Button,
  Input,
  Select,
  TextArea,
  Stack,
  Divider,
} from "@mattbutlerengineering/rialto";
import type { Reservation, Table, UpdateReservationRequest } from "@mbe/types";
import { GuestCard } from "../crm/GuestCard.js";
import styles from "./EditReservationDrawer.module.css";

interface EditReservationDrawerProps {
  reservation: Reservation;
  tables: Table[];
  onSave: (id: string, data: UpdateReservationRequest) => Promise<void>;
  onClose: () => void;
}

function toTimeInputValue(isoString: string): string {
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function EditReservationDrawer({
  reservation,
  tables,
  onSave,
  onClose,
}: EditReservationDrawerProps) {
  const [startTime, setStartTime] = useState(() => toTimeInputValue(reservation.startTime));
  const [endTime, setEndTime] = useState(() => toTimeInputValue(reservation.endTime));
  const [partySize, setPartySize] = useState(String(reservation.partySize));
  const [tableId, setTableId] = useState(reservation.tableId);
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTables = tables.filter((t) => t.isActive);
  const tableOptions = activeTables.map((t) => ({
    value: t.id,
    label: `${t.name} (cap. ${t.capacity})`,
  }));

  const handleSave = async () => {
    const parsedPartySize = parseInt(partySize, 10);
    if (isNaN(parsedPartySize) || parsedPartySize < 1) {
      setError("Party size must be a positive number.");
      return;
    }
    if (!startTime || !endTime) {
      setError("Start and end times are required.");
      return;
    }
    if (startTime >= endTime) {
      setError("End time must be after start time.");
      return;
    }

    const date = reservation.date.split("T")[0];
    const data: UpdateReservationRequest = {
      startTime: `${date}T${startTime}:00`,
      endTime: `${date}T${endTime}:00`,
      partySize: parsedPartySize,
      tableId,
      notes: notes.trim() || undefined,
    };

    setIsLoading(true);
    setError(null);
    try {
      await onSave(reservation.id, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
      setIsLoading(false);
    }
  };

  return (
    <Drawer open={true} onClose={onClose} title="Edit Reservation" size="default">
      <div data-testid="edit-reservation-drawer">
        <Stack gap="lg" style={{ padding: "var(--rialto-space-md)" }}>
          {reservation.guestId && (
            <>
              <GuestCard guestId={reservation.guestId} />
              <Divider />
            </>
          )}

          {error && <div className={styles.errorBanner}>{error}</div>}

          <Stack gap="md">
            <div className={styles.fieldRow}>
              <div style={{ flex: 1 }}>
                <Input
                  label="Start Time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  label="End Time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <Input
              label="Party Size"
              type="number"
              value={partySize}
              min={1}
              onChange={(e) => setPartySize(e.target.value)}
              disabled={isLoading}
            />

            <Select
              label="Assign Table"
              value={tableId}
              onChange={setTableId}
              disabled={isLoading}
              options={tableOptions}
            />

            <TextArea
              label="Notes"
              value={notes}
              rows={4}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLoading}
            />
          </Stack>

          <div className={styles.drawerActions}>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
              className={styles.fullWidth}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              isLoading={isLoading}
              loadingText="Saving…"
              className={styles.fullWidth}
            >
              Save Changes
            </Button>
          </div>
        </Stack>
      </div>
    </Drawer>
  );
}
