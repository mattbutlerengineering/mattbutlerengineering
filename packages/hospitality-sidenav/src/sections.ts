/**
 * Section definitions, moved from `apps/hospitality/src/nav-sections.ts` plus the sign-out and
 * chat items that `DashboardLayout` used to splice in. Pure: the same props always give the same
 * sections, so the command palette can call it too.
 */

import { translate, type CatalogKey } from "./i18n.js";
import type { NavItem, NavSection, SideNavProps } from "./types.js";

/** Section ids are the en-US labels, which is what collapse state was first persisted under. */
export const ACCOUNT_SECTION_ID = "Account";

const SETUP_ITEM_ID = "setup";
/** The Availability map; hospitality's `availabilityPath({ view: "map" })`. */
const SETUP_PATH = "/availability/map";
const AVAILABILITY_PATH = "/availability";
/** Launch steps counted in the pre-launch badge: venue basics, regular week, floor plan. */
const SETUP_STEP_COUNT = 3;

type Translate = (key: CatalogKey, params?: Readonly<Record<string, string | number>>) => string;

const route = (id: string, label: string, path: string): NavItem => ({
  id,
  label,
  action: { type: "route", path },
});

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

const section = (value: NavSection): NavSection =>
  freeze({ ...value, items: freeze([...value.items]) });

function account(t: Translate): NavSection {
  return section({
    id: ACCOUNT_SECTION_ID,
    label: t("nav.sections.account"),
    items: [
      route("profile", t("nav.items.profile"), "/profile"),
      route("settings", t("nav.items.settings"), "/settings"),
      { id: "signout", label: t("nav.items.signOut"), action: { type: "signout" } },
    ],
  });
}

function admin(t: Translate): NavSection {
  return section({
    id: "Admin",
    label: t("nav.sections.admin"),
    items: [route("admin", t("nav.items.users"), "/admin")],
  });
}

function tools(t: Translate): NavSection {
  return section({
    id: "Tools",
    label: t("nav.sections.tools"),
    items: [{ id: "chat", label: t("nav.items.chat"), action: { type: "chat" } }],
  });
}

function setupSections(props: SideNavProps, t: Translate): readonly NavSection[] {
  const getStarted = section({
    id: "Get Started",
    label: t("nav.sections.getStarted"),
    items: [
      {
        ...route(SETUP_ITEM_ID, t("nav.items.venueSetup"), SETUP_PATH),
        badge: t("setup.count", { done: props.readiness.steps.length, total: SETUP_STEP_COUNT }),
      },
    ],
  });
  return props.flags.isAdmin ? [getStarted, account(t), admin(t)] : [getStarted, account(t)];
}

function operationalSections(props: SideNavProps, t: Translate): readonly NavSection[] {
  const primary = section({
    items: [
      route("briefing", t("nav.items.tonightsService"), "/briefing"),
      route("timeline", t("nav.items.timeline"), "/timeline"),
      route("reservations", t("nav.items.reservations"), "/reservations"),
      route("waitlist", t("nav.items.waitlist"), "/waitlist"),
      route("guests", t("nav.items.guests"), "/guests"),
      route("home", t("nav.items.dashboard"), "/dashboard"),
    ],
  });
  const manage = section({
    id: "Manage",
    label: t("nav.sections.manage"),
    items: [
      route("availability", t("nav.items.availability"), AVAILABILITY_PATH),
      route(SETUP_ITEM_ID, t("nav.items.venueSetup"), SETUP_PATH),
      route("menus", t("nav.items.menus"), "/menus"),
      route("booking-widget", t("nav.items.bookingWidget"), "/booking-widget"),
    ],
  });
  return props.flags.isAdmin
    ? [primary, manage, account(t), admin(t)]
    : [primary, manage, account(t)];
}

export function sections(props: SideNavProps): readonly NavSection[] {
  const t: Translate = (key, params) => translate(props.locale, key, params);
  const base =
    props.readiness.status === "operational"
      ? operationalSections(props, t)
      : setupSections(props, t);
  return freeze([...base, tools(t)]);
}
