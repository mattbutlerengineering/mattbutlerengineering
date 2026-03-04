import { useState } from "react";
import type { TimeSlot, ReservationHold } from "@mbe/types";
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
}: GuestDetailsFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  // Format date and time for display
  const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const formattedTime = new Date(slot.time).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Calculate time remaining on hold
  const getHoldTimeRemaining = () => {
    if (!hold) return null;
    const expiresAt = new Date(hold.expiresAt);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    if (diffMs <= 0) return "Expired";
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, email, phone, notes });
  };

  const isValid = name.trim().length > 0 && (email.trim().length > 0 || phone.trim().length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <button onClick={onBack} className={styles.backLink}>
          &larr; Back
        </button>
        {hold && (
          <div className={styles.holdTimer}>Hold expires in: {getHoldTimeRemaining()}</div>
        )}
      </div>

      {/* Reservation summary */}
      <div className={styles.summaryCard}>
        <h3 className={styles.summaryTitle}>Reservation Details</h3>
        <div className={styles.summaryDetails}>
          <p>{formattedDate}</p>
          <p>{formattedTime}</p>
          <p>
            {partySize} {partySize === 1 ? "guest" : "guests"}
          </p>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="name" className={styles.label}>
            Name <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={styles.input}
            placeholder="John Smith"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
            placeholder="john@example.com"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="phone" className={styles.label}>
            Phone
          </label>
          <input
            type="tel"
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={styles.input}
            placeholder="(555) 123-4567"
          />
        </div>

        <p className={styles.hint}>Please provide either email or phone for confirmation.</p>

        <div className={styles.field}>
          <label htmlFor="notes" className={styles.label}>
            Special Requests
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={styles.textarea}
            placeholder="Allergies, celebrations, seating preferences..."
          />
        </div>

        <button type="submit" disabled={!isValid || isLoading} className={styles.submitButton}>
          {isLoading ? "Confirming..." : "Complete Reservation"}
        </button>
      </form>
    </div>
  );
}
