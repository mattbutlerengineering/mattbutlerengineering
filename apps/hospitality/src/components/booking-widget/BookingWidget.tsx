import { useState, useEffect, useCallback, useMemo } from "react";
import { createApiClient } from "@mbe/api-client";
import { Steps, Text } from "@mattbutlerengineering/rialto";
import type { StepItem } from "@mattbutlerengineering/rialto";
import type { TimeSlot, ReservationHold, Reservation, DepositConfig } from "@mbe/types";
import { DatePartySelector } from "./DatePartySelector";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { GuestDetailsForm, type GuestDetails } from "./GuestDetailsForm";
import { PaymentStep } from "./PaymentStep";
import { ConfirmationView } from "./ConfirmationView";
import styles from "./BookingWidget.module.css";

type BookingStep = "date-party" | "time-slot" | "guest-details" | "payment" | "confirmation";

export interface BookingWidgetProps {
  venueId: string;
  venueSlug?: string;
  apiBaseUrl?: string;
  maxPartySize?: number;
  holdDurationMinutes?: number;
  enableDateRange?: boolean;
  minDate?: string;
  maxDate?: string;
  cancellationUrl?: string;
  onCancellation?: () => void;
  className?: string;
  stripePublishableKey?: string;
}

const STEP_KEYS_NO_DEPOSIT: BookingStep[] = ["date-party", "time-slot", "guest-details"];
const STEP_KEYS_WITH_DEPOSIT: BookingStep[] = [
  "date-party",
  "time-slot",
  "guest-details",
  "payment",
];

const BOOKING_STEPS_NO_DEPOSIT: StepItem[] = [
  { label: "Date & Party" },
  { label: "Time" },
  { label: "Details" },
];

const BOOKING_STEPS_WITH_DEPOSIT: StepItem[] = [
  { label: "Date & Party" },
  { label: "Time" },
  { label: "Details" },
  { label: "Payment" },
];

export function BookingWidget({
  venueId,
  venueSlug,
  apiBaseUrl = import.meta.env.VITE_API_URL ?? "",
  maxPartySize = 8,
  holdDurationMinutes = 10,
  enableDateRange = false,
  minDate,
  maxDate,
  cancellationUrl,
  onCancellation,
  className = "",
  stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
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

  // Deposit
  const [depositConfig, setDepositConfig] = useState<DepositConfig | null>(null);
  const [depositPaymentIntentId, setDepositPaymentIntentId] = useState<string | null>(null);

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

  // Fetch venue deposit config when venueSlug is provided
  useEffect(() => {
    if (!venueSlug) return;

    const fetchDepositConfig = async () => {
      try {
        const resp = await fetch(`${apiBaseUrl}/public/v1/venues/${venueSlug}`);
        if (!resp.ok) return;
        const body = (await resp.json()) as {
          data?: {
            deposit?: {
              enabled: boolean;
              depositType: string | null;
              amountCents: number | null;
              freeCancellationHours: number | null;
              lateCancellationFeePercent: number | null;
              noShowFeePercent: number | null;
            };
            currencyCode?: string;
          };
        };
        const d = body.data?.deposit;
        if (d?.enabled) {
          setDepositConfig({
            enabled: true,
            depositType: (d.depositType as "flat" | "per_person") ?? "flat",
            amountCents: d.amountCents,
            currency: (body.data?.currencyCode ?? "usd").toLowerCase(),
            freeCancellationHours: d.freeCancellationHours,
            lateCancellationFeePercent: d.lateCancellationFeePercent,
            noShowFeePercent: d.noShowFeePercent,
          });
        }
      } catch {
        // Non-fatal — proceed without deposit
      }
    };

    fetchDepositConfig();
  }, [venueSlug, apiBaseUrl]);

  // Confirm the reservation (creates reservation, then goes to payment if deposit enabled)
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

        // If deposit is enabled, go to payment step before confirmation
        if (depositConfig?.enabled && venueSlug && stripePublishableKey) {
          setStep("payment");
        } else {
          setStep("confirmation");
        }
      } catch (err) {
        setConfirmError(err instanceof Error ? err.message : "Failed to confirm reservation");
      } finally {
        setConfirmLoading(false);
      }
    },
    [api, hold, depositConfig, venueSlug, stripePublishableKey]
  );

  // Handle successful deposit payment
  const handleDepositSuccess = useCallback((paymentIntentId: string) => {
    setDepositPaymentIntentId(paymentIntentId);
    setStep("confirmation");
  }, []);

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
    setDepositPaymentIntentId(null);
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

  const hasDeposit = Boolean(depositConfig?.enabled && venueSlug && stripePublishableKey);
  const stepKeys = hasDeposit ? STEP_KEYS_WITH_DEPOSIT : STEP_KEYS_NO_DEPOSIT;
  const bookingSteps = hasDeposit ? BOOKING_STEPS_WITH_DEPOSIT : BOOKING_STEPS_NO_DEPOSIT;
  const currentStepIndex = stepKeys.indexOf(step as (typeof stepKeys)[number]);

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
            {step === "payment" && "Secure your reservation with a deposit"}
          </Text>
        )}
      </div>

      {/* Step indicator */}
      {step !== "confirmation" && (
        <Steps steps={bookingSteps} currentStep={currentStepIndex} compact />
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
          venueSlug={venueSlug}
          apiBaseUrl={apiBaseUrl}
        />
      )}

      {step === "payment" && depositConfig && reservation && venueSlug && (
        <PaymentStep
          depositConfig={depositConfig}
          partySize={partySize}
          reservationId={reservation.id}
          venueSlug={venueSlug}
          stripePublishableKey={stripePublishableKey}
          onSuccess={handleDepositSuccess}
          onBack={() => setStep("guest-details")}
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
