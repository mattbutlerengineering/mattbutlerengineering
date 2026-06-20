/**
 * Nav sections — derived from the PageRegistry.
 *
 * The canonical page inventory lives in page-registry.ts.
 * This file derives the nav structure from it and re-exports the
 * types/constants that the rest of the app depends on.
 */

import { REGISTRY_NAV_SECTIONS } from "./page-registry.js";
import type { NavItem } from "./page-registry.js";

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
  { id: "sign-in", label: "Sign In", path: "/demos/login" },
  { id: "sign-up", label: "Sign Up", path: "/demos/signup" },
  { id: "dashboard", label: "Dashboard", path: "/demos/dashboard" },
  { id: "drivers", label: "Drivers CRUD", path: "/demos/drivers" },
  { id: "teams", label: "Team Create", path: "/demos/teams/new" },
  { id: "layouts", label: "Layout Demo", path: "/demos/layouts" },
] as const;
