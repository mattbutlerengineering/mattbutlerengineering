import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button, Input, Alert, Text } from "@mattbutlerengineering/rialto";
import type { Deposit } from "@mbe/types";
import { useCreateDeposit } from "../../hooks/useDeposits.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import {
  currencyMinorUnits,
  currencySymbol,
  formatCurrencyFromCents,
  majorToMinorUnits,
} from "../../utils/format.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import styles from "./StaffDepositSection.module.css";

interface StaffDepositSectionProps {
  reservationId: string;
  existingDeposit?: Deposit | null;
  /** True while the `GET /api/v1/deposits?reservationId=` lookup is in flight. */
  isLoading?: boolean;
  /** A failure from that same lookup — distinct from the create-deposit form's own `error` state. */
  fetchError?: unknown;
}

const DEPOSIT_STATUS_KEYS = {
  pending: "timeline.deposit.statuses.pending",
  held: "timeline.deposit.statuses.held",
  applied: "timeline.deposit.statuses.applied",
  refunded: "timeline.deposit.statuses.refunded",
  forfeited: "timeline.deposit.statuses.forfeited",
  partial_refunded: "timeline.deposit.statuses.partialRefunded",
  uncollectable: "timeline.deposit.statuses.uncollectable",
} as const;

function depositStatusLabel(status: string, t: TFunction): string {
  return status in DEPOSIT_STATUS_KEYS
    ? t(DEPOSIT_STATUS_KEYS[status as keyof typeof DEPOSIT_STATUS_KEYS])
    : status;
}

export function StaffDepositSection({
  reservationId,
  existingDeposit,
  isLoading,
  fetchError,
}: StaffDepositSectionProps) {
  const { t } = useTranslation();
  const createDeposit = useCreateDeposit();
  const fmt = useVenueFormat();
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const isCreating = createDeposit.isPending;

  // Every hook must run before any early return below (rules-of-hooks) — the
  // lookup-state branches short-circuit rendering, not hook order.
  const handleCollect = useCallback(async () => {
    const amountDollars = parseFloat(amountInput);
    if (isNaN(amountDollars) || amountDollars <= 0) {
      setError(t("timeline.deposit.invalidAmount"));
      return;
    }
    const amountCents = majorToMinorUnits(amountDollars, fmt.currency);

    setError(null);

    try {
      await createDeposit.mutateAsync({
        reservationId,
        amountCents,
        currency: fmt.currency.toLowerCase(),
      });
      setShowForm(false);
    } catch (err) {
      setError(describeApiError(err).detail);
    }
  }, [amountInput, reservationId, createDeposit, fmt.currency, t]);

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
          {t("timeline.deposit.title")}
        </Text>
        <div className={styles.statusRow}>
          <Text variant="caption" color="secondary">
            {t("timeline.deposit.statusLine", {
              amount: formatCurrencyFromCents(
                existingDeposit.amountCents,
                existingDeposit.currency,
                fmt.locale
              ),
              status: depositStatusLabel(existingDeposit.status, t),
            })}
          </Text>
        </div>
        {/* A refund issued in the Stripe dashboard after our own capture is
            reconciled onto the row without changing its status (#5725 item 2). */}
        {existingDeposit.postCaptureRefundCents != null &&
          existingDeposit.postCaptureRefundCents > 0 && (
            <Text variant="caption" color="secondary">
              {t("timeline.deposit.refundedVia", {
                amount: formatCurrencyFromCents(
                  existingDeposit.postCaptureRefundCents,
                  existingDeposit.currency,
                  fmt.locale
                ),
              })}
            </Text>
          )}
      </div>
    );
  }

  if (showForm) {
    return (
      <div className={styles.section}>
        <Text variant="label" as="h4">
          {t("timeline.deposit.collectTitle")}
        </Text>
        {error && <Alert variant="error">{error}</Alert>}
        <div className={styles.formRow}>
          <Input
            label={t("timeline.deposit.amountLabel", {
              symbol: currencySymbol(fmt.currency, fmt.locale),
            })}
            type="number"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder={(25).toFixed(currencyMinorUnits(fmt.currency))}
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
            {t("timeline.deposit.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCollect}
            disabled={isCreating || !amountInput}
          >
            {isCreating ? t("timeline.deposit.saving") : t("timeline.deposit.create")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <Button variant="ghost" size="sm" onClick={() => setShowForm(true)}>
        {t("timeline.deposit.collect")}
      </Button>
    </div>
  );
}
