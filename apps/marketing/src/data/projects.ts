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
      "A precision component library with 55+ components built on a warm neutral token system. " +
      "Every surface, radius, shadow, and motion value is tokenized — components compose, not collide.",
    tags: ["React", "TypeScript", "Vite", "Framer Motion"],
    href: "/rialto",
  },
  {
    title: "Hospitality App",
    description:
      "A reservation management system with role-based access control and real-time availability. " +
      "Auth0 integration, Fastify backend, and a PostgreSQL database — end-to-end ownership.",
    tags: ["React", "Auth0", "Fastify", "PostgreSQL"],
    href: "/hospitality",
  },
  {
    title: "mattbutlerengineering.com",
    description:
      "This site is the engineering proof — a Turborepo monorepo with Pulumi IaC, a custom design system, " +
      "and three apps deployed under one domain. The portfolio is the product.",
    tags: ["Turborepo", "Pulumi", "Rialto", "DigitalOcean"],
    href: "/rialto",
  },
  {
    title: "Agent System",
    description:
      "An AI agent session runner that spins up isolated git worktrees, executes Claude tasks, " +
      "and opens pull requests — fully automated, cost-capped, and cancellable via CLI.",
    tags: ["Claude API", "Fastify", "Prisma", "Git Worktrees"],
  },
  {
    title: "MBE CLI",
    description:
      "A unified developer CLI for managing agent sessions, user accounts, and auth flows. " +
      "Single binary wrapping the full monorepo surface — users, agents, and authentication.",
    tags: ["TypeScript", "Commander", "Auth0", "Fastify"],
  },
];
