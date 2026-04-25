/**
 * Navigation sections data — single source of truth for dashboard sidebar.
 *
 * Each section groups related pages. Items without a section label
 * are top-level navigation (no collapsible header).
 */

import type { VenueReadiness, SetupStep } from "./hooks/useVenueReadiness.js";

export interface NavItem {
  id: string;
  label: string;
  path: string;
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
    { id: "profile", label: "Profile", path: "/profile" },
    { id: "settings", label: "Settings", path: "/settings" },
  ],
};

/* ── Admin ──────────────────────────────────── */

const ADMIN: NavSection = {
  label: "Admin",
  items: [
    { id: "admin", label: "Users", path: "/admin" },
  ],
};

/* ── Setup nav sections ─────────────────────── */

function buildSetupSections(readiness: VenueReadiness): readonly NavSection[] {
  const STEP_ORDER: SetupStep[] = ["onboarding", "operating-hours", "floor-plan"];

  const STEP_LABELS: Record<SetupStep, string> = {
    "onboarding": "Venue Basics",
    "operating-hours": "Set Operating Hours",
    "floor-plan": "Create Floor Plan",
  };

  const STEP_PATHS: Record<SetupStep, string> = {
    "onboarding": "/onboarding",
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
      path: STEP_PATHS[step],
      stepStatus: isCompleted ? "completed" : isCurrent ? "current" : "locked",
      disabled: isLocked,
    };
  });

  const setupSection: NavSection = {
    label: "Get Started",
    items,
  };

  return [setupSection, ACCOUNT, ADMIN];
}

/* ── Operational nav sections ───────────────── */

function buildOperationalSections(): readonly NavSection[] {
  const PRIMARY: NavSection = {
    items: [
      { id: "timeline", label: "Timeline", path: "/timeline" },
      { id: "reservations", label: "Reservations", path: "/reservations" },
      { id: "guests", label: "Guests", path: "/guests" },
      { id: "home", label: "Dashboard", path: "/dashboard" },
    ],
  };

  const MANAGE: NavSection = {
    label: "Manage",
    items: [
      { id: "floor-plans", label: "Floor Plans", path: "/floor-plans" },
      { id: "booking-widget", label: "Booking Widget", path: "/booking-widget" },
    ],
  };

  return [PRIMARY, MANAGE, ACCOUNT, ADMIN];
}

/* ── Public API ─────────────────────────────── */

export function buildNavSections(readiness: VenueReadiness): readonly NavSection[] {
  if (readiness.status !== "operational") {
    return buildSetupSections(readiness);
  }
  return buildOperationalSections();
}
