/**
 * Navigation sections data — single source of truth for dashboard sidebar.
 *
 * Each section groups related pages. Items without a section label
 * are top-level navigation (no collapsible header).
 */

import type { NavAction } from "./nav-actions.js";
import type { VenueReadiness, SetupStep } from "./hooks/useVenueReadiness.js";

export interface NavItem {
  id: string;
  label: string;
  action: NavAction;
  /** Setup step status — drives icon before the label */
  stepStatus?: "completed" | "current" | "locked";
  /** Prevents click and applies muted style */
  disabled?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/* ── Account ────────────────────────────────── */

const ACCOUNT: NavSection = {
  label: "Account",
  items: [
    { id: "profile", label: "Profile", action: { type: "route", path: "/profile" } },
    { id: "settings", label: "Settings", action: { type: "route", path: "/settings" } },
  ],
};

/* ── Admin ──────────────────────────────────── */

const ADMIN: NavSection = {
  label: "Admin",
  items: [{ id: "admin", label: "Users", action: { type: "route", path: "/admin" } }],
};

/* ── Setup nav sections ─────────────────────── */

function buildSetupSections(readiness: VenueReadiness, isAdmin: boolean): readonly NavSection[] {
  const STEP_ORDER: SetupStep[] = ["onboarding", "operating-hours", "floor-plan"];

  const STEP_LABELS: Record<SetupStep, string> = {
    onboarding: "Venue Basics",
    "operating-hours": "Set Operating Hours",
    "floor-plan": "Create Floor Plan",
  };

  const STEP_PATHS: Record<SetupStep, string> = {
    onboarding: "/onboarding",
    "operating-hours": "/setup/hours",
    "floor-plan": "/floor-plans",
  };

  const items: NavItem[] = STEP_ORDER.map((step) => {
    const isCompleted = readiness.completedSteps.includes(step);
    const isCurrent = readiness.nextStep === step;
    const isLocked = !isCompleted && !isCurrent;

    return {
      id: `setup-${step}`,
      label: STEP_LABELS[step],
      action: { type: "route", path: STEP_PATHS[step] },
      stepStatus: isCompleted ? "completed" : isCurrent ? "current" : "locked",
      disabled: isLocked,
    };
  });

  const setupSection: NavSection = {
    label: "Get Started",
    items,
  };

  return isAdmin ? [setupSection, ACCOUNT, ADMIN] : [setupSection, ACCOUNT];
}

/* ── Operational nav sections ───────────────── */

function buildOperationalSections(isAdmin: boolean): readonly NavSection[] {
  const PRIMARY: NavSection = {
    items: [
      { id: "briefing", label: "Tonight's Service", action: { type: "route", path: "/briefing" } },
      { id: "timeline", label: "Timeline", action: { type: "route", path: "/timeline" } },
      {
        id: "reservations",
        label: "Reservations",
        action: { type: "route", path: "/reservations" },
      },
      { id: "waitlist", label: "Waitlist", action: { type: "route", path: "/waitlist" } },
      { id: "guests", label: "Guests", action: { type: "route", path: "/guests" } },
      { id: "home", label: "Dashboard", action: { type: "route", path: "/dashboard" } },
    ],
  };

  const MANAGE: NavSection = {
    label: "Manage",
    items: [
      { id: "floor-plans", label: "Floor Plans", action: { type: "route", path: "/floor-plans" } },
      {
        id: "booking-widget",
        label: "Booking Widget",
        action: { type: "route", path: "/booking-widget" },
      },
    ],
  };

  return isAdmin ? [PRIMARY, MANAGE, ACCOUNT, ADMIN] : [PRIMARY, MANAGE, ACCOUNT];
}

/* ── Public API ─────────────────────────────── */

export function buildNavSections(
  readiness: VenueReadiness,
  isAdmin: boolean
): readonly NavSection[] {
  if (readiness.status !== "operational") {
    return buildSetupSections(readiness, isAdmin);
  }
  return buildOperationalSections(isAdmin);
}
