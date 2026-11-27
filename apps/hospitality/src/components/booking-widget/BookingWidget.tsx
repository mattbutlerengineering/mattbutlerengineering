import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePublicApiClient } from "../../hooks/usePublicApiClient.js";
import { Alert, EmptyState, Steps, Text } from "@mattbutlerengineering/rialto";
import type { StepItem } from "@mattbutlerengineering/rialto";
import { quoteDeposit } from "@mbe/cancellation-policy";
import { addDays, venueDate } from "../../utils/service-day.js";
import { manageReservationUrl } from "../../lib/host-brand.js";
import { WidgetLocalePicker } from "./WidgetLocalePicker.js";
import { DatePartySelector } from "./DatePartySelector";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { GuestDetailsForm } from "./GuestDetailsForm";
import { PaymentStep } from "./PaymentStep";
import { ConfirmationView } from "./ConfirmationView";
import { WaitlistJoinView } from "./WaitlistJoinView";
import { LiveWaitlistConfirmation } from "./LiveWaitlistConfirmation";
import { useBookingFlow } from "./useBookingFlow.js";
import { useMemberStatus } from "./useMemberStatus.js";
import { useDepositCancellationTerms } from "./formatDepositCancellationTerms.js";
import styles from "./BookingWidget.module.css";

export interface BookingWidgetProps {
  venueId: string;
  /**
   * Required for booking: since #4487 the hold lifecycle runs through
   * `/public/v1/venues/:slug/holds`, the only hold route an unauthenticated
   * widget may call. Omitting it leaves the widget browsable but unable to
   * hold a slot (it reports `MISSING_VENUE_SLUG_ERROR`).
   */
  venueSlug?: string;
  apiBaseUrl?: string;
  maxPartySize?: number;
  enableDateRange?: boolean;
  minDate?: string;
  maxDate?: string;
  /**
   * Overrides the manage-token-derived cancellation link ConfirmationView
   * would otherwise build. Mainly for embeds/demos without a real backend
   * manage token; leave unset in production.
   */
  cancellationUrl?: string;
  /**
   * Notified whenever the active (unconfirmed) hold changes — see
   * useBookingFlow's onHoldChange. Lets the embedding page release the hold
   * if the guest closes the tab before confirming (#4978).
   */
  onHoldChange?: (info: { holdId: string; sessionId: string | null } | null) => void;
  className?: string;
  /** Venue contact phone, shown as a tel: link for parties above maxPartySize (#4979). */
  phone?: string;
  stripePublishableKey?: string;
  /** Optional server-derived wait estimate shown when no slots are available; never defaulted client-side. */
  defaultWaitMinutes?: number;
  /**
   * Whether the venue has operating hours configured. Defaults to `true`
   * (assume configured) — pass the result of checking the venue's
   * `operatingHours` to show a setup prompt instead of "No available times".
   */
  hasOperatingHours?: boolean;
  /** Who is viewing this widget — staff get a prompt to configure hours. Defaults to `"guest"`. */
  audience?: "staff" | "guest";
  /** Staff-only: called when the "Set up regular week" prompt is clicked. */
  onSetHours?: () => void;
  /**
   * IANA timezone the venue operates in (e.g. "America/New_York"). Threaded
   * into every step that displays a slot/reservation time so it renders in
   * the venue's clock rather than the guest's device timezone (#4976).
   */
  venueTimezone?: string;
  /**
   * Regulars Club member link from the invite email (#9627). Sent on availability, hold and
   * confirm calls; the venue decides whether it is valid.
   */
  memberToken?: string;
}

const STEP_LABEL_KEYS = {
  "date-party": "bookingWidget.steps.dateParty",
  "time-slot": "bookingWidget.steps.time",
  "guest-details": "bookingWidget.steps.details",
  payment: "bookingWidget.steps.payment",
} as const;

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

/**
 * Focuses the widget's own step heading or, for steps that title themselves (waitlist,
 * confirmation), the first heading below the widget header, made programmatically focusable.
 */
function focusStepHeading(stepHeading: HTMLElement | null, header: HTMLElement | null) {
  const headings = header?.parentElement?.querySelectorAll<HTMLElement>(HEADING_SELECTOR) ?? [];
  const heading =
    stepHeading ?? Array.from(headings).find((candidate) => !header?.contains(candidate));
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus();
}

