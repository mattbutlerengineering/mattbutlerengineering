import { useState, useEffect, useCallback, useMemo } from "react";
import { createApiClient } from "@mbe/api-client";
import { Steps, Text } from "@mattbutlerengineering/rialto";
import type { StepItem } from "@mattbutlerengineering/rialto";
import type { TimeSlot, ReservationHold, Reservation } from "@mbe/types";
import { DatePartySelector } from "./DatePartySelector";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { GuestDetailsForm, type GuestDetails } from "./GuestDetailsForm";
import { ConfirmationView } from "./ConfirmationView";
import styles from "./BookingWidget.module.css";

type BookingStep = "date-party" | "time-slot" | "guest-details" | "confirmation";

export interface BookingWidgetProps {
  venueId: string;
  apiBaseUrl?: string;
  maxPartySize?: number;
  holdDurationMinutes?: number;
  enableDateRange?: boolean;
  minDate?: string;
  maxDate?: string;
  cancellationUrl?: string;
  onCancellation?: () => void;
  className?: string;
}

const STEP_KEYS: BookingStep[] = ["date-party", "time-slot", "guest-details"];

const BOOKING_STEPS: StepItem[] = [
  { label: "Date & Party" },
  { label: "Time" },
  { label: "Details" },
];

export function BookingWidget({
  venueId,
  apiBaseUrl = import.meta.env.VITE_API_URL ?? "",
  maxPartySize = 8,
  holdDurationMinutes = 10,
  enableDateRange = false,
  minDate,
  maxDate,
  cancellationUrl,
  onCancellation,
  className = "",
}: BookingWidgetProps) {
  // Step management
  const [step, setStep] = useState<BookingStep>("date-party");

  // Date and party size
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(2);

  // Time slots
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Hold
  const [hold, setHold] = useState<ReservationHold | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);

  // Confirmation
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // API client - no auth token for public booking
  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiBaseUrl,
        getAccessToken: () => null,
      }),
    [apiBaseUrl]
  );

  // Fetch available time slots
  const fetchSlots = useCallback(async () => {
    if (!selectedDate) return;

    setSlotsLoading(true);
    setSlotsError(null);

    try {
      const response = await api.availability.getTimeSlots({
        venueId,
        date: selectedDate,
        partySize,
      });
      // Filter to only available slots
      setSlots(response.filter((slot) => slot.available));
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : "Failed to load availability");
    } finally {
      setSlotsLoading(false);
    }
  }, [api, venueId, selectedDate, partySize]);

  // Create a hold when selecting a time slot
  const createHold = useCallback(
    async (slot: TimeSlot) => {
      if (!selectedDate) return;

      setHoldLoading(true);
      setHoldError(null);

      try {
        const { hold: newHold } = await api.holds.create({
          venueId,
          date: selectedDate,
          time: slot.time,
          partySize,
          holdDurationMinutes,
        });
        setHold(newHold);
        setSelectedSlot(slot);
        setStep("guest-details");
      } catch (err) {
        setHoldError(err instanceof Error ? err.message : "Failed to hold time slot");
      } finally {
        setHoldLoading(false);
      }
    },
    [api, venueId, selectedDate, partySize, holdDurationMinutes]
  );

  // Confirm the reservation
  const confirmReservation = useCallback(
    async (details: GuestDetails) => {
      if (!hold) return;

      setConfirmLoading(true);
      setConfirmError(null);

      try {
        const confirmed = await api.holds.confirm(hold.id, {
          guestName: details.name,
          guestEmail: details.email || undefined,
          guestPhone: details.phone || undefined,
          notes: details.notes || undefined,
        });
        setReservation(confirmed);
        setStep("confirmation");
      } catch (err) {
        setConfirmError(err instanceof Error ? err.message : "Failed to confirm reservation");
      } finally {
        setConfirmLoading(false);
      }
    },
    [api, hold]
  );

  // Release hold when going back from guest details
  const releaseHold = useCallback(async () => {
    if (hold) {
      try {
        await api.holds.release(hold.id);
      } catch {
        // Ignore errors - hold will expire anyway
      }
      setHold(null);
    }
  }, [api, hold]);

  // Handle step navigation
  const goToDateParty = useCallback(() => {
    releaseHold();
    setStep("date-party");
    setSelectedSlot(null);
    setSlots([]);
  }, [releaseHold]);

  const goToTimeSlot = useCallback(() => {
    releaseHold();
    setStep("time-slot");
    setSelectedSlot(null);
    fetchSlots();
  }, [releaseHold, fetchSlots]);

  const handleFindTimes = useCallback(() => {
    setStep("time-slot");
    fetchSlots();
  }, [fetchSlots]);

  const handleSelectSlot = useCallback(
    (slot: TimeSlot) => {
      createHold(slot);
    },
    [createHold]
  );

  const handleNewBooking = useCallback(() => {
    setStep("date-party");
    setSelectedDate(null);
    setSelectedEndDate(null);
    setPartySize(2);
    setSlots([]);
    setSelectedSlot(null);
    setHold(null);
    setReservation(null);
    setSlotsError(null);
    setHoldError(null);
    setConfirmError(null);
  }, []);

  // Hold expiry timer
  useEffect(() => {
    if (!hold) return;

    const checkExpiry = () => {
      const expiresAt = new Date(hold.expiresAt);
      if (new Date() >= expiresAt) {
        setHoldError("Your hold has expired. Please select a new time.");
        setHold(null);
        setStep("time-slot");
        fetchSlots();
      }
    };

    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [hold, fetchSlots]);

  const currentStepIndex = STEP_KEYS.indexOf(step as (typeof STEP_KEYS)[number]);

  return (
    <div className={[styles.widget, className].filter(Boolean).join(" ")}>
      {/* Header */}
      <div className={styles.header}>
        <Text variant="display" as="h2" align="center">
          Make a Reservation
        </Text>
        {step !== "confirmation" && (
          <Text variant="caption" color="secondary" align="center">
            {step === "date-party" && "Select your date and party size"}
            {step === "time-slot" && "Choose an available time"}
            {step === "guest-details" && "Enter your details to confirm"}
          </Text>
        )}
      </div>

      {/* Step indicator */}
      {step !== "confirmation" && (
        <Steps steps={BOOKING_STEPS} currentStep={currentStepIndex} compact />
      )}

      {/* Step content */}
      {step === "date-party" && (
        <DatePartySelector
          selectedDate={selectedDate}
          selectedEndDate={selectedEndDate}
          partySize={partySize}
          onDateChange={setSelectedDate}
          onEndDateChange={enableDateRange ? setSelectedEndDate : undefined}
          onPartySizeChange={setPartySize}
          onNext={handleFindTimes}
          maxPartySize={maxPartySize}
          enableDateRange={enableDateRange}
          minDate={minDate}
          maxDate={maxDate}
        />
      )}

      {step === "time-slot" && selectedDate && (
        <TimeSlotPicker
          slots={slots}
          selectedSlot={selectedSlot}
          isLoading={slotsLoading || holdLoading}
          error={slotsError || holdError}
          onSelectSlot={handleSelectSlot}
          onBack={goToDateParty}
          date={selectedDate}
          partySize={partySize}
        />
      )}

      {step === "guest-details" && selectedSlot && selectedDate && (
        <GuestDetailsForm
          slot={selectedSlot}
          hold={hold}
          date={selectedDate}
          partySize={partySize}
          isLoading={confirmLoading}
          error={confirmError}
          onSubmit={confirmReservation}
          onBack={goToTimeSlot}
        />
      )}

      {step === "confirmation" && reservation && (
        <ConfirmationView
          reservation={reservation}
          depositAmountCents={depositPaymentIntentId ? (depositConfig?.amountCents ?? null) : null}
          depositCurrency={depositConfig?.currency ?? null}
          onNewBooking={handleNewBooking}
          cancellationUrl={cancellationUrl}
          onCancellation={onCancellation}
        />
      )}
    </div>
  );
}
