import { useState, useEffect, useCallback, useId, useReducer, useRef } from "react";
import { useForm } from "react-hook-form";
import type { TimeSlot, ReservationHold } from "@mbe/types";
import { Input, TextArea, Button, Alert, Text, Banner, Badge } from "@mattbutlerengineering/rialto";
import { useTranslation } from "react-i18next";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useGuestRecognition } from "../../hooks/useGuestRecognition.js";
import type { BookingWidgetApiClient } from "./PaymentStep.js";
import { isValidGuestEmail } from "./guest-email.js";
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
  /** IANA timezone to display the reservation summary time in; falls back to device-local (#4976). */
  venueTimezone?: string;
}

/** "m:ss" left on the hold, or null once it has expired. */
function computeHoldTimeRemaining(hold: ReservationHold): string | null {
  const expiresAt = new Date(hold.expiresAt);
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Time left on a hold at which screen readers hear a single warning. */
const HOLD_WARNING_MS = 2 * 60_000;

/**
 * The hold threshold the guest is past, if any. Only these crossings are
 * announced; the per-second countdown is visual only, so a screen reader does
 * not talk over the form for the whole hold (#9996).
 */
function computeHoldThreshold(hold: ReservationHold): "warning" | "expired" | null {
  const diffMs = new Date(hold.expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "expired";
  if (diffMs <= HOLD_WARNING_MS) return "warning";
  return null;
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
  venueTimezone,
}: GuestDetailsFormProps) {
  const [nameInput, setNameInput] = useState(initialDetails?.name ?? "");
  const [email, setEmail] = useState(initialDetails?.email ?? "");
  const [phoneInput, setPhoneInput] = useState(initialDetails?.phone ?? "");
  const [notes, setNotes] = useState(initialDetails?.notes ?? "");
  const [nameEdited, setNameEdited] = useState(Boolean(initialDetails?.name));
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const emailId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
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

  const { t } = useTranslation();
  const format = useVenueFormat({ ianaTimezone: venueTimezone ?? "", currencyCode: "USD" });
  const holdTimeRemaining = hold
    ? (computeHoldTimeRemaining(hold) ?? t("bookingWidget.details.holdExpired"))
    : null;
  const holdThreshold = hold ? computeHoldThreshold(hold) : null;
  const holdAnnouncement =
    holdThreshold === "expired"
      ? t("bookingWidget.details.holdAnnounceExpired")
      : holdThreshold === "warning"
        ? t("bookingWidget.details.holdAnnounceTwoMinutes")
        : "";

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

  const formattedDate = format.formatLongDate(date);
  const formattedTime = format.formatTime(slot.time);

  // Errors show only after a submit attempt, then track the fields live.
  const nameError = submitAttempted && name.trim().length === 0;
  const contactError = submitAttempted && email.trim().length === 0 && phone.trim().length === 0;
  // A malformed address is flagged once the guest leaves the field (or
  // submits), never mid-keystroke, and clears as soon as it is fixed.
  const emailMalformed = email.trim().length > 0 && !isValidGuestEmail(email);
  const emailFormatError = (emailBlurred || submitAttempted) && emailMalformed;
  const emailHint = contactError
    ? t("bookingWidget.details.contactHint")
    : emailFormatError
      ? t("bookingWidget.details.emailInvalid")
      : undefined;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitAttempted(true);
      if (name.trim().length === 0) {
        nameRef.current?.focus();
        return;
      }
      if ((email.trim().length === 0 && phone.trim().length === 0) || emailMalformed) {
        emailRef.current?.focus();
        return;
      }
      onSubmit({ name, email, phone, notes });
    },
    [name, email, phone, notes, emailMalformed, onSubmit]
  );

  const handleEmailBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setEmailBlurred(true);
      // The server rejects a malformed address, so asking it to recognize one
      // only produces a 400.
      if (isValidGuestEmail(e.target.value)) recognize(e.target.value);
    },
    [recognize]
  );

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" onClick={onBack} type="button">
          {t("bookingWidget.back")}
        </Button>
        {hold && holdTimeRemaining && (
          <div className={styles.holdTimer}>
            {t("bookingWidget.details.holdExpires", { time: holdTimeRemaining })}
          </div>
        )}
      </div>
      {/* Always mounted while a hold exists so its text changes are announced;
          it changes only at the warning and expiry thresholds. */}
      {hold && (
        <div className={styles.holdAnnouncer} role="status" aria-live="polite">
          {holdAnnouncement}
        </div>
      )}

      {/* Reservation summary */}
      <div className={styles.summaryCard}>
        <Text className={styles.summaryTitle}>{t("bookingWidget.details.summaryTitle")}</Text>
        <div className={styles.summaryDetails}>
          <Text>{formattedDate}</Text>
          <Text>{formattedTime}</Text>
          <Text>{t("bookingWidget.guests", { count: partySize })}</Text>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {recognition && (
        <Banner variant="accent">
          {t("bookingWidget.details.welcomeBack", {
            name: recognition.firstName,
            count: recognition.visitCount,
            ordinal: true,
          })}
          {recognition.hasPreferences && (
            <Badge variant="success" size="sm">
              {t("bookingWidget.details.preferencesOnFile")}
            </Badge>
          )}
        </Banner>
      )}

      <form noValidate onSubmit={handleSubmit} className={styles.form}>
        <Input
          ref={nameRef}
          label={t("bookingWidget.details.name")}
          required
          error={nameError}
          hint={nameError ? t("bookingWidget.details.nameRequired") : undefined}
          value={name}
          onChange={(e) => {
            setNameInput(e.target.value);
            setNameEdited(true);
            notifyDetailsChange({ name: e.target.value });
          }}
          placeholder={t("bookingWidget.details.namePlaceholder")}
          autoComplete="name"
        />

        {/* The either-email-or-phone guidance is stated once: on Email while it
            is the error (Phone's invalid state then points at that text),
            otherwise on Phone. */}
        <Input
          ref={emailRef}
          id={emailId}
          label={t("bookingWidget.details.email")}
          error={contactError || emailFormatError}
          hint={emailHint}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            notifyDetailsChange({ email: e.target.value });
          }}
          onBlur={handleEmailBlur}
          placeholder={t("bookingWidget.details.emailPlaceholder")}
        />

        <Input
          label={t("bookingWidget.details.phone")}
          error={contactError}
          hint={contactError ? undefined : t("bookingWidget.details.contactHint")}
          // rialto's useField names the hint region `${id}-hint`. Spread only
          // in the error state: rialto applies rest props after its own
          // wiring, so even an undefined value would drop Phone's own hint.
          {...(contactError ? { "aria-describedby": `${emailId}-hint` } : {})}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => {
            setPhoneInput(e.target.value);
            notifyDetailsChange({ phone: e.target.value });
          }}
          placeholder="(555) 123-4567"
        />

        <TextArea
          label={t("bookingWidget.specialRequests.label")}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            notifyDetailsChange({ notes: e.target.value });
          }}
          rows={3}
          placeholder={t("bookingWidget.details.requestsPlaceholder")}
        />

        <Button variant="primary" type="submit" disabled={isLoading}>
          {isLoading ? t("bookingWidget.details.confirming") : t("bookingWidget.details.complete")}
        </Button>
      </form>
    </div>
  );
}
