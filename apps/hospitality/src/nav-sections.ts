/**
 * Navigation sections data — single source of truth for dashboard sidebar.
 *
 * Each section groups related pages. Items without a section label
 * are top-level navigation (no collapsible header).
 *
 * Labels are resolved through the caller's `t` (default: the dashboard's
 * runtime) so the sidebar and command palette follow the active locale.
 */

import type { TFunction } from "i18next";
import { localeRuntime } from "./i18n/runtime.js";
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
  /**
   * Locale-independent identity (collapse state is persisted under it, so a
   * language switch doesn't reset it). Falls back to `label` when absent.
   */
  id?: string;
  label?: string;
  items: NavItem[];
}

/** Section ids — the en-US labels, which is what collapse state was first persisted under. */
export const ACCOUNT_SECTION_ID = "Account";

const defaultT = (): TFunction => localeRuntime.i18n.t;

/* ── Account ────────────────────────────────── */

function buildAccount(t: TFunction): NavSection {
  return {
    id: ACCOUNT_SECTION_ID,
    label: t("nav.sections.account"),
    items: [
      { id: "profile", label: t("nav.items.profile"), action: { type: "route", path: "/profile" } },
      {
        id: "settings",
        label: t("nav.items.settings"),
        action: { type: "route", path: "/settings" },
      },
    ],
  };
}

/* ── Admin ──────────────────────────────────── */

function buildAdmin(t: TFunction): NavSection {
  return {
    id: "Admin",
    label: t("nav.sections.admin"),
    items: [
      { id: "admin", label: t("nav.items.users"), action: { type: "route", path: "/admin" } },
    ],
  };
}

/* ── Setup nav sections ─────────────────────── */

function buildSetupSections(
  readiness: VenueReadiness,
  isAdmin: boolean,
  t: TFunction
): readonly NavSection[] {
  const STEP_ORDER: SetupStep[] = ["onboarding", "operating-hours", "floor-plan"];

  const STEP_LABELS: Record<SetupStep, string> = {
    onboarding: t("nav.items.venueBasics"),
    "operating-hours": t("nav.items.setOperatingHours"),
    "floor-plan": t("nav.items.createFloorPlan"),
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
    id: "Get Started",
    label: t("nav.sections.getStarted"),
    items,
  };

  const account = buildAccount(t);
  return isAdmin ? [setupSection, account, buildAdmin(t)] : [setupSection, account];
}

/* ── Operational nav sections ───────────────── */

function buildOperationalSections(isAdmin: boolean, t: TFunction): readonly NavSection[] {
  const route = (id: string, label: string, path: string): NavItem => ({
    id,
    label,
    action: { type: "route", path },
  });

  const PRIMARY: NavSection = {
    items: [
      route("briefing", t("nav.items.tonightsService"), "/briefing"),
      route("timeline", t("nav.items.timeline"), "/timeline"),
      route("reservations", t("nav.items.reservations"), "/reservations"),
      route("waitlist", t("nav.items.waitlist"), "/waitlist"),
      route("guests", t("nav.items.guests"), "/guests"),
      route("home", t("nav.items.dashboard"), "/dashboard"),
    ],
  };

  const MANAGE: NavSection = {
    id: "Manage",
    label: t("nav.sections.manage"),
    items: [
      route("floor-plans", t("nav.items.floorPlans"), "/floor-plans"),
      route("booking-widget", t("nav.items.bookingWidget"), "/booking-widget"),
    ],
  };

  const account = buildAccount(t);
  return isAdmin ? [PRIMARY, MANAGE, account, buildAdmin(t)] : [PRIMARY, MANAGE, account];
}

/* ── Public API ─────────────────────────────── */

export function buildNavSections(
  readiness: VenueReadiness,
  isAdmin: boolean,
  t: TFunction = defaultT()
): readonly NavSection[] {
  if (readiness.status !== "operational") {
    return buildSetupSections(readiness, isAdmin, t);
  }
  return buildOperationalSections(isAdmin, t);
}
