import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  DataList,
  Input,
  Select,
  Stack,
  Steps,
  Text,
  Toggle,
} from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./GuestCheckinExamplePage.module.css";

/* ── Fixture data (no service calls) ─────────── */

export interface Reservation {
  guestName: string;
  confirmationCode: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  partySize: number;
}

export const RESERVATION: Reservation = {
  guestName: "Priya Natarajan",
  confirmationCode: "RES-48213",
  checkIn: "2026-09-12",
  checkOut: "2026-09-15",
  roomType: "Harbor King",
  partySize: 2,
};

export interface RoomAssignmentOption {
  id: string;
  roomNumber: string;
  floor: string;
  view: string;
}

export const AVAILABLE_ROOMS: RoomAssignmentOption[] = [
  { id: "301", roomNumber: "301", floor: "3rd floor", view: "Harbor view" },
  { id: "412", roomNumber: "412", floor: "4th floor", view: "Courtyard view" },
  { id: "508", roomNumber: "508", floor: "5th floor", view: "Rooftop-adjacent" },
];

const ID_TYPES = [
  { value: "drivers-license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "national-id", label: "National ID" },
];

/* ── Steps ───────────────────────────────────── */

type CheckinStepId = "arrival" | "identity" | "room" | "key";

interface CheckinStepDef {
  id: CheckinStepId;
  label: string;
  description: string;
}

const CHECKIN_STEPS: CheckinStepDef[] = [
  { id: "arrival", label: "Arrival", description: "Look up the reservation" },
  { id: "identity", label: "Identity", description: "Verify a photo ID" },
  { id: "room", label: "Room", description: "Assign a room" },
  { id: "key", label: "Key handoff", description: "Issue the room key" },
];

const LAST_STEP_INDEX = CHECKIN_STEPS.length - 1;

/* ── State ───────────────────────────────────── */

interface IdentityInfo {
  idType: string | null;
  idNumber: string;
  photoMatches: boolean;
}

interface CheckinState {
  arrivalConfirmed: boolean;
  identity: IdentityInfo;
  roomId: string | null;
}

const INITIAL_CHECKIN_STATE: CheckinState = {
  arrivalConfirmed: false,
  identity: { idType: null, idNumber: "", photoMatches: false },
  roomId: null,
};

/* ── Validation ──────────────────────────────── */

type FieldErrors = Record<string, string>;

function validateArrival(state: CheckinState): FieldErrors {
  return state.arrivalConfirmed
    ? {}
    : { arrivalConfirmed: "Confirm the guest has arrived to continue." };
}

function validateIdentity(state: CheckinState): FieldErrors {
  const errors: FieldErrors = {};
  const { idType, idNumber, photoMatches } = state.identity;
  if (!idType) errors.idType = "Select the type of ID presented.";
  if (!idNumber.trim()) errors.idNumber = "Enter the ID number.";
  if (!photoMatches) errors.photoMatches = "Confirm the photo matches the guest.";
  return errors;
}

function validateRoom(state: CheckinState): FieldErrors {
  return state.roomId ? {} : { roomId: "Assign a room to continue." };
}

const STEP_VALIDATORS: Record<number, (state: CheckinState) => FieldErrors> = {
  0: validateArrival,
  1: validateIdentity,
  2: validateRoom,
  3: () => ({}),
};

function validateStep(stepIndex: number, state: CheckinState): FieldErrors {
  const validator = STEP_VALIDATORS[stepIndex];
  return validator ? validator(state) : {};
}

/* ── Navigation ──────────────────────────────── */

interface AdvanceResult {
  step: number;
  errors: FieldErrors;
  advanced: boolean;
}

function attemptAdvance(current: number, state: CheckinState): AdvanceResult {
  const errors = validateStep(current, state);
  if (Object.keys(errors).length > 0) {
    return { step: current, errors, advanced: false };
  }
  const next = Math.min(current + 1, LAST_STEP_INDEX);
  return { step: next, errors: {}, advanced: next !== current };
}

function goBack(current: number): number {
  return Math.max(0, current - 1);
}

/* ── Source JSX constant (shown in the "Copy JSX" panel) ── */

const CHECKIN_EXAMPLE_JSX = `const [step, setStep] = useState(0);
const [data, setData] = useState(INITIAL_CHECKIN_STATE);
const [errors, setErrors] = useState({});

function handleContinue() {
  const result = attemptAdvance(step, data);
  setErrors(result.errors);
  setStep(result.step);
}

<Steps steps={CHECKIN_STEPS} currentStep={step} />
{/* one panel per step: arrival → identity → room → key handoff */}
<Button variant="ghost" onClick={() => setStep(goBack(step))}>Back</Button>
<Button variant="primary" onClick={handleContinue}>Continue</Button>`;

/* ── Composition notes ───────────────────────── */

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      One <code>Steps</code> indicator tracks progress across four panels — arrival, identity
      verification, room assignment, and key handoff. Every navigation decision comes from a
      framework-free step machine mirroring the booking-wizard example, so back-navigation keeps
      every entered value because state lives above the steps.
    </CompositionNote>
    <CompositionNote>
      Per-step validation blocks <code>Continue</code> until the arrival is confirmed, an ID is
      recorded, and a room is assigned, surfacing field errors from a plain <code>Select</code> /
      <code>Input</code> / <code>Toggle</code> combination — no live lookups, just the fixture
      reservation and room list above.
    </CompositionNote>
    <CompositionNote>
      Colour, spacing, and selection accents all come from Rialto tokens, so the flow inherits light
      and dark themes with no per-page overrides. The key-handoff panel restates the guest, verified
      ID, and assigned room as a <code>DataList</code>.
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

function ArrivalStep({
  state,
  errors,
  onChange,
}: {
  state: CheckinState;
  errors: FieldErrors;
  onChange: (patch: Partial<CheckinState>) => void;
}) {
  return (
    <Stack gap="lg">
      <Card className={styles.summary}>
        <Text variant="label" as="h3" className={styles.summaryTitle}>
          Reservation on file
        </Text>
        <DataList
          orientation="horizontal"
          striped
          items={[
            { label: "Guest", value: RESERVATION.guestName },
            { label: "Confirmation", value: RESERVATION.confirmationCode },
            { label: "Dates", value: `${RESERVATION.checkIn} → ${RESERVATION.checkOut}` },
            { label: "Room type", value: RESERVATION.roomType },
            { label: "Party size", value: String(RESERVATION.partySize) },
          ]}
        />
      </Card>
      <div>
        <Toggle
          label="Confirm the guest has arrived"
          checked={state.arrivalConfirmed}
          onCheckedChange={(arrivalConfirmed) => onChange({ arrivalConfirmed })}
        />
        <FieldError message={errors.arrivalConfirmed} />
      </div>
    </Stack>
  );
}

function IdentityStep({
  identity,
  errors,
  onChange,
}: {
  identity: IdentityInfo;
  errors: FieldErrors;
  onChange: (patch: Partial<IdentityInfo>) => void;
}) {
  return (
    <Stack gap="lg">
      <div className={styles.fieldGrid}>
        <div>
          <Select
            label="ID type"
            options={ID_TYPES}
            value={identity.idType ?? undefined}
            onChange={(idType) => onChange({ idType })}
            error={Boolean(errors.idType)}
            hint={errors.idType}
          />
        </div>
        <Input
          label="ID number"
          value={identity.idNumber}
          onChange={(e) => onChange({ idNumber: e.target.value })}
          error={Boolean(errors.idNumber)}
          hint={errors.idNumber}
        />
      </div>
      <div>
        <Toggle
          label="Photo matches the guest"
          checked={identity.photoMatches}
          onCheckedChange={(photoMatches) => onChange({ photoMatches })}
        />
        <FieldError message={errors.photoMatches} />
      </div>
    </Stack>
  );
}

function RoomStep({
  state,
  errors,
  onSelect,
}: {
  state: CheckinState;
  errors: FieldErrors;
  onSelect: (roomId: string) => void;
}) {
  return (
    <Stack gap="md">
      <div className={styles.roomGrid}>
        {AVAILABLE_ROOMS.map((room) => {
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
                Room {room.roomNumber}
              </Text>
              <Text variant="caption" color="secondary" as="span">
                {room.floor} · {room.view}
              </Text>
            </Button>
          );
        })}
      </div>
      <FieldError message={errors.roomId} />
    </Stack>
  );
}

