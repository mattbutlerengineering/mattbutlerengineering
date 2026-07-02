import { useState, useCallback } from "react";
import { Button, Input, Alert, Text, Heading } from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import { formatLongDate } from "../../utils/format.js";
import type { BookingWidgetApiClient } from "./PaymentStep.js";
import styles from "./WaitlistJoinView.module.css";

export interface WaitlistJoinedResult {
  position: number;
  estimatedWaitMinutes: number;
}

export interface WaitlistJoinViewProps {
  /** Date-only string (YYYY-MM-DD) the guest searched. No time slot is known on the waitlist path. */
  requestedDate: string;
  partySize: number;
  estimatedWaitMinutes: number;
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
        setPhoneError("Please enter a valid phone number.");
        return;
      }

      setIsLoading(true);
      try {
        const result = await api.waitlist.join(venueSlug, {
          venueId,
          partySize,
          guestName: name.trim(),
          guestPhone: phone.trim(),
        });
        onJoined(result);
      } catch (err) {
        const message =
          err instanceof ApiClientError
            ? err.problemDetails.detail
            : err instanceof Error
              ? err.message
              : "Failed to join waitlist.";
        setSubmitError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [name, phone, venueId, venueSlug, partySize, api, onJoined]
  );

  const formattedDate = formatLongDate(requestedDate);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" onClick={onBack} type="button">
          &larr; Back
        </Button>
      </div>

      <div className={styles.noAvailability}>
        <Heading className={styles.noAvailabilityHeading}>No tables available</Heading>
        <Text className={styles.noAvailabilityDetail}>
          No tables available on {formattedDate} for {partySize}{" "}
          {partySize === 1 ? "guest" : "guests"}.
        </Text>
        <Text className={styles.waitEstimate}>Estimated wait: ~{estimatedWaitMinutes} min</Text>
      </div>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      <form noValidate onSubmit={handleSubmit} className={styles.form}>
        <Text className={styles.formHeading}>Join the waitlist?</Text>

        <Input
          label="Name"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          placeholder="Your name"
        />

        <Input
          label="Phone"
          type="tel"
          value={phone}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setPhone(e.target.value);
            setPhoneError(null);
          }}
          placeholder="+1 (555) 123-4567"
          error={Boolean(phoneError)}
          hint={phoneError ?? "Required for SMS notifications when your table is ready."}
        />

        <Button variant="primary" type="submit" disabled={!isFormValid || isLoading}>
          {isLoading ? "Joining..." : "Join Waitlist"}
        </Button>
      </form>
    </div>
  );
}
