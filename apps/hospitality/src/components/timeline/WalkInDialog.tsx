import { useState, useCallback, useEffect, useId, useRef } from "react";
import { useForm } from "react-hook-form";
import { Button, Input, Select, Stack, Text } from "@mattbutlerengineering/rialto";
import { useEscapeKey, useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import type { Table } from "@mbe/types";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { useFocusAfter } from "../../hooks/useFocusAfter.js";
import { describeApiError, type ApiErrorDescription } from "../../lib/describe-api-error.js";
import styles from "./WalkInDialog.module.css";

interface WalkInDialogProps {
  tables: Table[];
  venueId: string;
  /** Rejects on failure — the dialog owns showing it (architecture § Dialog contracts). */
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

/**
 * Seat a walk-up in under five taps (ux.md Screen 3). The dialog owns its failure and nothing
 * else: a rejected `onConfirm` becomes an `ErrorRetryBanner` above the actions, the button returns
 * to rest, the values stay, and focus lands where the retry is — Seat now, or the Table control
 * when the server says the form is the problem. Focus return on close is the page's
 * (`useFocusAfter`, captured at event time), so there is no restore code here.
 */
export function WalkInDialog({ tables, venueId, onConfirm, onClose }: WalkInDialogProps) {
  const [partySize, setPartySize] = useState(2);
  const [tableId, setTableId] = useState<string>(() => findBestTable(tables, 2));
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const pressedRef = useRef<HTMLButtonElement>(null);
  const tableFieldRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const noTableCaptionId = useId();
  const { focusAfter } = useFocusAfter();

  useFocusTrap(panelRef, true);
  // Declared after the trap so it runs after it: initial focus is the pressed party-size control,
  // not the trap's first focusable. StrictMode re-runs both effects in the same order.
  useEffect(() => {
    pressedRef.current?.focus();
  }, []);
  useEscapeKey(onClose, true);

  const { register, handleSubmit } = useForm<WalkInFormData>({
    defaultValues: { guestName: "" },
  });

  const availableTables = tables
    .filter((t) => t.status === "AVAILABLE" && t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity);
  const noTableFits = availableTables.length === 0;

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
    // Invariant: `tableId` is empty exactly when no table fits, and Seat now is disabled then.
    if (!tableId) return;

    setIsLoading(true);
    setFailure(null);
    try {
      await onConfirm({
        partySize,
        tableId,
        venueId,
        guestName: data.guestName.trim() || undefined,
      });
    } catch (err) {
      const description = describeApiError(err);
      setFailure(description);
      // Retry is the same button. When the server says the form is the problem (409/422),
      // the Table control is where the Host edits.
      const tableControl =
        description.recovery === "edit"
          ? tableFieldRef.current?.querySelector<HTMLElement>('[role="combobox"]')
          : null;
      const element = tableControl ?? submitRef.current;
      if (element) focusAfter({ kind: "element", element });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    // Escape is handled globally via useEscapeKey; this backdrop click is a
    // pointer-only affordance equivalent to the Cancel button already in the dialog.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkin-dialog-title"
      >
        {/* Bound at event time, not render time: onFormSubmit reads refs, which the React
            Compiler only allows from a handler (react-hooks/refs). */}
        <form noValidate onSubmit={(e) => handleSubmit(onFormSubmit)(e)}>
          <Stack gap="lg">
            <div className={styles.header}>
              <Text variant="display" id="walkin-dialog-title">
                Seat walk-in
              </Text>
            </div>

            <Stack gap="md">
              <div>
                <Text
                  variant="label"
                  color="secondary"
                  id="walkin-party-size-label"
                  style={{ marginBottom: "var(--rialto-space-xs)" }}
                >
                  Party size
                </Text>
                <div
                  className={styles.partySizeRow}
                  role="group"
                  aria-labelledby="walkin-party-size-label"
                >
                  {PARTY_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={size}
                      ref={partySize === size ? pressedRef : undefined}
                      variant={partySize === size ? "primary" : "secondary"}
                      size="md"
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

              {noTableFits ? (
                <Text variant="caption" color="secondary" id={noTableCaptionId}>
                  Nothing free for a party of {partySize} right now. Try a smaller party, or mark a
                  table Available.
                </Text>
              ) : (
                <Select
                  ref={tableFieldRef}
                  label="Table"
                  value={tableId}
                  onChange={setTableId}
                  disabled={isLoading}
                  options={tableOptions}
                />
              )}

              <Input
                label="Guest name (optional)"
                type="text"
                placeholder="e.g. Smith"
                disabled={isLoading}
                {...register("guestName")}
              />
            </Stack>

            {failure && (
              <ErrorRetryBanner
                title="Walk-in not seated."
                error={failure.detail}
                details={failure.raw}
              />
            )}

            <div className={styles.actions}>
              <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                ref={submitRef}
                variant="primary"
                type="submit"
                isLoading={isLoading}
                disabled={noTableFits}
                aria-describedby={noTableFits ? noTableCaptionId : undefined}
                loadingText="Seating…"
              >
                Seat now
              </Button>
            </div>
          </Stack>
        </form>
      </div>
    </div>
  );
}
