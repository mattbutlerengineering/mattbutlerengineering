export interface VenueGroup {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown> | null;
  createdAt: string;
}

export interface Venue {
  id: string;
  venueGroupId: string | null;
  venueGroup?: VenueGroup;
  name: string;
  slug: string;
  ianaTimezone: string;
  currencyCode: string;
  operatingHours: OperatingHours | null;
  settings: VenueSettings | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperatingHours {
  monday?: DaySchedule;
  tuesday?: DaySchedule;
  wednesday?: DaySchedule;
  thursday?: DaySchedule;
  friday?: DaySchedule;
  saturday?: DaySchedule;
  sunday?: DaySchedule;
}

export interface DaySchedule {
  open: string; // "09:00" 24-hour format
  close: string; // "22:00"
  closed?: boolean;
}

export interface PacingRule {
  maxCoversPerSlot: number;
  timeWindowMinutes?: number; // override slot interval
}

export interface DurationRule {
  minPartySize: number;
  maxPartySize: number;
  durationMinutes: number;
}

export interface VenueSettings {
  defaultReservationDuration?: number; // minutes
  maxPartySize?: number;
  minAdvanceBooking?: number; // hours
  maxAdvanceBooking?: number; // days
  requirePhone?: boolean;
  requireEmail?: boolean;
  confirmationEmailEnabled?: boolean;
  reminderEmailEnabled?: boolean;
  // Availability settings
  slotIntervalMinutes?: number; // default 15
  lastSeatingBuffer?: number; // minutes before close, default 90
  holdDurationMinutes?: number; // default 10
  pacingRules?: PacingRule[];
  durationRules?: DurationRule[];
  /**
   * Number of no-shows that triggers automatic deposit requirement.
   * Risky guests (at or above this threshold) will always see the deposit step.
   * Default: 2
   */
  autoDepositAfterNoShows?: number;
}

export type DepositType = "flat" | "per_person";

export interface DepositConfig {
  enabled: boolean;
  depositType: DepositType | null;
  amountCents: number | null;
  currency: string;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
}

export interface CreateVenueGroupRequest {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
}

export interface UpdateVenueGroupRequest {
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
}

export interface CreateVenueRequest {
  venueGroupId?: string;
  name: string;
  slug: string;
  ianaTimezone: string;
  currencyCode?: string;
  operatingHours?: OperatingHours;
  settings?: VenueSettings;
}

export interface UpdateVenueRequest {
  venueGroupId?: string | null;
  name?: string;
  slug?: string;
  ianaTimezone?: string;
  currencyCode?: string;
  operatingHours?: OperatingHours | null;
  settings?: VenueSettings | null;
}

/**
 * Deposit policy portion of the public (unauthenticated) venue-config response.
 * Mirrors `Venue`'s deposit fields but omits `currency` — the public response
 * carries currency separately as `PublicVenueConfig.currencyCode`.
 */
export interface PublicVenueDeposit {
  enabled: boolean;
  depositType: DepositType | null;
  amountCents: number | null;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
}

/** Subset of `VenueSettings` exposed on the public booking-widget config endpoint. */
export interface PublicVenueSettings {
  defaultReservationDuration?: number;
  maxPartySize?: number;
  maxAdvanceBooking?: number;
  slotIntervalMinutes?: number;
}

/** Response shape for `GET /public/v1/venues/:slug` (unauthenticated booking widget). */
export interface PublicVenueConfig {
  name: string;
  slug: string;
  ianaTimezone: string;
  currencyCode: string;
  operatingHours: OperatingHours | null;
  settings: PublicVenueSettings;
  deposit: PublicVenueDeposit;
}

/** Request body for `POST /public/v1/venues/:slug/deposits/payment-intent`. */
export interface CreateDepositPaymentIntentRequest {
  reservationId: string;
  guestEmail?: string;
  guestName?: string;
}

/** Response shape for `POST /public/v1/venues/:slug/deposits/payment-intent`. */
export interface DepositPaymentIntent {
  clientSecret: string;
  depositId: string;
  amountCents: number;
  currency: string;
}
