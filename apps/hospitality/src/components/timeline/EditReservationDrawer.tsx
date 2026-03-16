import { useState } from "react";
import type { Reservation, Table, UpdateReservationRequest } from "@mbe/types";
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
  const [startTime, setStartTime] = useState(toTimeInputValue(reservation.startTime));
  const [endTime, setEndTime] = useState(toTimeInputValue(reservation.endTime));
  const [partySize, setPartySize] = useState(String(reservation.partySize));
  const [tableId, setTableId] = useState(reservation.tableId);
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTables = tables.filter((t) => t.isActive);

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
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-drawer-title"
      >
        <div className={styles.header}>
          <h2 id="edit-drawer-title" className={styles.title}>
            Edit Reservation
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.body}>
          <div className={styles.form}>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="edit-start-time" className={styles.label}>
                  Start Time
                </label>
                <input
                  id="edit-start-time"
                  type="time"
                  className={styles.input}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="edit-end-time" className={styles.label}>
                  End Time
                </label>
                <input
                  id="edit-end-time"
                  type="time"
                  className={styles.input}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="edit-party-size" className={styles.label}>
                Party Size
              </label>
              <input
                id="edit-party-size"
                type="number"
                className={styles.input}
                value={partySize}
                min={1}
                onChange={(e) => setPartySize(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="edit-table" className={styles.label}>
                Table
              </label>
              <select
                id="edit-table"
                className={styles.select}
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                disabled={isLoading}
              >
                {activeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (cap. {t.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="edit-notes" className={styles.label}>
                Notes
              </label>
              <textarea
                id="edit-notes"
                className={styles.textarea}
                value={notes}
                rows={4}
                placeholder="Any special requests or notes…"
                onChange={(e) => setNotes(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}
