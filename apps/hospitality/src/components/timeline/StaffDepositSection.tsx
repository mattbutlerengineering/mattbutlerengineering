import { useState, useCallback } from "react";
import { Button, Input, Alert, Text } from "@mattbutlerengineering/rialto";
import { createApiClient } from "@mbe/api-client";
import type { Deposit } from "@mbe/types";
import styles from "./StaffDepositSection.module.css";

interface StaffDepositSectionProps {
  reservationId: string;
  existingDeposit?: Deposit | null;
  apiBaseUrl?: string;
  getAccessToken: () => string | null | Promise<string | null>;
}

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function depositStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    held: "Authorized",
    applied: "Charged",
    refunded: "Refunded",
    forfeited: "Forfeited",
  };
  return labels[status] ?? status;
}

export function StaffDepositSection({
  reservationId,
  existingDeposit,
  apiBaseUrl = "",
  getAccessToken,
}: StaffDepositSectionProps) {
  const [amountInput, setAmountInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(existingDeposit ?? null);
  const [showForm, setShowForm] = useState(false);

  const handleCollect = useCallback(async () => {
    const amountDollars = parseFloat(amountInput);
    if (isNaN(amountDollars) || amountDollars <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const amountCents = Math.round(amountDollars * 100);

    setIsCreating(true);
    setError(null);

    try {
      const api = createApiClient({ baseUrl: apiBaseUrl, getAccessToken });
      const created = await api.client.postOne<Deposit>("/api/v1/deposits", {
        reservationId,
        amountCents,
        currency: "usd",
      });
      setDeposit(created);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deposit.");
    } finally {
      setIsCreating(false);
    }
  }, [amountInput, reservationId, apiBaseUrl, getAccessToken]);

  if (deposit) {
    return (
      <div className={styles.section}>
        <Text variant="label" as="h4">
          Deposit
        </Text>
        <div className={styles.statusRow}>
          <Text variant="caption" color="secondary">
            {formatAmount(deposit.amountCents, deposit.currency)} —{" "}
            {depositStatusLabel(deposit.status)}
          </Text>
        </div>
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
