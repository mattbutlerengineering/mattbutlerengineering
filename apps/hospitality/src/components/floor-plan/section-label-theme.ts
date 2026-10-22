/**
 * The colours `SectionZone` paints its name with.
 *
 * A section's name used to be drawn in the section's own colour straight onto
 * the canvas. Once a floor texture can sit underneath it, that stops being
 * legible: measured against the five committed textures (see
 * `floor-textures.test.ts`), **no** single text colour clears WCAG AA 4.5:1 on
 * all of them — white fails on hardwood, concrete, tile and marble; black fails
 * on carpet. So the name is drawn on an **opaque** plate instead, which makes
 * its contrast a property of two rialto tokens rather than of whatever floor
 * happens to be beneath it.
 *
 * Konva can't consume `var(--rialto-*)` — a canvas `fillStyle` needs a literal
 * colour — so the tokens are resolved from the live document at render time and
 * re-resolved when `data-theme` flips. This is the documented exception in
 * `apps/hospitality/CLAUDE.md`, and the same approach `TableShape` already
 * takes for table fills.
 */

import { useEffect, useState } from "react";

export interface SectionLabelTheme {
  /** Opaque plate behind the name. */
  plate: string;
  /** The name itself. */
  text: string;
}

/** rialto custom properties backing each colour above. */
export const SECTION_LABEL_TOKENS = {
  plate: "--rialto-surface",
  text: "--rialto-text-primary",
} as const;

/**
 * Used only when a custom property hasn't resolved yet (before the stylesheet
 * paints, or `getComputedStyle` returning "" outside a browser). Mirrors
 * `packages/rialto/src/tokens/colors.css`; `SectionZone.test.tsx` reads that
 * file directly and fails if these fall out of sync or stop clearing AA.
 */
export const SECTION_LABEL_FALLBACKS: Record<"light" | "dark", SectionLabelTheme> = {
  light: { plate: "#f8f6f3", text: "#1a1918" },
  dark: { plate: "#1e1c1a", text: "rgb(253 252 250 / 0.92)" },
};

export function resolveSectionLabelTheme(): SectionLabelTheme {
  const theme: "light" | "dark" =
    document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const fallback = SECTION_LABEL_FALLBACKS[theme];
  const computed = getComputedStyle(document.documentElement);
  return {
    plate: computed.getPropertyValue(SECTION_LABEL_TOKENS.plate).trim() || fallback.plate,
    text: computed.getPropertyValue(SECTION_LABEL_TOKENS.text).trim() || fallback.text,
  };
}

/** Tracks the active theme so a light/dark switch repaints section names without a reload. */
export function useSectionLabelTheme(): SectionLabelTheme {
  const [theme, setTheme] = useState(resolveSectionLabelTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(resolveSectionLabelTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
