import { useState, useEffect, useCallback, useReducer, useRef } from "react";
import type { TimeSlot, ReservationHold } from "@mbe/types";
import { Input, TextArea, Button, Alert, Text, Banner, Badge } from "@mattbutlerengineering/rialto";
import { formatLongDate, formatTime } from "../../utils/format.js";
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
  apiBaseUrl?: string;
}

interface RecognitionResult {
  firstName: string | null;
  phone: string | null;
  visitCount: number;
  hasPreferences: boolean;
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
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
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
  apiBaseUrl = "",
}: GuestDetailsFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [recognition, setRecognition] = useState<RecognitionResult | null>(null);
  // Force re-render every second so the hold countdown stays current
  const [, forceRender] = useReducer((c: number) => c + 1, 0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hold) return;
    const interval = setInterval(forceRender, 1000);
    return () => clearInterval(interval);
  }, [hold]);

  const holdTimeRemaining = hold ? computeHoldTimeRemaining(hold) : null;

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
      const emailValue = e.target.value;
      if (!venueSlug || !emailValue) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const url = `${apiBaseUrl}/public/v1/venues/${venueSlug}/guests/recognize?email=${encodeURIComponent(emailValue)}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json();
          if (data.recognized) {
            setRecognition({
              firstName: data.firstName ?? null,
              phone: data.phone ?? null,
              visitCount: data.visitCount ?? 1,
              hasPreferences: data.hasPreferences ?? false,
            });
            if (data.firstName && !name) {
              setName(data.firstName);
            }
            if (data.phone && !phone) {
              setPhone(data.phone);
            }
          }
        } catch {
          // Silent fail — never block booking
        }
      }, 300);
    },
    [venueSlug, apiBaseUrl, name, phone]
  );

  // Clear debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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

      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Smith"
        />

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleEmailBlur}
          placeholder="john@example.com"
        />

        <Input
          label="Phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
        />

        <Text className={styles.hint}>Please provide either email or phone for confirmation.</Text>

        <TextArea
          label="Special Requests"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
