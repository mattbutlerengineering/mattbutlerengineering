import type { Venue } from "./venue.js";
import type { Reservation } from "./reservation.js";

export type CommunicationPreference = "email_only" | "sms_only" | "both" | "transactional_only";

export interface StaffNote {
  text: string;
  createdBy: string;
  createdAt: string;
}

export type GuestRiskScore = "trusted" | "standard" | "risky";

export interface Guest {
  id: string;
  venueId: string;
  venue?: Venue;
  email: string | null;
  phone: string | null;
  name: string;
  notes: string | null;
  visitCount: number;
  /** Number of NO_SHOW reservations for this guest at this venue. */
  noShowCount: number;
  /** Computed risk score based on no-show history. */
  riskScore: GuestRiskScore;
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

/**
 * Response shape for `GET /public/v1/venues/:slug/guest-risk` (unauthenticated booking widget).
 *
 * Intentionally omits `noShowCount` — this endpoint is public and unauthenticated, and a raw
 * no-show count is behavioral CRM PII that must never be exposed to anonymous callers. Only the
 * derived `riskScore`/`requiresDeposit` fields the booking widget actually needs are returned.
 */
export interface GuestRiskResult {
  riskScore: GuestRiskScore;
  /** True when the guest's risk score warrants an automatic deposit requirement. */
  requiresDeposit: boolean;
}

/** Response shape for `GET /public/v1/venues/:slug/guests/recognize` (unauthenticated booking widget). */
export interface GuestRecognition {
  recognized: boolean;
  firstName: string | null;
  visitCount: number;
  hasPreferences: boolean;
  lastVisit: string | null;
}
