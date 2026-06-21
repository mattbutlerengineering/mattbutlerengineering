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
import { WaitlistJoinView } from "./WaitlistJoinView";
import { WaitlistConfirmationView } from "./WaitlistConfirmationView";
import { useBookingFlow } from "./useBookingFlow.js";
import { formatDepositCancellationTerms } from "./formatDepositCancellationTerms.js";
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
  /** Default estimated wait minutes shown when no slots are available (before API response) */
  defaultWaitMinutes?: number;
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
  defaultWaitMinutes = 30,
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

  const fetchGuestRisk = useCallback(
    async (email?: string, phone?: string): Promise<boolean> => {
      if (!venueSlug || (!email && !phone)) return false;
      try {
        const params = new URLSearchParams();
        if (email) params.set("email", email);
        else if (phone) params.set("phone", phone);
        const resp = await fetch(
          `${apiBaseUrl}/public/v1/venues/${venueSlug}/guest-risk?${params.toString()}`
        );
        if (!resp.ok) return false;
        const body = (await resp.json()) as {
          data?: { requiresDeposit?: boolean };
        };
        return body.data?.requiresDeposit ?? false;
      } catch {
        return false;
      }
    },
    [venueSlug, apiBaseUrl]
  );

  const handleConfirmReservation = useCallback(
    async (details: GuestDetails) => {
      if (!data.hold) return;
      const reservationPromise = api.holds.confirm(data.hold.id, {
        guestName: details.name,
        guestEmail: details.email || undefined,
        guestPhone: details.phone || undefined,
        notes: details.notes || undefined,
      });

      // Determine effective deposit config:
      // 1. Venue's general deposit config (if enabled)
      // 2. Force deposit for risky guests (if Stripe is configured)
      let depositConfig =
        data.depositConfig?.enabled && venueSlug && stripePublishableKey
          ? data.depositConfig
          : null;

      if (!depositConfig && venueSlug && stripePublishableKey) {
        const guestIsRisky = await fetchGuestRisk(
          details.email || undefined,
          details.phone || undefined
        );
        if (guestIsRisky && data.depositConfig) {
          depositConfig = data.depositConfig;
        }
      }

      actions.confirmReservation(reservationPromise, depositConfig);
    },
    [actions, api, data.hold, data.depositConfig, venueSlug, stripePublishableKey, fetchGuestRisk]
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

  const isWaitlistState = state === "waitlist-join" || state === "waitlist-confirmation";

  return (
    <div className={[styles.widget, className].filter(Boolean).join(" ")}>
      {/* Header */}
      <div className={styles.header}>
        <Text variant="display" as="h2" align="center">
          Make a Reservation
        </Text>
        {state !== "confirmation" && !isWaitlistState && (
          <Text variant="caption" color="secondary" align="center">
            {state === "date-party" && "Select your date and party size"}
            {state === "time-slot" && "Choose an available time"}
            {state === "guest-details" && "Enter your details to confirm"}
            {state === "payment" && "Secure your reservation with a deposit"}
          </Text>
        )}
      </div>

      {/* Step indicator — hidden during waitlist flow */}
      {state !== "confirmation" && !isWaitlistState && (
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
          onJoinWaitlist={venueSlug ? actions.goToWaitlistJoin : undefined}
          estimatedWaitMinutes={defaultWaitMinutes}
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
          cancellationPolicySummary={formatDepositCancellationTerms(data.depositConfig ?? null)}
          onNewBooking={handleNewBooking}
          cancellationUrl={cancellationUrl}
          onCancellation={onCancellation}
        />
      )}

      {state === "waitlist-join" && venueSlug && data.selectedDate && (
        <WaitlistJoinView
          requestedTime={data.selectedDate + "T19:00:00"}
          partySize={data.partySize}
          estimatedWaitMinutes={defaultWaitMinutes}
          venueSlug={venueSlug}
          venueId={venueId}
          apiBaseUrl={apiBaseUrl}
          onJoined={actions.handleWaitlistJoined}
          onBack={handleGoToTimeSlot}
        />
      )}

      {state === "waitlist-confirmation" && data.waitlistResult && (
        <WaitlistConfirmationView
          position={data.waitlistResult.position}
          estimatedWaitMinutes={data.waitlistResult.estimatedWaitMinutes}
          onNewBooking={handleNewBooking}
        />
      )}
    </div>
  );
}
