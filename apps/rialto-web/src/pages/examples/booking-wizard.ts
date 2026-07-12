/**
 * Booking-wizard step machine — pure logic for the five-step booking example.
 *
 * Framework-free so the navigation, validation, and pricing rules can be
 * unit-tested without React. The showcase page (BookingWizardExamplePage)
 * holds the state in React and delegates every decision here.
 *
 * Dates are single ISO `yyyy-mm-dd` strings (per the #3196 DatePicker decision —
 * no range API). ISO strings sort lexicographically, so `<`/`>` compares dates.
 */

/* ── Steps ───────────────────────────────────── */

export type WizardStepId = "dates" | "room" | "guest" | "payment" | "confirmation";

export interface WizardStepDef {
  id: WizardStepId;
  label: string;
  description: string;
}

export const WIZARD_STEPS: WizardStepDef[] = [
  { id: "dates", label: "Dates", description: "Check-in & check-out" },
  { id: "room", label: "Room", description: "Choose your room" },
  { id: "guest", label: "Guest", description: "Who is staying" },
  { id: "payment", label: "Payment", description: "Payment details" },
  { id: "confirmation", label: "Confirmation", description: "Review & confirm" },
];

/** Index of the terminal confirmation step. */
export const LAST_STEP_INDEX = WIZARD_STEPS.length - 1;

/* ── Fixture data (no service calls) ─────────── */

export interface RoomOption {
  id: string;
  name: string;
  description: string;
  /** Nightly rate in whole USD. */
  pricePerNight: number;
}

export const ROOMS: RoomOption[] = [
  {
    id: "garden-queen",
    name: "Garden Queen",
    description: "Queen bed with a private garden-facing balcony.",
    pricePerNight: 180,
  },
  {
    id: "harbor-king",
    name: "Harbor King",
    description: "King bed and a corner window over the harbor.",
    pricePerNight: 260,
  },
  {
    id: "rooftop-suite",
    name: "Rooftop Suite",
    description: "Two rooms, soaking tub, and rooftop terrace access.",
    pricePerNight: 420,
  },
];

/** Flat tax applied to the room subtotal in the mock price breakdown. */
export const TAX_RATE = 0.12;

/* ── State ───────────────────────────────────── */

export interface GuestInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface PaymentInfo {
  cardName: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
}

export interface BookingWizardState {
  checkIn: string | null;
  checkOut: string | null;
  roomId: string | null;
  guest: GuestInfo;
  payment: PaymentInfo;
}

export const INITIAL_WIZARD_STATE: BookingWizardState = {
  checkIn: null,
  checkOut: null,
  roomId: null,
  guest: { firstName: "", lastName: "", email: "", phone: "" },
  payment: { cardName: "", cardNumber: "", expiry: "", cvc: "" },
};

/* ── Date helpers ────────────────────────────── */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function isoToUtc(iso: string): number | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Number of nights between two ISO dates; 0 when unset, malformed, or out of order. */
export function nightsBetween(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const start = isoToUtc(checkIn);
  const end = isoToUtc(checkOut);
  if (start == null || end == null || end <= start) return 0;
  return Math.round((end - start) / MS_PER_DAY);
}

/** The ISO date one day after `iso`, or `undefined` when `iso` is unset/malformed. */
export function nextIsoDay(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const utc = isoToUtc(iso);
  if (utc == null) return undefined;
  return new Date(utc + MS_PER_DAY).toISOString().slice(0, 10);
}

/* ── Validation ──────────────────────────────── */

export type FieldErrors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDates(state: BookingWizardState): FieldErrors {
  const errors: FieldErrors = {};
  if (!state.checkIn) errors.checkIn = "Choose a check-in date.";
  if (!state.checkOut) errors.checkOut = "Choose a check-out date.";
  if (state.checkIn && state.checkOut && state.checkOut <= state.checkIn) {
    errors.checkOut = "Check-out must be after check-in.";
  }
  return errors;
}

