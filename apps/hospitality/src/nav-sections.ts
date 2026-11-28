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
import { availabilityPath } from "./components/availability/availability-address.js";
import { defaultT } from "./i18n/default-t.js";
import type { NavAction } from "./nav-actions.js";
import type { VenueReadiness } from "./hooks/useVenueReadiness.js";

export interface NavItem {
  id: string;
  label: string;
  action: NavAction;
  /** Short status text after the label, e.g. the pre-launch progress count */
  badge?: string;
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

/**
 * One Availability item in both readiness states: same id, destination and label, so the rail
 * nests under it either way. The Availability map it once sat beside is retired (#10032).
 */
const AVAILABILITY_ITEM_ID = "availability";
const AVAILABILITY_PATH = availabilityPath({ view: "hub" });
/** Launch steps counted in the pre-launch badge: venue basics, regular week, floor plan. */
const SETUP_STEP_COUNT = 3;

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
  const setupSection: NavSection = {
    id: "Get Started",
    label: t("nav.sections.getStarted"),
    items: [
      {
        id: AVAILABILITY_ITEM_ID,
        label: t("nav.items.availability"),
        action: { type: "route", path: AVAILABILITY_PATH },
        badge: t("setup.hub.strip.count", {
          done: readiness.completedSteps.length,
          total: SETUP_STEP_COUNT,
        }),
      },
    ],
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
      route("night", t("nav.items.night"), "/night"),
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
      route(AVAILABILITY_ITEM_ID, t("nav.items.availability"), AVAILABILITY_PATH),
      route("menus", t("nav.items.menus"), "/menus"),
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
  t: TFunction = defaultT
): readonly NavSection[] {
  if (readiness.status !== "operational") {
    return buildSetupSections(readiness, isAdmin, t);
  }
  return buildOperationalSections(isAdmin, t);
}
