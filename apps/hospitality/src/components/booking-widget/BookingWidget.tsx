import { useEffect, useCallback } from "react";
import { usePublicApiClient } from "../../hooks/usePublicApiClient.js";
import { Steps, Text } from "@mattbutlerengineering/rialto";
import type { StepItem } from "@mattbutlerengineering/rialto";
import type { DepositConfig } from "@mbe/types";
import { quoteDeposit } from "@mbe/cancellation-policy";
import { DatePartySelector } from "./DatePartySelector";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { GuestDetailsForm, type GuestDetails } from "./GuestDetailsForm";
import { PaymentStep } from "./PaymentStep";
import { ConfirmationView } from "./ConfirmationView";
import { WaitlistJoinView } from "./WaitlistJoinView";
import { WaitlistConfirmationView } from "./WaitlistConfirmationView";
import { useBookingFlow } from "./useBookingFlow.js";
import { formatDepositCancellationTerms } from "./formatDepositCancellationTerms.js";
import { effectiveDepositPolicy, guestRiskMatters } from "./effectiveDepositPolicy.js";
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
  /**
   * Whether the venue has operating hours configured. Defaults to `true`
   * (assume configured) — pass the result of checking the venue's
   * `operatingHours` to show a setup prompt instead of "No available times".
   */
  hasOperatingHours?: boolean;
  /** Who is viewing this widget — staff get a prompt to configure hours. Defaults to `"guest"`. */
  audience?: "staff" | "guest";
  /** Staff-only: called when the "Set Operating Hours" prompt is clicked. */
  onSetHours?: () => void;
}

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
  hasOperatingHours = true,
  audience = "guest",
  onSetHours,
}: BookingWidgetProps) {
  const { state, data, actions, stepKeys, currentStepIndex } = useBookingFlow();

  // API client - no auth token for public booking
  const api = usePublicApiClient({ baseUrl: apiBaseUrl });

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
        const venueConfig = await api.venues.getPublicConfig(venueSlug);
        // Gate on whether a deposit was ever configured (amountCents
        // present), not on the venue's general `.enabled` flag — a venue
        // that configured then disabled its general policy must still
        // surface its deposit terms so the risky-guest override in
        // effectiveDepositPolicy can apply them. A venue that never
        // configured a deposit at all (amountCents null) leaves
        // depositConfig null, same as before.
        if (venueConfig.deposit.amountCents != null) {
          const config: DepositConfig = {
            enabled: venueConfig.deposit.enabled,
            depositType: venueConfig.deposit.depositType ?? "flat",
            amountCents: venueConfig.deposit.amountCents,
            currency: venueConfig.currencyCode.toLowerCase(),
            freeCancellationHours: venueConfig.deposit.freeCancellationHours,
            lateCancellationFeePercent: venueConfig.deposit.lateCancellationFeePercent,
            noShowFeePercent: venueConfig.deposit.noShowFeePercent,
          };
          actions.setDepositConfig(config);
        }
      } catch {
        // Non-fatal — proceed without deposit
      }
    };

    fetchDepositConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueSlug, api]);

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
        const result = await api.publicVenue.guestRisk(venueSlug, email ? { email } : { phone });
        return result.requiresDeposit;
      } catch {
        return false;
      }
    },
    [venueSlug, api]
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

      // Only check guest risk when it could actually change the verdict
      // (guestRiskMatters — the shared deposit-verdict module's own gating)
      // — avoids an unnecessary lookup, and avoids sending guest PII
      // (email/phone) when there's no deposit flow to gate.
      const guestIsRisky = guestRiskMatters(data.depositConfig, venueSlug, stripePublishableKey)
        ? await fetchGuestRisk(details.email || undefined, details.phone || undefined)
        : false;

      const depositConfig = effectiveDepositPolicy({
        depositConfig: data.depositConfig,
        venueSlug,
        stripePublishableKey,
        guestIsRisky,
      });

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

  // stepKeys/currentStepIndex come from useBookingFlow — the single source
  // of truth for the deposit decision (resolved once, at confirm, via the
  // effectiveDepositPolicy call in handleConfirmReservation above). The
  // widget must never recompute this decision separately.
  const bookingSteps = stepKeys.includes("payment")
    ? BOOKING_STEPS_WITH_DEPOSIT
    : BOOKING_STEPS_NO_DEPOSIT;

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
          hasOperatingHours={hasOperatingHours}
          audience={audience}
          onSetHours={onSetHours}
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
          api={api}
        />
      )}

      {state === "payment" && data.depositConfig && data.reservation && venueSlug && (
        <PaymentStep
          api={api}
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
            data.depositPaymentIntentId && data.depositConfig
              ? quoteDeposit(data.depositConfig, data.partySize)
              : null
          }
          depositCurrency={data.depositConfig?.currency ?? null}
          cancellationPolicySummary={formatDepositCancellationTerms(
            // `data.depositRequired` is the final, risk-aware outcome
            // resolved at confirm time — gating on it (rather than raw
            // depositConfig presence) keeps a "configured then disabled"
            // venue's terms hidden for bookings that never actually
            // required a deposit, while still showing them when the
            // risky-guest override applied.
            data.depositRequired ? data.depositConfig : null,
            data.partySize
          )}
          onNewBooking={handleNewBooking}
          cancellationUrl={cancellationUrl}
          onCancellation={onCancellation}
        />
      )}

      {state === "waitlist-join" && venueSlug && data.selectedDate && (
        <WaitlistJoinView
          requestedDate={data.selectedDate}
          partySize={data.partySize}
          estimatedWaitMinutes={defaultWaitMinutes}
          venueSlug={venueSlug}
          venueId={venueId}
          api={api}
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
