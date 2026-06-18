import { useEffect, useCallback, useMemo } from "react";
import { createApiClient } from "@mbe/api-client";
import { Steps, Text } from "@mattbutlerengineering/rialto";
import type { StepItem } from "@mattbutlerengineering/rialto";
import type { DepositConfig } from "@mbe/types";
import { DatePartySelector } from "./DatePartySelector";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { GuestDetailsForm, type GuestDetails } from "./GuestDetailsForm";
import { PaymentStep } from "./PaymentStep";
import { ConfirmationView } from "./ConfirmationView";
import { useBookingFlow } from "./useBookingFlow.js";
import styles from "./BookingWidget.module.css";

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

type BookingStep = "date-party" | "time-slot" | "guest-details" | "payment" | "confirmation";

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
  const { state, data, actions } = useBookingFlow();

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
    if (!data.selectedDate) return [];
    const response = await api.availability.getTimeSlots({
      venueId,
      date: data.selectedDate,
      partySize: data.partySize,
    });
    return response.filter((slot) => slot.available);
  }, [api, venueId, data.selectedDate, data.partySize]);

  // Release a hold by ID
  const releaseHold = useCallback(
    async (holdId: string) => {
      try {
        await api.holds.release(holdId);
      } catch {
        // Ignore — hold expires anyway
      }
    },
    [api]
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
          const config: DepositConfig = {
            enabled: true,
            depositType: (d.depositType as "flat" | "per_person") ?? "flat",
            amountCents: d.amountCents,
            currency: (body.data?.currencyCode ?? "usd").toLowerCase(),
            freeCancellationHours: d.freeCancellationHours,
            lateCancellationFeePercent: d.lateCancellationFeePercent,
            noShowFeePercent: d.noShowFeePercent,
          };
          actions.setDepositConfig(config);
        }
      } catch {
        // Non-fatal — proceed without deposit
      }
    };

    fetchDepositConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueSlug, apiBaseUrl]);

  // Hold expiry timer — captured hold in closure; effect restarts on every hold change
  useEffect(() => {
    if (!data.hold) return;
    const capturedHold = data.hold;

    const interval = setInterval(() => {
      if (new Date() >= new Date(capturedHold.expiresAt)) {
        actions.expireHold();
        // Reload slots after expiry
        fetchSlots()
          .then((slots) => actions.setSlots(slots))
          .catch(() => actions.setSlotsError("Failed to reload availability"));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [data.hold, fetchSlots]);

  // Navigation handlers
  const handleFindTimes = useCallback(() => {
    actions.goToTimeSlot(fetchSlots);
  }, [actions, fetchSlots]);

  const handleSelectSlot = useCallback(
    (slot: Parameters<typeof actions.selectSlotAndHold>[0]) => {
      if (!data.selectedDate) return;
      const holdPromise = api.holds
        .create({
          venueId,
          date: data.selectedDate,
          time: slot.time,
          partySize: data.partySize,
          holdDurationMinutes,
        })
        .then((res) => res.hold);
      actions.selectSlotAndHold(slot, holdPromise);
    },
    [actions, api, venueId, data.selectedDate, data.partySize, holdDurationMinutes]
  );

  const handleConfirmReservation = useCallback(
    (details: GuestDetails) => {
      if (!data.hold) return;
      const reservationPromise = api.holds.confirm(data.hold.id, {
        guestName: details.name,
        guestEmail: details.email || undefined,
        guestPhone: details.phone || undefined,
        notes: details.notes || undefined,
      });
      const depositConfig =
        data.depositConfig?.enabled && venueSlug && stripePublishableKey
          ? data.depositConfig
          : null;
      actions.confirmReservation(reservationPromise, depositConfig);
    },
    [actions, api, data.hold, data.depositConfig, venueSlug, stripePublishableKey]
  );

  const handleGoToDateParty = useCallback(() => {
    actions.goToDateParty(releaseHold);
  }, [actions, releaseHold]);

  const handleGoToTimeSlot = useCallback(() => {
    actions.goToTimeSlot(fetchSlots, releaseHold);
  }, [actions, fetchSlots, releaseHold]);

  const handleNewBooking = useCallback(() => {
    actions.resetFlow();
  }, [actions]);

  const hasDeposit = Boolean(data.depositConfig?.enabled && venueSlug && stripePublishableKey);
  const stepKeys = hasDeposit ? STEP_KEYS_WITH_DEPOSIT : STEP_KEYS_NO_DEPOSIT;
  const bookingSteps = hasDeposit ? BOOKING_STEPS_WITH_DEPOSIT : BOOKING_STEPS_NO_DEPOSIT;
  const currentStepIndex = stepKeys.indexOf(state as (typeof stepKeys)[number]);

  return (
    <div className={[styles.widget, className].filter(Boolean).join(" ")}>
      {/* Header */}
      <div className={styles.header}>
        <Text variant="display" as="h2" align="center">
          Make a Reservation
        </Text>
        {state !== "confirmation" && (
          <Text variant="caption" color="secondary" align="center">
            {state === "date-party" && "Select your date and party size"}
            {state === "time-slot" && "Choose an available time"}
            {state === "guest-details" && "Enter your details to confirm"}
            {state === "payment" && "Secure your reservation with a deposit"}
          </Text>
        )}
      </div>

      {/* Step indicator */}
      {state !== "confirmation" && (
        <Steps steps={bookingSteps} currentStep={currentStepIndex} compact />
      )}

      {/* Step content */}
      {state === "date-party" && (
        <DatePartySelector
          selectedDate={data.selectedDate}
          selectedEndDate={data.selectedEndDate}
          partySize={data.partySize}
          onDateChange={actions.setSelectedDate}
          onEndDateChange={enableDateRange ? actions.setSelectedEndDate : undefined}
          onPartySizeChange={actions.setPartySize}
          onNext={handleFindTimes}
          maxPartySize={maxPartySize}
          enableDateRange={enableDateRange}
          minDate={minDate}
          maxDate={maxDate}
        />
      )}

      {state === "time-slot" && data.selectedDate && (
        <TimeSlotPicker
          slots={data.slots}
          selectedSlot={data.selectedSlot}
          isLoading={data.slotsLoading || data.holdLoading}
          error={data.slotsError || data.holdError}
          onSelectSlot={handleSelectSlot}
          onBack={handleGoToDateParty}
          date={data.selectedDate}
          partySize={data.partySize}
        />
      )}

      {state === "guest-details" && data.selectedSlot && data.selectedDate && (
        <GuestDetailsForm
          slot={data.selectedSlot}
          hold={data.hold}
          date={data.selectedDate}
          partySize={data.partySize}
          isLoading={data.confirmLoading}
          error={data.confirmError}
          onSubmit={handleConfirmReservation}
          onBack={handleGoToTimeSlot}
          venueSlug={venueSlug}
          apiBaseUrl={apiBaseUrl}
        />
      )}

      {state === "payment" && data.depositConfig && data.reservation && venueSlug && (
        <PaymentStep
          depositConfig={data.depositConfig}
          partySize={data.partySize}
          reservationId={data.reservation.id}
          venueSlug={venueSlug}
          stripePublishableKey={stripePublishableKey}
          onSuccess={actions.handleDepositSuccess}
          onBack={actions.goBackToGuestDetails}
        />
      )}

      {state === "confirmation" && data.reservation && (
        <ConfirmationView
          reservation={data.reservation}
          depositAmountCents={
            data.depositPaymentIntentId ? (data.depositConfig?.amountCents ?? null) : null
          }
          depositCurrency={data.depositConfig?.currency ?? null}
          onNewBooking={handleNewBooking}
          cancellationUrl={cancellationUrl}
          onCancellation={onCancellation}
        />
      )}
    </div>
  );
}
