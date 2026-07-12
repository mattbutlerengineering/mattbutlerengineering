import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  DataList,
  DatePicker,
  Input,
  Stack,
  Steps,
  Text,
} from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import {
  attemptAdvance,
  goBack,
  INITIAL_WIZARD_STATE,
  LAST_STEP_INDEX,
  maskCardNumber,
  nextIsoDay,
  priceBreakdown,
  ROOMS,
  WIZARD_STEPS,
  type BookingWizardState,
  type FieldErrors,
  type GuestInfo,
  type PaymentInfo,
} from "./booking-wizard";
import styles from "./BookingWizardExamplePage.module.css";

/* ── Source JSX constant (shown in the "Copy JSX" panel) ── */

const WIZARD_EXAMPLE_JSX = `const [step, setStep] = useState(0);
const [data, setData] = useState(INITIAL_WIZARD_STATE);
const [errors, setErrors] = useState({});

function handleContinue() {
  const result = attemptAdvance(step, data);
  setErrors(result.errors);
  setStep(result.step);
}

<Steps steps={WIZARD_STEPS} currentStep={step} />
{/* one panel per step: dates → room → guest → payment → confirmation */}
<Button variant="ghost" onClick={() => setStep(goBack(step))}>Back</Button>
<Button variant="primary" onClick={handleContinue}>Continue</Button>`;

/* ── Composition notes ───────────────────────── */

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      One <code>Steps</code> indicator tracks progress across five panels. Every navigation decision
      — can we advance, which fields failed, what the price is — comes from a framework-free step
      machine in <code>booking-wizard.ts</code>, so the rules are unit-tested without React.
    </CompositionNote>
    <CompositionNote>
      Dates use two single <code>DatePicker</code>s (ISO <code>yyyy-mm-dd</code>, no range API); the
      check-out picker&apos;s <code>min</code> is the day after check-in, so an invalid range
      can&apos;t be picked. Per-step validation blocks <code>Continue</code> and surfaces field
      errors, while back-navigation keeps every entered value because state lives above the steps.
    </CompositionNote>
    <CompositionNote>
      Colour, spacing, and selection accents all come from Rialto tokens, so the flow inherits light
      and dark themes with no per-page overrides. The confirmation panel restates every input —
      dates, room, guest, and a masked card — as a <code>DataList</code>.
    </CompositionNote>
  </Stack>
);

/* ── Step panels ─────────────────────────────── */

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text variant="caption" className={styles.fieldError} role="alert">
      {message}
    </Text>
  );
}

interface DatesStepProps {
  state: BookingWizardState;
  errors: FieldErrors;
  onChange: (patch: Partial<BookingWizardState>) => void;
}

function DatesStep({ state, errors, onChange }: DatesStepProps) {
  return (
    <Stack gap="lg">
      <div className={styles.dateGrid}>
        <div>
          <DatePicker
            label="Check-in"
            placeholder="Select date"
            value={state.checkIn}
            onChange={(checkIn) => onChange({ checkIn })}
            locale="en-US"
          />
          <FieldError message={errors.checkIn} />
        </div>
        <div>
          <DatePicker
            label="Check-out"
            placeholder="Select date"
            value={state.checkOut}
            onChange={(checkOut) => onChange({ checkOut })}
            min={nextIsoDay(state.checkIn)}
            locale="en-US"
          />
          <FieldError message={errors.checkOut} />
        </div>
      </div>
    </Stack>
  );
}

interface RoomStepProps {
  state: BookingWizardState;
  errors: FieldErrors;
  onSelect: (roomId: string) => void;
}

function RoomStep({ state, errors, onSelect }: RoomStepProps) {
  return (
    <Stack gap="md">
      <div className={styles.roomGrid}>
        {ROOMS.map((room) => {
          const selected = state.roomId === room.id;
          return (
            <Button
              key={room.id}
              type="button"
              className={styles.roomCard}
              data-selected={selected}
              aria-pressed={selected}
              onClick={() => onSelect(room.id)}
            >
              <Text variant="label" as="span" className={styles.roomName}>
                {room.name}
              </Text>
              <Text variant="caption" color="secondary" as="span">
                {room.description}
              </Text>
              <Text variant="label" as="span" className={styles.roomPrice}>
                ${room.pricePerNight} / night
              </Text>
            </Button>
          );
        })}
      </div>
      <FieldError message={errors.roomId} />
    </Stack>
  );
}

interface GuestStepProps {
  guest: GuestInfo;
  errors: FieldErrors;
  onChange: (patch: Partial<GuestInfo>) => void;
}

function GuestStep({ guest, errors, onChange }: GuestStepProps) {
  return (
    <div className={styles.fieldGrid}>
      <Input
        label="First name"
        value={guest.firstName}
        onChange={(e) => onChange({ firstName: e.target.value })}
        error={Boolean(errors.firstName)}
        hint={errors.firstName}
      />
      <Input
        label="Last name"
        value={guest.lastName}
        onChange={(e) => onChange({ lastName: e.target.value })}
        error={Boolean(errors.lastName)}
        hint={errors.lastName}
      />
      <Input
        label="Email"
        type="email"
        value={guest.email}
        onChange={(e) => onChange({ email: e.target.value })}
        error={Boolean(errors.email)}
        hint={errors.email}
      />
      <Input
        label="Phone"
        value={guest.phone}
        onChange={(e) => onChange({ phone: e.target.value })}
        showOptional
      />
    </div>
  );
}

interface PaymentStepProps {
  payment: PaymentInfo;
  errors: FieldErrors;
  breakdown: ReturnType<typeof priceBreakdown>;
  onChange: (patch: Partial<PaymentInfo>) => void;
}

