export interface Project {
  title: string;
  description: string;
  tags: string[];
  href?: string; // undefined = no live link
}

export const PROJECTS: Project[] = [
  {
    title: "Rialto Design System",
    description:
      "A precision component library with 65+ components built on a warm neutral token system. " +
      "Every surface, radius, shadow, and motion value is tokenized — components compose, not collide.",
    tags: ["React", "TypeScript", "Vite", "Framer Motion"],
    href: "/rialto",
  },
  {
    title: "Hospitality Platform",
    description:
      "A full-stack restaurant management app with Auth0 authentication, dark mode, " +
      "offline-capable PWA support, and route-level code splitting. Built on the Rialto design system.",
    tags: ["React", "Auth0", "PWA", "Fastify", "Prisma"],
    href: "/hospitality",
  },
];
