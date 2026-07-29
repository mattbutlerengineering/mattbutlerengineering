import { usePublicApiClient } from "../../hooks/usePublicApiClient.js";
import { Steps, Text } from "@mattbutlerengineering/rialto";
import type { StepItem } from "@mattbutlerengineering/rialto";
import { quoteDeposit } from "@mbe/cancellation-policy";
import { DatePartySelector } from "./DatePartySelector";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { GuestDetailsForm } from "./GuestDetailsForm";
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
  // create/confirm/release, hold-expiry timer), the venue deposit-config
  // fetch/mapping, and the Guest-risk → deposit-required gate behind this
  // seam — the widget below is render-by-state + action-forwarding only.
  const { state, data, actions, stepKeys, currentStepIndex } = useBookingFlow({
    api,
    venueId,
    venueSlug,
    stripePublishableKey,
    holdDurationMinutes,
  });

  // stepKeys/currentStepIndex come from useBookingFlow — the single source
  // of truth for the deposit decision (resolved once, at confirm, inside the
  // hook's own effectiveDepositPolicy call). The widget must never recompute
  // this decision separately.
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
          onSubmit={actions.confirmReservation}
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