export function BookingWidget({
  venueId,
  venueSlug,
  apiBaseUrl = import.meta.env.VITE_API_URL ?? "",
  maxPartySize = 8,
  enableDateRange = false,
  minDate,
  maxDate,
  cancellationUrl,
  onHoldChange,
  className = "",
  phone,
  stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  defaultWaitMinutes,
  hasOperatingHours = true,
  audience = "guest",
  onSetHours,
  venueTimezone,
  memberToken,
}: BookingWidgetProps) {
  // API client - no auth token for public booking
  const api = usePublicApiClient({ baseUrl: apiBaseUrl, memberToken });
  const member = useMemberStatus(api, venueSlug, memberToken);

  // useBookingFlow owns the availability + Hold effects (slot fetch, Hold
  // create/confirm/release, hold-expiry timer), the venue deposit-config
  // fetch/mapping, and the server's deposit-required verdict behind this
  // seam — the widget below is render-by-state + action-forwarding only.
  const { state, data, actions, stepKeys, currentStepIndex } = useBookingFlow({
    api,
    venueSlug,
    stripePublishableKey,
    onHoldChange,
    venueTimezone,
  });

  // stepKeys/currentStepIndex come from useBookingFlow — the single source
  // of truth for the deposit decision (resolved once, at confirm, inside the
  // hook's own effectiveDepositPolicy call). The widget must never recompute
  // this decision separately.
  const { t } = useTranslation();
  const bookingSteps: StepItem[] = stepKeys
    .filter((key): key is keyof typeof STEP_LABEL_KEYS => key in STEP_LABEL_KEYS)
    .map((key) => ({ label: t(STEP_LABEL_KEYS[key]) }));

  // `data.depositRequired` is the final, risk-aware outcome resolved at
  // confirm time — gating on it (rather than raw depositConfig presence)
  // keeps a "configured then disabled" venue's terms hidden for bookings that
  // never actually required a deposit, while still showing them when the
  // risky-guest override applied.
  const cancellationPolicySummary = useDepositCancellationTerms(
    data.depositRequired ? data.depositConfig : null,
    data.partySize
  );

  // The venue's own maxAdvanceBooking (days) bounds the date picker; an
  // explicit `maxDate` prop still wins.
  // A verified member's window runs `leadDays` further (#9627).
  const publicAdvanceDays = data.venueConfig?.settings.maxAdvanceBooking;
  const maxAdvanceDays =
    publicAdvanceDays === undefined
      ? undefined
      : publicAdvanceDays + (member.kind === "member" ? member.leadDays : 0);
  const effectiveMaxDate =
    maxDate ??
    (maxAdvanceDays === undefined
      ? undefined
      : addDays(
          venueDate(new Date(), venueTimezone ?? data.venueConfig?.ianaTimezone),
          maxAdvanceDays
        ));

  const isWaitlistState = state === "waitlist-join" || state === "waitlist-confirmation";

  // A step change unmounts the control that was pressed, dropping focus to <body> (#9995):
  // move it to the new step's heading so the change is announced. The first render keeps focus
  // where the page put it.
  const headerRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLElement>(null);
  const focusedStateRef = useRef(state);
  useEffect(() => {
    if (focusedStateRef.current === state) return;
    focusedStateRef.current = state;
    focusStepHeading(stepHeadingRef.current, headerRef.current);
  }, [state]);

  return (
    <div className={[styles.widget, className].filter(Boolean).join(" ")}>
      {/* Header */}
      <div ref={headerRef} className={styles.header}>
        <WidgetLocalePicker />
        <Text variant="display" as="h2" align="center">
          {t("bookingWidget.title")}
        </Text>
        {state !== "confirmation" && !isWaitlistState && (
          <Text
            ref={stepHeadingRef}
            variant="caption"
            color="secondary"
            align="center"
            as="h3"
            tabIndex={-1}
            className={styles.stepHeading}
          >
            {state === "date-party" && t("bookingWidget.subtitle.dateParty")}
            {state === "time-slot" && t("bookingWidget.subtitle.timeSlot")}
            {state === "guest-details" && t("bookingWidget.subtitle.guestDetails")}
            {state === "payment" && t("bookingWidget.subtitle.payment")}
          </Text>
        )}
      </div>

      {/* Step indicator — hidden during waitlist flow */}
      {state !== "confirmation" && !isWaitlistState && (
        <Steps steps={bookingSteps} currentStep={currentStepIndex} compact />
      )}

      {/* Step content */}
      {state === "date-party" && !hasOperatingHours && audience === "guest" && (
        <EmptyState
          heading={t("bookingWidget.timeSlot.noHoursGuestHeading")}
          description={
            phone
              ? t("bookingWidget.timeSlot.noHoursGuestCall", { phone })
              : t("bookingWidget.timeSlot.noHoursGuestDescription")
          }
        />
      )}

      {state === "date-party" && member.kind === "member" && (
        <Alert variant="info">{t("bookingWidget.member_banner", { count: member.leadDays })}</Alert>
      )}
      {state === "date-party" && member.kind === "invalid" && (
        <Alert variant="info">{t("bookingWidget.member_invalid")}</Alert>
      )}

      {state === "date-party" && (hasOperatingHours || audience === "staff") && (
        <DatePartySelector
          selectedDate={data.selectedDate}
          selectedEndDate={data.selectedEndDate}
          partySize={data.partySize}
          onDateChange={actions.setSelectedDate}
          onEndDateChange={enableDateRange ? actions.setSelectedEndDate : undefined}
          onPartySizeChange={actions.setPartySize}
          onNext={actions.goToTimeSlot}
          maxPartySize={maxPartySize}
          phone={phone}
          enableDateRange={enableDateRange}
          minDate={minDate}
          maxDate={effectiveMaxDate}
          venueTimezone={venueTimezone}
          closedDates={data.closures}
          fallbackOperatingHours={
            data.closedDatesLoaded ? undefined : data.venueConfig?.operatingHours
          }
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
          venueTimezone={venueTimezone}
          closure={data.closures[data.selectedDate]}
          bookingPaused={data.bookingPaused}
          closedMidBooking={data.closedMidBooking}
          phone={phone}
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
          initialDetails={data.guestDetails}
          onDetailsChange={actions.setGuestDetails}
          venueTimezone={venueTimezone}
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
          cancellationPolicySummary={cancellationPolicySummary}
          onNewBooking={actions.resetFlow}
          cancellationUrl={
            cancellationUrl ??
            (data.manageToken ? manageReservationUrl(data.manageToken) : undefined)
          }
          manageToken={data.manageToken ?? undefined}
          venueConfig={data.venueConfig}
          venueTimezone={venueTimezone}
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

      {state === "waitlist-confirmation" && data.waitlistResult && venueSlug && (
        <LiveWaitlistConfirmation
          api={api}
          venueSlug={venueSlug}
          joined={data.waitlistResult}
          onNewBooking={actions.resetFlow}
        />
      )}
    </div>
  );
}
