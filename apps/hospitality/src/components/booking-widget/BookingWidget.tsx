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
  // API client - no auth token for public booking
  const api = usePublicApiClient({ baseUrl: apiBaseUrl });

  // useBookingFlow owns the availability + Hold effects (slot fetch, Hold
  // create/confirm/release, hold-expiry timer) behind this seam — the widget
  // below is render-by-state + action-forwarding only for those concerns.
  const { state, data, actions, stepKeys, currentStepIndex } = useBookingFlow({
    api,
    venueId,
    holdDurationMinutes,
  });

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

  // Guest-risk lookup — stays here (not the hook) per issue #3486 scope: the
  // Guest-risk → deposit-required gate is deliberately out of scope for this
  // seam and moves in a follow-up.
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

      await actions.confirmReservation(details, depositConfig);
    },
    [actions, data.depositConfig, venueSlug, stripePublishableKey, fetchGuestRisk]
  );

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
          onNext={actions.goToTimeSlot}
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
          onSelectSlot={actions.selectSlotAndHold}
          onBack={actions.goToDateParty}
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
          onBack={actions.goToTimeSlot}
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
          onNewBooking={actions.resetFlow}
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
          onBack={actions.goToTimeSlot}
        />
      )}

      {state === "waitlist-confirmation" && data.waitlistResult && (
        <WaitlistConfirmationView
          position={data.waitlistResult.position}
          estimatedWaitMinutes={data.waitlistResult.estimatedWaitMinutes}
          onNewBooking={actions.resetFlow}
        />
      )}
    </div>
  );
}
