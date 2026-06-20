import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
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

interface WalkInFormData {
  guestName: string;
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit } = useForm<WalkInFormData>({
    defaultValues: { guestName: "" },
  });

  const availableTables = tables
    .filter((t) => t.status === "AVAILABLE" && t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity);

  const tableOptions = availableTables.map((t) => ({
    value: t.id,
    label: `${t.name} (seats ${t.capacity})`,
  }));

  const handlePartySizeChange = useCallback(
    (size: number) => {
      setPartySize(size);
      setTableId(findBestTable(tables, size));
    },
    [tables]
  );

  const onFormSubmit = async (data: WalkInFormData) => {
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
        guestName: data.guestName.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seat walk-in.");
      setIsLoading(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkin-dialog-title"
    >
      <div className={styles.dialog}>
        <form noValidate onSubmit={handleSubmit(onFormSubmit)}>
          <Stack gap="lg">
            <div className={styles.header}>
              <Text variant="display" id="walkin-dialog-title">
                Seat Walk-In
              </Text>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <Stack gap="md">
              <div>
                <Text
                  variant="label"
                  color="secondary"
                  style={{ marginBottom: "var(--rialto-space-xs)" }}
                >
                  Party Size
                </Text>
                <div className={styles.partySizeRow}>
                  {PARTY_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={size}
                      variant={partySize === size ? "primary" : "secondary"}
                      size="sm"
                      type="button"
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
                <Text color="secondary">No available tables for a party of {partySize}.</Text>
              ) : (
                <Select
                  label="Table"
                  value={tableId}
                  onChange={setTableId}
                  disabled={isLoading}
                  options={tableOptions}
                />
              )}

              <Input
                label="Guest Name (optional)"
                type="text"
                placeholder="e.g. Smith"
                disabled={isLoading}
                {...register("guestName")}
              />
            </Stack>

            <div className={styles.actions}>
              <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isLoading}
                disabled={availableTables.length === 0}
                loadingText="Seating…"
              >
                Seat Now
              </Button>
            </div>
          </Stack>
        </form>
      </div>
    </div>
  );
}
