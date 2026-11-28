import { useState, useCallback, useRef } from "react";
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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Errors show only after a submit attempt, then track the fields live.
  const nameError =
    submitAttempted && name.trim().length === 0 ? t("bookingWidget.waitlist.nameRequired") : null;
  const phoneError = !submitAttempted
    ? null
    : phone.trim().length === 0
      ? t("bookingWidget.waitlist.phoneRequired")
      : !isValidPhone(phone)
        ? t("bookingWidget.waitlist.invalidPhone")
        : null;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitAttempted(true);
      setSubmitError(null);

      if (name.trim().length === 0) {
        nameRef.current?.focus();
        return;
      }
      if (!isValidPhone(phone)) {
        phoneRef.current?.focus();
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
        setSubmitError(describeApiError(err, t).detail);
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
        <Heading level={3} size={5} className={styles.noAvailabilityHeading}>
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
          ref={nameRef}
          label={t("bookingWidget.waitlist.name")}
          required
          error={Boolean(nameError)}
          hint={nameError ?? undefined}
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          placeholder={t("bookingWidget.waitlist.namePlaceholder")}
          autoComplete="name"
        />

        <Input
          ref={phoneRef}
          label={t("bookingWidget.waitlist.phone")}
          required
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
          placeholder="+1 (555) 123-4567"
          error={Boolean(phoneError)}
          hint={phoneError ?? t("bookingWidget.waitlist.phoneHint")}
        />

        <Button variant="primary" type="submit" disabled={isLoading}>
          {isLoading ? t("bookingWidget.waitlist.joining") : t("bookingWidget.waitlist.join")}
        </Button>
      </form>
    </div>
  );
}