function PaymentStep({ payment, errors, breakdown, onChange }: PaymentStepProps) {
  return (
    <Stack gap="lg">
      {breakdown && (
        <Card className={styles.summary}>
          <Text variant="label" as="h3" className={styles.summaryTitle}>
            Price breakdown
          </Text>
          <DataList
            orientation="horizontal"
            striped
            items={[
              {
                label: `${breakdown.roomName} × ${breakdown.nights} night${
                  breakdown.nights === 1 ? "" : "s"
                }`,
                value: `$${breakdown.subtotal.toLocaleString("en-US")}`,
              },
              { label: "Taxes & fees", value: `$${breakdown.taxes.toLocaleString("en-US")}` },
              { label: "Total", value: `$${breakdown.total.toLocaleString("en-US")}` },
            ]}
          />
        </Card>
      )}
      <div className={styles.fieldGrid}>
        <Input
          label="Name on card"
          value={payment.cardName}
          onChange={(e) => onChange({ cardName: e.target.value })}
          error={Boolean(errors.cardName)}
          hint={errors.cardName}
        />
        <Input
          label="Card number"
          inputMode="numeric"
          placeholder="4242 4242 4242 4242"
          value={payment.cardNumber}
          onChange={(e) => onChange({ cardNumber: e.target.value })}
          error={Boolean(errors.cardNumber)}
          hint={errors.cardNumber}
        />
        <Input
          label="Expiry (MM/YY)"
          placeholder="08/28"
          value={payment.expiry}
          onChange={(e) => onChange({ expiry: e.target.value })}
          error={Boolean(errors.expiry)}
          hint={errors.expiry}
        />
        <Input
          label="Security code"
          inputMode="numeric"
          placeholder="123"
          value={payment.cvc}
          onChange={(e) => onChange({ cvc: e.target.value })}
          error={Boolean(errors.cvc)}
          hint={errors.cvc}
        />
      </div>
      <Text variant="caption" color="tertiary">
        This is a mock form — no card details are sent anywhere.
      </Text>
    </Stack>
  );
}

function ConfirmationStep({ state }: { state: BookingWizardState }) {
  const breakdown = priceBreakdown(state);
  const items = [
    { label: "Check-in", value: state.checkIn ?? "—" },
    { label: "Check-out", value: state.checkOut ?? "—" },
    { label: "Nights", value: String(breakdown?.nights ?? 0) },
    { label: "Room", value: breakdown?.roomName ?? "—" },
    { label: "Guest", value: `${state.guest.firstName} ${state.guest.lastName}`.trim() || "—" },
    { label: "Email", value: state.guest.email || "—" },
    { label: "Payment", value: maskCardNumber(state.payment.cardNumber) },
    { label: "Total", value: breakdown ? `$${breakdown.total.toLocaleString("en-US")}` : "—" },
  ];

  return (
    <Stack gap="lg">
      <div className={styles.statusRegion} role="status">
        <Badge variant="success" dot>
          Booking confirmed
        </Badge>
      </div>
      <Text variant="display" as="h2">
        You&apos;re all set
      </Text>
      <Text variant="body" color="secondary">
        Here&apos;s everything you booked. In a real app this is where the reservation would be
        created.
      </Text>
      <Card className={styles.summary}>
        <Text variant="label" as="h3" className={styles.summaryTitle}>
          Reservation summary
        </Text>
        <DataList items={items} orientation="horizontal" striped />
      </Card>
    </Stack>
  );
}

/* ── Page ────────────────────────────────────── */

export function BookingWizardExamplePage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<BookingWizardState>(INITIAL_WIZARD_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});

  const patch = (next: Partial<BookingWizardState>) => {
    setData((prev) => ({ ...prev, ...next }));
    setErrors({});
  };
  const patchGuest = (next: Partial<GuestInfo>) => {
    setData((prev) => ({ ...prev, guest: { ...prev.guest, ...next } }));
    setErrors({});
  };
  const patchPayment = (next: Partial<PaymentInfo>) => {
    setData((prev) => ({ ...prev, payment: { ...prev.payment, ...next } }));
    setErrors({});
  };

  const handleContinue = () => {
    const result = attemptAdvance(step, data);
    setErrors(result.errors);
    setStep(result.step);
  };
  const handleBack = () => {
    setErrors({});
    setStep(goBack(step));
  };
  const handleReset = () => {
    setData(INITIAL_WIZARD_STATE);
    setErrors({});
    setStep(0);
  };

  const isLast = step === LAST_STEP_INDEX;

  return (
    <ExamplePageLayout
      name="Booking Wizard"
      description="Five-step booking flow with a stepper, per-step validation, and state-preserving back-navigation"
      sourceJsx={WIZARD_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <div className={styles.wizard}>
        <Steps steps={WIZARD_STEPS} currentStep={step} />

        <Card className={styles.panel}>
          {step === 0 && <DatesStep state={data} errors={errors} onChange={patch} />}
          {step === 1 && (
            <RoomStep state={data} errors={errors} onSelect={(roomId) => patch({ roomId })} />
          )}
          {step === 2 && <GuestStep guest={data.guest} errors={errors} onChange={patchGuest} />}
          {step === 3 && (
            <PaymentStep
              payment={data.payment}
              errors={errors}
              breakdown={priceBreakdown(data)}
              onChange={patchPayment}
            />
          )}
          {step === 4 && <ConfirmationStep state={data} />}
        </Card>

        <div className={styles.actions}>
          {step > 0 && !isLast && (
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          )}
          {!isLast && (
            <Button variant="primary" onClick={handleContinue}>
              Continue
            </Button>
          )}
          {isLast && (
            <Button variant="secondary" onClick={handleReset}>
              Start over
            </Button>
          )}
        </div>
      </div>
    </ExamplePageLayout>
  );
}

BookingWizardExamplePage.displayName = "BookingWizardExamplePage";
