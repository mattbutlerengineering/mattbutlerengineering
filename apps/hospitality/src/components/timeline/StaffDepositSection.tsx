import { useState, useCallback } from "react";
import { Button, Input, Alert, Text } from "@mattbutlerengineering/rialto";
import type { Deposit } from "@mbe/types";
import { useCreateDeposit } from "../../hooks/useDeposits.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { formatCurrencyFromCents } from "../../utils/format.js";
import styles from "./StaffDepositSection.module.css";

interface StaffDepositSectionProps {
  reservationId: string;
  existingDeposit?: Deposit | null;
  /** True while the `GET /api/v1/deposits?reservationId=` lookup is in flight. */
  isLoading?: boolean;
  /** A failure from that same lookup — distinct from the create-deposit form's own `error` state. */
  fetchError?: unknown;
}

function depositStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    held: "Authorized",
    applied: "Charged",
    refunded: "Refunded",
    forfeited: "Forfeited",
    partial_refunded: "Partially Refunded",
    uncollectable: "Uncollectable",
  };
  return labels[status] ?? status;
}

export function StaffDepositSection({
  reservationId,
  existingDeposit,
  isLoading,
  fetchError,
}: StaffDepositSectionProps) {
  const createDeposit = useCreateDeposit();
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const isCreating = createDeposit.isPending;

  // Every hook must run before any early return below (rules-of-hooks) — the
  // lookup-state branches short-circuit rendering, not hook order.
  const handleCollect = useCallback(async () => {
    const amountDollars = parseFloat(amountInput);
    if (isNaN(amountDollars) || amountDollars <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const amountCents = Math.round(amountDollars * 100);

    setError(null);

    try {
      await createDeposit.mutateAsync({
        reservationId,
        amountCents,
        currency: "usd",
      });
      setShowForm(false);
    } catch (err) {
      setError(describeApiError(err).detail);
    }
  }, [amountInput, reservationId, createDeposit]);

  // The lookup owns this section's visibility before anything else does: a
  // stale fetchError from a prior render must never outrank a fresh
  // isLoading, and neither may fall through to the "+ Collect Deposit"
  // prompt — that would offer to create a second deposit while the read that
  // would have found the first one is still in flight or failed (#5725 LOW-4).
  if (isLoading) {
    return null;
  }

  if (fetchError) {
    const described = describeApiError(fetchError);
    if (described.category === "forbidden") {
      return null;
    }
    return (
      <div className={styles.section}>
        <Alert variant="error">{described.detail}</Alert>
      </div>
    );
  }

  if (existingDeposit) {
    return (
      <div className={styles.section}>
        <Text variant="label" as="h4">
          Deposit
        </Text>
        <div className={styles.statusRow}>
          <Text variant="caption" color="secondary">
            {formatCurrencyFromCents(existingDeposit.amountCents, existingDeposit.currency)} —{" "}
            {depositStatusLabel(existingDeposit.status)}
          </Text>
        </div>
        {/* A refund issued in the Stripe dashboard after our own capture is
            reconciled onto the row without changing its status (#5725 item 2). */}
        {existingDeposit.postCaptureRefundCents != null &&
          existingDeposit.postCaptureRefundCents > 0 && (
            <Text variant="caption" color="secondary">
              Refunded{" "}
              {formatCurrencyFromCents(
                existingDeposit.postCaptureRefundCents,
                existingDeposit.currency
              )}{" "}
              via Stripe
            </Text>
          )}
      </div>
    );
  }

  if (showForm) {
    return (
      <div className={styles.section}>
        <Text variant="label" as="h4">
          Collect Deposit
        </Text>
        {error && <Alert variant="error">{error}</Alert>}
        <div className={styles.formRow}>
          <Input
            label="Amount ($)"
            type="number"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="25.00"
            disabled={isCreating}
          />
        </div>
        <div className={styles.formActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowForm(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCollect}
            disabled={isCreating || !amountInput}
          >
            {isCreating ? "Saving..." : "Create Deposit"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <Button variant="ghost" size="sm" onClick={() => setShowForm(true)}>
        + Collect Deposit
      </Button>
    </div>
  );
}
