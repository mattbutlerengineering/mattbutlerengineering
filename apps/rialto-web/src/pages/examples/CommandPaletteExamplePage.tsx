import { useCallback, useMemo, useState } from "react";
import { Button, Card, CommandPalette, Kbd, Stack, Text } from "@mattbutlerengineering/rialto";
import type { CommandItem } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./CommandPaletteExamplePage.module.css";

/* ── Fixture types ───────────────────────────── */

export interface SearchReservation {
  id: string;
  guest: string;
  room: string;
  dates: string;
}

export interface SearchGuest {
  id: string;
  name: string;
  email: string;
}

export interface SearchRoom {
  id: string;
  name: string;
  wing: string;
}

/** A single searchable entry, flattened from the typed fixtures below. */
export interface SearchEntry {
  /** Stable id, unique across the whole catalog. */
  id: string;
  /** Text shown in the palette and matched against the query. */
  label: string;
  /** Group header the entry appears under. */
  group: string;
  /** Plausible destination a selection would route to. */
  href: string;
}

/* ── Fixture data ────────────────────────────── */

export const RESERVATIONS: readonly SearchReservation[] = [
  { id: "res-1188", guest: "Marcus Winters", room: "Lakeview Suite 402", dates: "Aug 12 – 15" },
  { id: "res-1204", guest: "Priya Raman", room: "Garden Room 118", dates: "Aug 13 – 14" },
  { id: "res-1221", guest: "Diego Alvarez", room: "Terrace Suite 507", dates: "Aug 15 – 18" },
  { id: "res-1235", guest: "Hannah Cole", room: "Courtyard Room 233", dates: "Aug 16 – 19" },
];

export const GUESTS: readonly SearchGuest[] = [
  { id: "guest-fontaine", name: "Ella Fontaine", email: "ella.fontaine@example.com" },
  { id: "guest-winters", name: "Marcus Winters", email: "m.winters@example.com" },
  { id: "guest-okoye", name: "Ada Okoye", email: "ada.okoye@example.com" },
  { id: "guest-raman", name: "Priya Raman", email: "priya.raman@example.com" },
];

export const ROOMS: readonly SearchRoom[] = [
  { id: "room-402", name: "Lakeview Suite 402", wing: "North Wing" },
  { id: "room-507", name: "Terrace Suite 507", wing: "South Wing" },
  { id: "room-118", name: "Garden Room 118", wing: "Garden Level" },
  { id: "room-233", name: "Courtyard Room 233", wing: "East Wing" },
];

/* ── Group names ─────────────────────────────── */

export const GROUP_RECENT = "Recent";
export const GROUP_RESERVATIONS = "Reservations";
export const GROUP_GUESTS = "Guests";
export const GROUP_ROOMS = "Rooms";

/** Ordered group list handed to the palette — recents lead, then each type. */
export const SEARCH_GROUPS = [
  GROUP_RECENT,
  GROUP_RESERVATIONS,
  GROUP_GUESTS,
  GROUP_ROOMS,
];

/* ── Derived catalog ─────────────────────────── */

export const SEARCH_CATALOG: readonly SearchEntry[] = [
  ...RESERVATIONS.map((reservation) => ({
    id: reservation.id,
    label: `${reservation.guest} · ${reservation.room}`,
    group: GROUP_RESERVATIONS,
    href: `/examples/reservations#${reservation.id}`,
  })),
  ...GUESTS.map((guest) => ({
    id: guest.id,
    label: guest.name,
    group: GROUP_GUESTS,
    href: `/examples/guest-profile#${guest.id}`,
  })),
  ...ROOMS.map((room) => ({
    id: room.id,
    label: `${room.name} · ${room.wing}`,
    group: GROUP_ROOMS,
    href: `/rooms/${room.id}`,
  })),
];

/** Recent searches the operator arrives with, so the empty state is populated. */
export const INITIAL_RECENT_IDS: readonly string[] = ["res-1188", "guest-okoye"];

/** How many recent selections are retained. */
export const RECENT_LIMIT = 5;

/* ── Pure helpers ────────────────────────────── */

/**
 * Push `id` to the front of the recent list, de-duplicated and capped at
 * `limit`, most-recent first. Returns a new array — never mutates `recent`.
 */
export function recordRecent(
  recent: readonly string[],
  id: string,
  limit: number = RECENT_LIMIT,
): string[] {
  return [id, ...recent.filter((existing) => existing !== id)].slice(0, limit);
}

/**
 * Build the palette's item list: resolved recent selections first (in their own
 * `Recent` group, with prefixed ids so they never collide with their catalog
 * twin), then the full catalog. Both wire each item's `onSelect` to `onSelect`
 * with the underlying {@link SearchEntry}.
 */
