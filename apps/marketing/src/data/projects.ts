export interface Project {
  title: string;
  description: string;
  /** The technologies actually used to build it, rendered inline on the card. */
  stack: readonly string[];
  href?: string; // undefined = no live link
}

/**
 * A short, demonstrative prompt for the Gen playground deep link — showcases
 * breadth by asking for several distinct component types in one generation.
 */
const GEN_DEMO_PROMPT =
  "A pricing card with a heading, a description, a badge, and a primary button";

export const PROJECTS: Project[] = [
  {
    title: "Rialto Design System",
    description:
      "A precision component library with 65+ components built on a warm neutral token system. " +
      "Every surface, radius, shadow, and motion value is tokenized — components compose, not collide.",
    stack: ["React", "TypeScript", "Vite", "Framer Motion", "CSS Modules"],
    // Deep-links to the Booking Wizard example — a composed multi-component
    // page — rather than the showcase landing page, so a first-time visitor
    // sees breadth in one view. Path derived per apps/rialto-web/src/data/
    // page-registry.ts (Examples category strips the "example-" id prefix).
    href: "/rialto/examples/booking-wizard",
  },
  {
    title: "Hospitality Platform",
    description:
      "A full-stack restaurant management app with Auth0 authentication, dark mode, " +
      "offline-capable PWA support, and route-level code splitting. Built on the Rialto design system.",
    stack: ["React", "Fastify", "Prisma", "PostgreSQL", "Auth0", "PWA"],
    href: "/hospitality/",
  },
  {
    title: "Gen Playground",
    description:
      "An AI-assisted UI generator that streams Rialto component trees from a plain-English " +
      "prompt, backed by a validated JSON spec format with live preview, history, and sharing.",
    stack: ["React", "TypeScript", "Fastify", "JSON Schema", "Zod"],
    href: `/gen/?prompt=${encodeURIComponent(GEN_DEMO_PROMPT)}`,
  },
];
