import { useState, useEffect, useCallback, useReducer } from "react";
import { useForm } from "react-hook-form";
import type { TimeSlot, ReservationHold } from "@mbe/types";
import { Input, TextArea, Button, Alert, Text, Banner, Badge } from "@mattbutlerengineering/rialto";
import { formatLongDate, formatTime } from "../../utils/format.js";
import { useGuestRecognition } from "../../hooks/useGuestRecognition.js";
import type { BookingWidgetApiClient } from "./PaymentStep.js";
import styles from "./GuestDetailsForm.module.css";

export interface GuestDetails {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

export interface GuestDetailsFormProps {
  slot: TimeSlot;
  hold: ReservationHold | null;
  date: string;
  partySize: number;
  isLoading: boolean;
  error: string | null;
  onSubmit: (details: GuestDetails) => void;
  onBack: () => void;
  venueSlug?: string;
  api: BookingWidgetApiClient;
  /**
   * Seeds the form fields on mount — e.g. what the guest already typed
   * before a hold expired and bounced them back to the time-slot step.
   * Omit for a blank form.
   */
  initialDetails?: GuestDetails;
  /**
   * Fired on every field edit so the caller can lift the details into
   * longer-lived state (survives this component unmounting on hold expiry).
   */
  onDetailsChange?: (details: GuestDetails) => void;
}

function computeHoldTimeRemaining(hold: ReservationHold): string {
  const expiresAt = new Date(hold.expiresAt);
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs <= 0) return "Expired";
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
}

export function GuestDetailsForm({
  slot,
  hold,
  date,
  partySize,
  isLoading,
  error,
  onSubmit,
  onBack,
  venueSlug,
  api,
  initialDetails,
  onDetailsChange,
}: GuestDetailsFormProps) {
  const [nameInput, setNameInput] = useState(initialDetails?.name ?? "");
  const [email, setEmail] = useState(initialDetails?.email ?? "");
  const [phoneInput, setPhoneInput] = useState(initialDetails?.phone ?? "");
  const [notes, setNotes] = useState(initialDetails?.notes ?? "");
  const [nameEdited, setNameEdited] = useState(Boolean(initialDetails?.name));
  // Force re-render every second so the hold countdown stays current
  const [, forceRender] = useReducer((c: number) => c + 1, 0);

  // useForm for noValidate pattern; handleSubmit not used because
  // recognition auto-fill requires render-time derivation of name
  useForm<GuestDetails>();

  const { result: recognition, recognize } = useGuestRecognition({
    venueSlug,
    api,
  });

  useEffect(() => {
    if (!hold) return;
    const interval = setInterval(forceRender, 1000);
    return () => clearInterval(interval);
  }, [hold]);

  // Render-time derivation: use recognition data only until user edits the field
  const name = nameEdited || !recognition?.firstName ? nameInput : recognition.firstName;
  const phone = phoneInput;

  const holdTimeRemaining = hold ? computeHoldTimeRemaining(hold) : null;

  // Lift the current fields up to the caller (`useBookingFlow`'s reducer
  // state) on every edit, so they survive this form unmounting on hold
  // expiry. `patch` overrides the field that just changed; the others come
  // from the latest render's values.
  const notifyDetailsChange = useCallback(
    (patch: Partial<GuestDetails>) => {
      onDetailsChange?.({ name, email, phone, notes, ...patch });
    },
    [name, email, phone, notes, onDetailsChange]
  );

  const formattedDate = formatLongDate(date);
  const formattedTime = formatTime(slot.time);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit({ name, email, phone, notes });
    },
    [name, email, phone, notes, onSubmit]
  );

  const handleEmailBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      recognize(e.target.value);
    },
    [recognize]
  );

  const isValid = name.trim().length > 0 && (email.trim().length > 0 || phone.trim().length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" onClick={onBack} type="button">
          &larr; Back
        </Button>
        {hold && holdTimeRemaining && (
          <div className={styles.holdTimer} aria-live="polite">
            Hold expires in: {holdTimeRemaining}
          </div>
        )}
      </div>

      {/* Reservation summary */}
      <div className={styles.summaryCard}>
        <Text className={styles.summaryTitle}>Reservation Details</Text>
        <div className={styles.summaryDetails}>
          <Text>{formattedDate}</Text>
          <Text>{formattedTime}</Text>
          <Text>
            {partySize} {partySize === 1 ? "guest" : "guests"}
          </Text>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {recognition && (
        <Banner variant="accent">
          Welcome back, {recognition.firstName} &mdash; your {ordinalSuffix(recognition.visitCount)}{" "}
          visit!
          {recognition.hasPreferences && (
            <Badge variant="success" size="sm">
              Preferences on file
            </Badge>
          )}
        </Banner>
      )}

      <form noValidate onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Name"
          value={name}
          onChange={(e) => {
            setNameInput(e.target.value);
            setNameEdited(true);
            notifyDetailsChange({ name: e.target.value });
          }}
          placeholder="John Smith"
        />

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            notifyDetailsChange({ email: e.target.value });
          }}
          onBlur={handleEmailBlur}
          placeholder="john@example.com"
        />

        <Input
          label="Phone"
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhoneInput(e.target.value);
            notifyDetailsChange({ phone: e.target.value });
          }}
          placeholder="(555) 123-4567"
        />

        <Text className={styles.hint}>Please provide either email or phone for confirmation.</Text>

        <TextArea
          label="Special Requests"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            notifyDetailsChange({ notes: e.target.value });
          }}
          rows={3}
          placeholder="Allergies, celebrations, seating preferences..."
        />

        <Button variant="primary" type="submit" disabled={!isValid || isLoading}>
          {isLoading ? "Confirming..." : "Complete Reservation"}
        </Button>
      </form>
    </div>
  );
}