export function validateRoom(state: BookingWizardState): FieldErrors {
  return state.roomId ? {} : { roomId: "Select a room to continue." };
}

export function validateGuest(state: BookingWizardState): FieldErrors {
  const errors: FieldErrors = {};
  const { firstName, lastName, email } = state.guest;
  if (!firstName.trim()) errors.firstName = "First name is required.";
  if (!lastName.trim()) errors.lastName = "Last name is required.";
  if (!email.trim()) errors.email = "Email is required.";
  else if (!EMAIL.test(email.trim())) errors.email = "Enter a valid email address.";
  return errors;
}

export function validatePayment(state: BookingWizardState): FieldErrors {
  const errors: FieldErrors = {};
  const { cardName, cardNumber, expiry, cvc } = state.payment;
  if (!cardName.trim()) errors.cardName = "Name on card is required.";
  if (!/^\d{16}$/.test(cardNumber.replace(/\s+/g, ""))) {
    errors.cardNumber = "Enter the 16-digit card number.";
  }
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry.trim())) {
    errors.expiry = "Use MM/YY format.";
  }
  if (!/^\d{3,4}$/.test(cvc.trim())) {
    errors.cvc = "Enter the 3-4 digit security code.";
  }
  return errors;
}

const STEP_VALIDATORS: Record<number, (state: BookingWizardState) => FieldErrors> = {
  0: validateDates,
  1: validateRoom,
  2: validateGuest,
  3: validatePayment,
  4: () => ({}),
};

/** Field errors for a given step; empty object means the step is complete. */
export function validateStep(stepIndex: number, state: BookingWizardState): FieldErrors {
  const validator = STEP_VALIDATORS[stepIndex];
  return validator ? validator(state) : {};
}

/** True when a step has no outstanding validation errors. */
export function isStepComplete(stepIndex: number, state: BookingWizardState): boolean {
  return Object.keys(validateStep(stepIndex, state)).length === 0;
}

/* ── Navigation ──────────────────────────────── */

export interface AdvanceResult {
  step: number;
  errors: FieldErrors;
  advanced: boolean;
}

/**
 * Attempt to move forward. Advances only when the current step validates;
 * otherwise the step is unchanged and the field errors are returned so the UI
 * can surface them. Never advances past the confirmation step.
 */
export function attemptAdvance(current: number, state: BookingWizardState): AdvanceResult {
  const errors = validateStep(current, state);
  if (Object.keys(errors).length > 0) {
    return { step: current, errors, advanced: false };
  }
  const next = Math.min(current + 1, LAST_STEP_INDEX);
  return { step: next, errors: {}, advanced: next !== current };
}

/** Move back one step, clamped at the first step. */
export function goBack(current: number): number {
  return Math.max(0, current - 1);
}

/* ── Pricing ─────────────────────────────────── */

export interface PriceBreakdown {
  nights: number;
  roomName: string;
  ratePerNight: number;
  subtotal: number;
  taxes: number;
  total: number;
}

/**
 * Mock price breakdown for the selected room and stay length. Returns `null`
 * when a room has not been chosen or the dates do not form at least one night.
 */
export function priceBreakdown(state: BookingWizardState): PriceBreakdown | null {
  const room = ROOMS.find((candidate) => candidate.id === state.roomId);
  const nights = nightsBetween(state.checkIn, state.checkOut);
  if (!room || nights === 0) return null;
  const subtotal = room.pricePerNight * nights;
  const taxes = Math.round(subtotal * TAX_RATE);
  return {
    nights,
    roomName: room.name,
    ratePerNight: room.pricePerNight,
    subtotal,
    taxes,
    total: subtotal + taxes,
  };
}

/** Mask all but the last four digits of a card number for confirmation display. */
export function maskCardNumber(cardNumber: string): string {
  const digits = cardNumber.replace(/\D+/g, "");
  if (digits.length < 4) return "••••";
  return `•••• •••• •••• ${digits.slice(-4)}`;
}
