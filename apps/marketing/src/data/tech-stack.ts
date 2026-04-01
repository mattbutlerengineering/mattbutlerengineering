export interface TechCategory {
  title: string;
  items: string[];
}

export const TECH_STACK: TechCategory[] = [
  {
    title: "Frontend",
    items: ["React", "TypeScript", "Vite", "Framer Motion"],
  },
  {
    title: "Backend",
    items: ["Fastify", "Prisma", "PostgreSQL", "Node.js"],
  },
  {
    title: "Infrastructure",
    items: ["Cloudflare Workers", "DigitalOcean", "Pulumi", "Turborepo"],
  },
  {
    title: "Auth & DevOps",
    items: ["Auth0", "GitHub Actions", "Docker", "pnpm"],
  },
];
