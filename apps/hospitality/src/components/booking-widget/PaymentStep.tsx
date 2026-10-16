import { useState, useCallback } from "react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { ApiClientError, type createApiClient } from "@mbe/api-client";
import { Button, Alert, Text } from "@mattbutlerengineering/rialto";
import type { DepositConfig } from "@mbe/types";
import { quoteDeposit } from "@mbe/cancellation-policy";
import { useTranslation } from "react-i18next";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useDepositCancellationTerms } from "./formatDepositCancellationTerms.js";
import styles from "./PaymentStep.module.css";

export type BookingWidgetApiClient = ReturnType<typeof createApiClient>;

export interface PaymentStepProps {
  api: BookingWidgetApiClient;
  depositConfig: DepositConfig;
  partySize: number;
  reservationId: string;
  venueSlug: string;
  stripePublishableKey: string;
  onSuccess: (paymentIntentId: string) => void;
}

interface CardFormProps {
  api: BookingWidgetApiClient;
  depositConfig: DepositConfig;
  partySize: number;
  reservationId: string;
  venueSlug: string;
  onSuccess: (paymentIntentId: string) => void;
}

function CardForm({
  api,
  depositConfig,
  partySize,
  reservationId,
  venueSlug,
  onSuccess,
}: CardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { t } = useTranslation();
  const amountCents = quoteDeposit(depositConfig, partySize);
  const currency = depositConfig.currency ?? "usd";
  const { formatMoney } = useVenueFormat({ ianaTimezone: "", currencyCode: currency });
  const displayAmount = formatMoney(amountCents);
  const cancellationTerms = useDepositCancellationTerms(depositConfig, partySize);

  const handleSubmit = useCallback(async () => {
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setIsProcessing(true);
    setError(null);

    try {
      // The booking session that confirmed the reservation is the server's
      // proof of ownership for the deposit (#6304).
      const sessionId = api.holds.getSessionId();
      if (!sessionId) {
        setError(t("bookingWidget.payment.sessionExpired"));
        return;
      }

      // Fetch the client secret from our backend
      const paymentIntent = await api.publicVenue.depositIntent(
        venueSlug,
        { reservationId },
        sessionId
      );

      const result = await stripe.confirmCardPayment(paymentIntent.clientSecret, {
        payment_method: { card: cardElement },
      });

      if (result.error) {
        setError(result.error.message ?? t("bookingWidget.payment.failed"));
      } else if (result.paymentIntent) {
        onSuccess(result.paymentIntent.id);
      }
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.problemDetails.detail
          : err instanceof Error
            ? err.message
            : t("bookingWidget.payment.failed");
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [stripe, elements, api, venueSlug, reservationId, onSuccess, t]);

  return (
    <div className={styles.container}>
      <div className={styles.depositSummary}>
        <Text variant="label" as="h3">
          {t("bookingWidget.payment.depositRequired")}
        </Text>
        <div className={styles.amountRow}>
          <Text variant="display" as="p">
            {displayAmount}
          </Text>
          {depositConfig.depositType === "per_person" && (
            <Text variant="caption" color="secondary">
              {t("bookingWidget.payment.perPerson", {
                count: partySize,
                amount: formatMoney(depositConfig.amountCents ?? 0),
              })}
            </Text>
          )}
        </div>
        <Text variant="caption" color="secondary">
          {t("bookingWidget.payment.authorizeNotice", { amount: displayAmount })}
        </Text>
      </div>

      {cancellationTerms && (
        <div className={styles.policyCard}>
          <Text variant="label" as="h4">
            {t("bookingWidget.payment.cancellationPolicy")}
          </Text>
          <Text variant="caption">{cancellationTerms}</Text>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <div className={styles.cardElementWrapper}>
        <Text variant="label" as="label" id="card-details-label">
          {t("bookingWidget.payment.cardDetails")}
        </Text>
        <div className={styles.cardElement} aria-labelledby="card-details-label">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "16px",
                  color: "var(--rialto-text-primary)",
                  "::placeholder": { color: "var(--rialto-text-tertiary)" },
                },
              },
            }}
          />
        </div>
      </div>

      <Button variant="primary" onClick={handleSubmit} disabled={!stripe || isProcessing}>
        {isProcessing
          ? t("bookingWidget.payment.processing")
          : t("bookingWidget.payment.authorize", { amount: displayAmount })}
      </Button>
    </div>
  );
}

export function PaymentStep(props: PaymentStepProps) {
  const [stripePromise] = useState<Promise<Stripe | null>>(() =>
    loadStripe(props.stripePublishableKey)
  );

  return (
    <Elements stripe={stripePromise}>
      <CardForm
        api={props.api}
        depositConfig={props.depositConfig}
        partySize={props.partySize}
        reservationId={props.reservationId}
        venueSlug={props.venueSlug}
        onSuccess={props.onSuccess}
      />
    </Elements>
  );
}
