/**
 * Navigation sections data — single source of truth for dashboard sidebar.
 *
 * Each section groups related pages. Items without a section label
 * are top-level navigation (no collapsible header).
 */

export interface NavItem {
  id: string;
  label: string;
  path: string;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/* ── Primary navigation ─────────────────────── */

const PRIMARY: NavSection = {
  items: [
    { id: "home", label: "Home", path: "/" },
    { id: "timeline", label: "Timeline", path: "/timeline" },
    { id: "reservations", label: "Reservations", path: "/reservations" },
    { id: "guests", label: "Guests", path: "/guests" },
    { id: "floor-plans", label: "Floor Plans", path: "/floor-plans" },
    { id: "onboarding", label: "New Venue", path: "/onboarding" },
  ],
};

/* ── Account ────────────────────────────────── */

const ACCOUNT: NavSection = {
  label: "Account",
  items: [
    { id: "profile", label: "Profile", path: "/profile" },
    { id: "settings", label: "Settings", path: "/settings" },
  ],
};

/* ── Developer ──────────────────────────────── */

const DEVELOPER: NavSection = {
  label: "Developer",
  items: [
    { id: "booking-widget", label: "Booking Widget", path: "/booking-widget" },
  ],
};

/* ── Admin ──────────────────────────────────── */

const ADMIN: NavSection = {
  label: "Admin",
  items: [
    { id: "admin", label: "Users", path: "/admin" },
  ],
};

/* ── Exports ────────────────────────────────── */

export const NAV_SECTIONS: readonly NavSection[] = [PRIMARY, ACCOUNT, DEVELOPER, ADMIN];
