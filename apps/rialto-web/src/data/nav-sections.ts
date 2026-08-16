/**
 * Nav sections — derived from the PageRegistry.
 *
 * The canonical page inventory lives in page-registry.ts.
 * This file derives the nav structure from it and re-exports the
 * types/constants that the rest of the app depends on.
 */

import { REGISTRY_NAV_SECTIONS } from "./page-registry.js";
import type { NavItem } from "./page-registry.js";
import { DEMO_ROUTES } from "./demo-routes.js";

export type { NavItem, NavSection } from "./page-registry.js";

// ---------------------------------------------------------------------------
// NAV_SECTIONS — derived from the registry (replaces hand-written list)
// ---------------------------------------------------------------------------

export const NAV_SECTIONS = REGISTRY_NAV_SECTIONS;

/** Total number of showcased components across all sections. */
export const COMPONENT_COUNT = NAV_SECTIONS.reduce(
  (total, section) => total + section.items.length,
  0
);

// ---------------------------------------------------------------------------
// Demo pages — full-page demos, not component showcases.
// These are separate from the registry (no lazy-load component, just links).
// ---------------------------------------------------------------------------

/** Full-page demo routes (not component showcases). */
export const DEMO_PAGES: readonly NavItem[] = [
  { id: "sign-in", label: "Sign In", path: DEMO_ROUTES.signIn },
  { id: "sign-up", label: "Sign Up", path: DEMO_ROUTES.signUp },
  { id: "dashboard", label: "Dashboard", path: DEMO_ROUTES.dashboard },
  { id: "drivers", label: "Drivers CRUD", path: DEMO_ROUTES.drivers },
  { id: "teams", label: "Team Create", path: DEMO_ROUTES.teamCreate },
  { id: "layouts", label: "Layout Demo", path: DEMO_ROUTES.layouts },
  { id: "telemetry", label: "Telemetry HUD", path: DEMO_ROUTES.telemetry },
] as const;
