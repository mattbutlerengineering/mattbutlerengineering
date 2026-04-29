import { useState, useCallback } from "react";
import { Button, Input, Select, Stack, Text } from "@mattbutlerengineering/rialto";
import type { Table } from "@mbe/types";
import styles from "./WalkInDialog.module.css";

interface WalkInDialogProps {
  tables: Table[];
  venueId: string;
  onConfirm: (data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
  }) => Promise<void>;
  onClose: () => void;
}

const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function findBestTable(tables: Table[], partySize: number): string {
  const eligible = tables
    .filter((t) => t.status === "AVAILABLE" && t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity);
  return eligible[0]?.id ?? "";
}

export function WalkInDialog({ tables, venueId, onConfirm, onClose }: WalkInDialogProps) {
  const [partySize, setPartySize] = useState(2);
  const [tableId, setTableId] = useState<string>(() => findBestTable(tables, 2));
  const [guestName, setGuestName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTables = tables
    .filter((t) => t.status === "AVAILABLE" && t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity);

  const handlePartySizeChange = useCallback(
    (size: number) => {
      setPartySize(size);
      setTableId(findBestTable(tables, size));
    },
    [tables]
  );

  const handleConfirm = async () => {
    if (!tableId) {
      setError("Please select a table.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onConfirm({
        partySize,
        tableId,
        venueId,
        guestName: guestName.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seat walk-in.");
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="walkin-dialog-title">
      <div className={styles.dialog}>
        <Stack gap="lg">
          <div className={styles.header}>
            <Text variant="display" id="walkin-dialog-title">
              Seat Walk-In
            </Text>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <Stack gap="md">
            <div>
              <Text variant="label" color="secondary" style={{ marginBottom: "var(--rialto-space-xs)" }}>
                Party Size
              </Text>
              <div className={styles.partySizeRow}>
                {PARTY_SIZE_OPTIONS.map((size) => (
                  <Button
                    key={size}
                    variant={partySize === size ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => handlePartySizeChange(size)}
                    disabled={isLoading}
                    aria-pressed={partySize === size}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            {availableTables.length === 0 ? (
              <Text color="secondary">
                No available tables for a party of {partySize}.
              </Text>
            ) : (
              <Select
                label="Table"
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                disabled={isLoading}
              >
                {availableTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (seats {t.capacity})
                  </option>
                ))}
              </Select>
            )}

            <Input
              label="Guest Name (optional)"
              type="text"
              value={guestName}
              placeholder="e.g. Smith"
              onChange={(e) => setGuestName(e.target.value)}
              disabled={isLoading}
            />
          </Stack>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              isLoading={isLoading}
              disabled={availableTables.length === 0}
              loadingText="Seating…"
            >
              Seat Now
            </Button>
          </div>
        </Stack>
      </div>
    </div>
  );
}
