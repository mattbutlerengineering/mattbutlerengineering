import { PROJECTS } from "./projects.js";
import { TECH_STACK } from "./tech-stack.js";

export interface SiteStat {
  /** Numeric figure rendered via the Odometer rolling counter. */
  readonly value: number;
  /** Visible label describing the figure. */
  readonly label: string;
  /** Optional glyph shown after the value to signal an at-least figure (e.g. "+"). */
  readonly suffix?: string;
}

/** Total distinct technologies listed across every tech-stack category. */
const TECH_COUNT = TECH_STACK.reduce((sum, category) => sum + category.items.length, 0);

/**
 * Above-the-fold social-proof metrics. Every figure is derived from existing
 * site content — the featured PROJECTS list, the TECH_STACK, and the published
 * "65+ components" claim in the Rialto project description — so the strip stays
 * honest rather than advertising fabricated numbers.
 */
export const SITE_STATS: readonly SiteStat[] = [
  { value: PROJECTS.length, label: "Projects shipped" },
  { value: 65, suffix: "+", label: "Rialto components" },
  { value: TECH_COUNT, label: "Technologies in the stack" },
  { value: TECH_STACK.length, label: "Domains owned end-to-end" },
];
