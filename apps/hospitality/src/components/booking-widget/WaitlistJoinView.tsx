import { useState, useCallback } from "react";
import { Button, Input, Alert, Text, Heading } from "@mattbutlerengineering/rialto";
import { describeApiError } from "../../lib/describe-api-error.js";
import { useTranslation } from "react-i18next";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import type { BookingWidgetApiClient } from "./PaymentStep.js";
import styles from "./WaitlistJoinView.module.css";

export interface WaitlistJoinedResult {
  statusToken: string;
  position: number;
  estimatedWaitMinutes: number | null;
}

export interface WaitlistJoinViewProps {
  /** Date-only string (YYYY-MM-DD) the guest searched. No time slot is known on the waitlist path. */
  requestedDate: string;
  partySize: number;
  /** Server-supplied estimate; omitted when none is known (never invent one). */
  estimatedWaitMinutes?: number;
  venueSlug: string;
  venueId: string;
  api: BookingWidgetApiClient;
  onJoined: (result: WaitlistJoinedResult) => void;
  onBack: () => void;
}

/** Basic E.164 phone validation — rejects obviously invalid inputs */
function isValidPhone(value: string): boolean {
  const stripped = value.replace(/[\s\-().+]/g, "");
  return /^\d{10,15}$/.test(stripped);
}

export function WaitlistJoinView({
  requestedDate,
  partySize,
  estimatedWaitMinutes,
  venueSlug,
  venueId,
  api,
  onJoined,
  onBack,
}: WaitlistJoinViewProps) {
  const { t } = useTranslation();
  const format = useVenueFormat({ ianaTimezone: "", currencyCode: "USD" });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isFormValid = name.trim().length > 0 && phone.trim().length > 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setPhoneError(null);
      setSubmitError(null);

      if (!isValidPhone(phone)) {
        setPhoneError(t("bookingWidget.waitlist.invalidPhone"));
        return;
      }

      setIsLoading(true);
      try {
        const result = await api.publicVenue.joinWaitlist(venueSlug, {
          venueId,
          partySize,
          guestName: name.trim(),
          guestPhone: phone.trim(),
        });
        onJoined(result);
      } catch (err) {
        setSubmitError(describeApiError(err).detail);
      } finally {
        setIsLoading(false);
      }
    },
    [name, phone, venueId, venueSlug, partySize, api, onJoined, t]
  );

  const formattedDate = format.formatLongDate(requestedDate);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" onClick={onBack} type="button">
          {t("bookingWidget.back")}
        </Button>
      </div>

      <div className={styles.noAvailability}>
        <Heading className={styles.noAvailabilityHeading}>
          {t("bookingWidget.waitlist.noTablesHeading")}
        </Heading>
        <Text className={styles.noAvailabilityDetail}>
          {t("bookingWidget.waitlist.noTablesDetail", { date: formattedDate, count: partySize })}
        </Text>
        {estimatedWaitMinutes != null && (
          <Text className={styles.waitEstimate}>
            {t("bookingWidget.estimatedWait", { minutes: estimatedWaitMinutes })}
          </Text>
        )}
      </div>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      <form noValidate onSubmit={handleSubmit} className={styles.form}>
        <Text className={styles.formHeading}>{t("bookingWidget.waitlist.joinPrompt")}</Text>

        <Input
          label={t("bookingWidget.waitlist.name")}
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          placeholder={t("bookingWidget.waitlist.namePlaceholder")}
        />

        <Input
          label={t("bookingWidget.waitlist.phone")}
          type="tel"
          value={phone}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setPhone(e.target.value);
            setPhoneError(null);
          }}
          placeholder="+1 (555) 123-4567"
          error={Boolean(phoneError)}
          hint={phoneError ?? t("bookingWidget.waitlist.phoneHint")}
        />

        <Button variant="primary" type="submit" disabled={!isFormValid || isLoading}>
          {isLoading ? t("bookingWidget.waitlist.joining") : t("bookingWidget.waitlist.join")}
        </Button>
      </form>
    </div>
  );
}
