import { useState, useMemo, useCallback } from "react";
import type { CommandItem } from "@mattbutlerengineering/rialto";
import type { NavSection } from "../nav-sections.js";

/* ── Types ──────────────────────────────────────── */

interface UseCommandPaletteOptions {
  sections: readonly NavSection[];
  navigate: (path: string) => void;
  toggleTheme: () => void;
  signOut: () => void;
}

interface UseCommandPaletteResult {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly items: CommandItem[];
  readonly groups: string[];
}

/* ── Helpers ────────────────────────────────────── */

function sectionGroupName(section: NavSection): string {
  return section.label ?? "Navigation";
}

function buildNavItems(
  sections: readonly NavSection[],
  navigate: (path: string) => void
): CommandItem[] {
  return sections.flatMap((section) => {
    const group = sectionGroupName(section);
    return section.items.map((item) => ({
      id: item.id,
      label: item.label,
      group,
      onSelect: () => navigate(item.path),
    }));
  });
}

function buildActionItems(
  navigate: (path: string) => void,
  toggleTheme: () => void,
  signOut: () => void
): CommandItem[] {
  return [
    {
      id: "action-new-reservation",
      label: "New Reservation",
      group: "Actions",
      onSelect: () => navigate("/timeline"),
    },
    {
      id: "action-walkin",
      label: "Walk-in Guest",
      group: "Actions",
      onSelect: () => navigate("/timeline?walkin=true"),
    },
    {
      id: "action-new-floor-plan",
      label: "New Floor Plan",
      group: "Actions",
      onSelect: () => navigate("/floor-plans"),
    },
    {
      id: "action-toggle-theme",
      label: "Toggle Theme",
      group: "Actions",
      onSelect: toggleTheme,
    },
    {
      id: "action-sign-out",
      label: "Sign Out",
      group: "Actions",
      onSelect: signOut,
    },
  ];
}

/* ── Group ordering ─────────────────────────────── */

function buildGroups(sections: readonly NavSection[]): string[] {
  const sectionNames = sections.map(sectionGroupName);
  // Deduplicate while preserving order, then append "Actions"
  const unique = Array.from(new Set(sectionNames));
  return [...unique, "Actions"];
}

/* ── Hook ───────────────────────────────────────── */

/**
 * Manages command palette state — items derived from nav sections plus
 * quick-action shortcuts. The CommandPalette component handles the
 * ⌘K / Ctrl+K keyboard shortcut internally.
 */
export function useCommandPalette({
  sections,
  navigate,
  toggleTheme,
  signOut,
}: UseCommandPaletteOptions): UseCommandPaletteResult {
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => [
      ...buildNavItems(sections, navigate),
      ...buildActionItems(navigate, toggleTheme, signOut),
    ],
    [sections, navigate, toggleTheme, signOut]
  );

  const groups = useMemo(() => buildGroups(sections), [sections]);

  const stableSetOpen = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return { open, setOpen: stableSetOpen, items, groups };
}