export function buildCommandItems(
  catalog: readonly SearchEntry[],
  recent: readonly string[],
  onSelect: (entry: SearchEntry) => void,
): CommandItem[] {
  const recentItems: CommandItem[] = recent
    .map((id) => catalog.find((entry) => entry.id === id))
    .filter((entry): entry is SearchEntry => entry !== undefined)
    .map((entry) => ({
      id: `recent:${entry.id}`,
      label: entry.label,
      group: GROUP_RECENT,
      onSelect: () => onSelect(entry),
    }));

  const catalogItems: CommandItem[] = catalog.map((entry) => ({
    id: entry.id,
    label: entry.label,
    group: entry.group,
    onSelect: () => onSelect(entry),
  }));

  return [...recentItems, ...catalogItems];
}

/* ── Source JSX constant ─────────────────────── */
// Keep in sync with the component below.

const COMMAND_PALETTE_EXAMPLE_JSX = `const [open, setOpen] = useState(false);
const [recent, setRecent] = useState(INITIAL_RECENT_IDS);
const [selected, setSelected] = useState(null);

const items = buildCommandItems(SEARCH_CATALOG, recent, (entry) => {
  setSelected(entry);
  setRecent((prev) => recordRecent(prev, entry.id));
});

<Button variant="primary" onClick={() => setOpen(true)}>
  Search everything <Kbd>⌘</Kbd><Kbd>K</Kbd>
</Button>

<CommandPalette
  open={open}
  onOpenChange={setOpen}
  items={items}
  groups={["Recent", "Reservations", "Guests", "Rooms"]}
  placeholder="Search reservations, guests, rooms…"
/>`;

/* ── Composition notes ───────────────────────── */

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      The palette owns its own search, filtering, and keyboard navigation — the example only
      supplies a declarative <code>CommandItem[]</code> and reacts to each item&rsquo;s{" "}
      <code>onSelect</code>. Cmd/Ctrl+K is handled by the component itself, so the visible trigger
      and the shortcut open the same overlay.
    </CompositionNote>
    <CompositionNote>
      Results are grouped by type via the <code>group</code> field and ordered with the{" "}
      <code>groups</code> prop. Recent selections are held in local state and surfaced as their own
      leading group, so the empty query still shows something useful.
    </CompositionNote>
    <CompositionNote>
      Selecting an entry records it into recent searches and reveals the destination it would route
      to — a stand-in for the app-level navigation a real launcher would perform.
    </CompositionNote>
  </Stack>
);

/* ── Component ───────────────────────────────── */

export function CommandPaletteExamplePage() {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<readonly string[]>(INITIAL_RECENT_IDS);
  const [selected, setSelected] = useState<SearchEntry | null>(null);

  const handleSelect = useCallback((entry: SearchEntry) => {
    setSelected(entry);
    setRecent((prev) => recordRecent(prev, entry.id));
  }, []);

  const items = useMemo(
    () => buildCommandItems(SEARCH_CATALOG, recent, handleSelect),
    [recent, handleSelect],
  );

  return (
    <ExamplePageLayout
      name="Command Palette"
      description="Global search composing the CommandPalette into a ⌘K workflow across reservations, guests, and rooms."
      sourceJsx={COMMAND_PALETTE_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <Stack gap="lg">
        <Card variant="elevated" className={styles.launcher}>
          <Stack gap="sm">
            <Text variant="label" as="h2">
              Global search
            </Text>
            <Text variant="body" color="secondary">
              Search across reservations, guests, and rooms. Open it with the button below, or press{" "}
              <Kbd>⌘</Kbd> <Kbd>K</Kbd> anywhere on the page.
            </Text>
            <div className={styles.triggerRow}>
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Text className={styles.triggerLabel}>Search everything</Text>
                <Text className={styles.triggerHint} aria-hidden="true">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </Text>
              </Button>
            </div>
          </Stack>
        </Card>

        {selected ? (
          <Card variant="elevated" className={styles.result}>
            <Stack gap="xs">
              <Text variant="caption" color="tertiary">
                Last opened
              </Text>
              <Text variant="label">{selected.label}</Text>
              <Text variant="body" color="secondary">
                Navigates to {selected.href}
              </Text>
            </Stack>
          </Card>
        ) : (
          <Text variant="body" color="tertiary">
            Nothing opened yet — launch the palette and choose a result to see where it routes.
          </Text>
        )}
      </Stack>

      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        items={items}
        groups={SEARCH_GROUPS}
        placeholder="Search reservations, guests, rooms…"
      />
    </ExamplePageLayout>
  );
}

CommandPaletteExamplePage.displayName = "CommandPaletteExamplePage";
