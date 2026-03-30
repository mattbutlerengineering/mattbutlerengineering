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
];
