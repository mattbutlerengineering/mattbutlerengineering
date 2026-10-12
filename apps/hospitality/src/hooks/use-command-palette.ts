import { useState, useMemo, useCallback } from "react";
import type { CommandItem } from "@mattbutlerengineering/rialto";
import type { NavSection } from "../nav-sections.js";
import type { NavAction } from "../nav-actions.js";

/* ── Types ──────────────────────────────────────── */

interface UseCommandPaletteOptions {
  sections: readonly NavSection[];
  runAction: (action: NavAction) => void;
  toggleTheme: () => void;
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
  runAction: (action: NavAction) => void
): CommandItem[] {
  return sections.flatMap((section) => {
    const group = sectionGroupName(section);
    return section.items.map((item) => ({
      id: item.id,
      label: item.label,
      group,
      onSelect: () => runAction(item.action),
    }));
  });
}

function buildActionItems(
  runAction: (action: NavAction) => void,
  toggleTheme: () => void
): CommandItem[] {
  return [
    {
      id: "action-new-reservation",
      label: "New Reservation",
      group: "Actions",
      // Carries the intent the Reservations page reads on arrival (architecture § Amendment
      // 2026-09-04) — landing on the Timeline left the operator to find the button themselves.
      onSelect: () => runAction({ type: "route", path: "/reservations?new=true" }),
    },
    {
      id: "action-walkin",
      label: "Walk-in guest",
      group: "Actions",
      onSelect: () => runAction({ type: "route", path: "/timeline?walkin=true" }),
    },
    {
      id: "action-new-floor-plan",
      label: "New Floor Plan",
      group: "Actions",
      onSelect: () => runAction({ type: "route", path: "/floor-plans" }),
    },
    {
      id: "action-toggle-theme",
      label: "Toggle Theme",
      group: "Actions",
      onSelect: toggleTheme,
    },
  ];
}

/* ── Group ordering ─────────────────────────────── */

function buildGroups(sections: readonly NavSection[]): string[] {
  const sectionNames = sections.map(sectionGroupName);
  // "Actions" leads: on an empty query the palette opens on what a Host does, not where they go
  // (ux.md Flow 5). Section names follow, deduplicated in nav order.
  const unique = Array.from(new Set(sectionNames));
  return ["Actions", ...unique];
}

/* ── Hook ───────────────────────────────────────── */

/**
 * Manages command palette state — items derived from nav sections plus
 * quick-action shortcuts. The CommandPalette component handles the
 * ⌘K / Ctrl+K keyboard shortcut internally.
 */
export function useCommandPalette({
  sections,
  runAction,
  toggleTheme,
}: UseCommandPaletteOptions): UseCommandPaletteResult {
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => [...buildNavItems(sections, runAction), ...buildActionItems(runAction, toggleTheme)],
    [sections, runAction, toggleTheme]
  );

  const groups = useMemo(() => buildGroups(sections), [sections]);

  const stableSetOpen = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return { open, setOpen: stableSetOpen, items, groups };
}
