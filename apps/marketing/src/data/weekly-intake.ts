export interface WeeklyResource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly source: "js-weekly" | "react-weekly" | "ai-weekly" | "other";
  readonly description: string;
  readonly publishedAt: string;
  readonly tags: readonly string[];
}

export const weeklyResources: readonly WeeklyResource[] = [
  {
    id: "1",
    title: "JavaScript Weekly",
    url: "https://javascriptweekly.com",
    source: "js-weekly",
    description:
      "A weekly newsletter that curates the best JavaScript articles, tutorials, and packages from around the web.",
    publishedAt: "2026-04-29",
    tags: ["javascript", "newsletter", "weekly"],
  },
  {
    id: "2",
    title: "React Status",
    url: "https://react.statuscode.com",
    source: "react-weekly",
    description:
      "A weekly roundup of the latest React and React Native news, tutorials, and tools.",
    publishedAt: "2026-04-29",
    tags: ["react", "newsletter", "weekly"],
  },
  {
    id: "3",
    title: "AI Breakfast",
    url: "https://aibreakfast.beehiiv.com",
    source: "ai-weekly",
    description:
      "Daily insights on AI trends, tools, and breakthroughs to keep you ahead of the curve.",
    publishedAt: "2026-04-29",
    tags: ["ai", "newsletter", "weekly"],
  },
  {
    id: "4",
    title: "Frontend Focus",
    url: "https://frontendfoc.us",
    source: "other",
    description:
      "A weekly newsletter covering the latest in frontend development, CSS, frameworks, and tooling.",
    publishedAt: "2026-04-29",
    tags: ["frontend", "css", "newsletter"],
  },
  {
    id: "5",
    title: "Node Weekly",
    url: "https://nodeweekly.com",
    source: "js-weekly",
    description:
      "A weekly newsletter covering the latest Node.js news, packages, and best practices.",
    publishedAt: "2026-04-29",
    tags: ["nodejs", "backend", "newsletter"],
  },
];