function KeyHandoffStep({ state }: { state: CheckinState }) {
  const room = AVAILABLE_ROOMS.find((candidate) => candidate.id === state.roomId);
  const idTypeLabel = ID_TYPES.find((option) => option.value === state.identity.idType)?.label;
  const items = [
    { label: "Guest", value: RESERVATION.guestName },
    { label: "Confirmation", value: RESERVATION.confirmationCode },
    { label: "ID verified", value: idTypeLabel ?? "—" },
    { label: "Room", value: room?.roomNumber ?? "—" },
    { label: "Floor", value: room?.floor ?? "—" },
  ];

  return (
    <Stack gap="lg">
      <div className={styles.statusRegion} role="status">
        <Badge variant="success" dot>
          Key issued
        </Badge>
      </div>
      <Text variant="display" as="h2">
        Welcome, {RESERVATION.guestName.split(" ")[0]}
      </Text>
      <Text variant="body" color="secondary">
        The room key has been issued. In a real app this is where the door lock would be
        provisioned.
      </Text>
      <Card className={styles.summary}>
        <Text variant="label" as="h3" className={styles.summaryTitle}>
          Check-in summary
        </Text>
        <DataList items={items} orientation="horizontal" striped />
      </Card>
    </Stack>
  );
}

/* ── Page ────────────────────────────────────── */

export function GuestCheckinExamplePage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CheckinState>(INITIAL_CHECKIN_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});

  const patch = (next: Partial<CheckinState>) => {
    setData((prev) => ({ ...prev, ...next }));
    setErrors({});
  };
  const patchIdentity = (next: Partial<IdentityInfo>) => {
    setData((prev) => ({ ...prev, identity: { ...prev.identity, ...next } }));
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
    setData(INITIAL_CHECKIN_STATE);
    setErrors({});
    setStep(0);
  };

  const isLast = step === LAST_STEP_INDEX;

  return (
    <ExamplePageLayout
      name="Guest Checkin"
      description="Four-step guest check-in flow with a stepper, per-step validation, and state-preserving back-navigation"
      sourceJsx={CHECKIN_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <div className={styles.checkin}>
        <Steps steps={CHECKIN_STEPS} currentStep={step} />

        <Card className={styles.panel}>
          {step === 0 && <ArrivalStep state={data} errors={errors} onChange={patch} />}
          {step === 1 && (
            <IdentityStep identity={data.identity} errors={errors} onChange={patchIdentity} />
          )}
          {step === 2 && (
            <RoomStep state={data} errors={errors} onSelect={(roomId) => patch({ roomId })} />
          )}
          {step === 3 && <KeyHandoffStep state={data} />}
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

GuestCheckinExamplePage.displayName = "GuestCheckinExamplePage";
