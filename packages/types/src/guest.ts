import type { Venue } from "./venue.js";
import type { Reservation } from "./reservation.js";

export type CommunicationPreference = "email_only" | "sms_only" | "both" | "transactional_only";

export interface StaffNote {
  text: string;
  createdBy: string;
  createdAt: string;
}

export interface Guest {
  id: string;
  venueId: string;
  venue?: Venue;
  email: string | null;
  phone: string | null;
  name: string;
  notes: string | null;
  visitCount: number;
  lifetimeSpend: string | null; // Decimal as string for precision
  lastVisit: string | null;
  tags: string[] | null;
  dietaryRestrictions: string[] | null;
  communicationPreference: CommunicationPreference;
  /** Staff-only notes. Never returned in public-facing API responses. */
  staffNotes: StaffNote[];
  reservations?: Reservation[];
  createdAt: string;
  updatedAt: string;
}

export interface LapsingGuest {
  guestId: string;
  name: string;
  email: string | null;
  phone: string | null;
  communicationPreference: CommunicationPreference;
  avgFrequencyDays: number;
  daysSinceLastVisit: number;
  daysOverdue: number;
}

export interface CreateGuestRequest {
  venueId: string;
  email?: string;
  phone?: string;
  name: string;
  notes?: string;
  tags?: string[];
  dietaryRestrictions?: string[];
}

export interface UpdateGuestRequest {
  email?: string | null;
  phone?: string | null;
  name?: string;
  notes?: string | null;
  tags?: string[] | null;
  dietaryRestrictions?: string[] | null;
}

export interface GuestSearchParams {
  venueId: string;
  query?: string; // Search name, email, or phone
  tags?: string[]; // Filter by tags
  hasNotVisitedInDays?: number; // For win-back segments
  minVisitCount?: number;
  maxVisitCount?: number;
}

export interface GuestSegment {
  name: string;
  description: string;
  count: number;
  guests?: Guest[];
}
