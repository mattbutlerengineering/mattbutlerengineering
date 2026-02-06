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
