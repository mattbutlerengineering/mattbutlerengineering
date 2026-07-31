export interface Project {
  title: string;
  description: string;
  /** The technologies actually used to build it, rendered inline on the card. */
  stack: readonly string[];
  href?: string; // undefined = no live link
}

export const PROJECTS: Project[] = [
  {
    title: "Rialto Design System",
    description:
      "A precision component library with 65+ components built on a warm neutral token system. " +
      "Every surface, radius, shadow, and motion value is tokenized — components compose, not collide.",
    stack: ["React", "TypeScript", "Vite", "Framer Motion", "CSS Modules"],
    href: "/rialto/",
  },
  {
    title: "Hospitality Platform",
    description:
      "A full-stack restaurant management app with Auth0 authentication, dark mode, " +
      "offline-capable PWA support, and route-level code splitting. Built on the Rialto design system.",
    stack: ["React", "Fastify", "Prisma", "PostgreSQL", "Auth0", "PWA"],
    href: "/hospitality/",
  },
];
