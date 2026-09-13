import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  CommandPaletteExamplePage,
  RESERVATIONS,
  GUESTS,
  ROOMS,
  SEARCH_CATALOG,
  SEARCH_GROUPS,
  INITIAL_RECENT_IDS,
  GROUP_RECENT,
  GROUP_RESERVATIONS,
  GROUP_GUESTS,
  GROUP_ROOMS,
  RECENT_LIMIT,
  recordRecent,
  buildCommandItems,
} from "./CommandPaletteExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other example test — we stub it. The CommandPalette stub is *behavioral*: it
// mirrors the real component's observable contract so the page's composition is
// what the tests exercise. Specifically it reproduces open/close rendering,
// the search combobox, ranking + best-rank section sort, group headers ordered
// by the `groups` prop as a tiebreak, the "No results found" empty state,
// ⌘K/Ctrl+K global toggle, Escape-to-close, ArrowUp/ArrowDown/Enter navigation,
// and returning focus to the trigger on close (mirror of useReturnFocus). The
// real component's internals are covered by packages/rialto's own suites;
// here we only verify how the example wires items, groups, recent state, and
// selection.
//
// Fidelity note (#5273): `rankMatch` below is a verbatim port of
// `rankCommandMatch` from packages/rialto/src/components/CommandPalette/
// CommandPalette.tsx, not an import of it — a relative source import resolves
// at runtime but fails `tsc` here with TS6059 (that file sits outside this
// package's `rootDir: "src"`), and the "@mattbutlerengineering/rialto"
// package specifier can't be used either: the built dist barrel pulls in
// every component, including ones that import workspace packages rialto-web
// doesn't depend on (e.g. ChatPanel -> @mbe/api-client), which breaks
// resolution even once rialto is built. If the real `rankCommandMatch`
// changes, update this copy to match.
// ---------------------------------------------------------------------------

/** Verbatim port of CommandPalette.tsx's `rankCommandMatch` — see the note above. */
type MatchRank = 0 | 1 | 2 | 3;
function rankMatch(label: string, query: string): MatchRank | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const lower = label.toLowerCase();
  if (lower.startsWith(q)) return 0;
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.slice(1).some((word) => word.startsWith(q))) return 1;
  if (lower.includes(q)) return 2;
  const opensEachWord =
    q.length <= words.length && Array.from(q).every((ch, i) => words[i]?.startsWith(ch));
  return opensEachWord ? 3 : null;
}

vi.mock("@mattbutlerengineering/rialto", () => {
  interface MockCommandItem {
    id: string;
    label: string;
    group?: string;
    onSelect?: () => void;
  }

  const CommandPalette = ({
    open,
    onOpenChange,
    items,
    placeholder = "Search commands…",
    groups = [],
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: MockCommandItem[];
    placeholder?: string;
    groups?: string[];
  }) => {
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<Element | null>(null);

    // ⌘K / Ctrl+K global toggle + Escape (mirror of the real document listeners).
    useEffect(() => {
      const handler = (e: globalThis.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          onOpenChange(!open);
        } else if (e.key === "Escape" && open) {
          e.preventDefault();
          onOpenChange(false);
        }
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, onOpenChange]);

    // Reset search state whenever the palette opens (mirror of the real reset).
    useEffect(() => {
      if (open) {
        setQuery("");
        setActiveIndex(0);
      }
    }, [open]);

    // Capture the trigger on open, restore focus on close (mirror useReturnFocus).
    // Declared before the auto-focus effect so the trigger is captured before
    // focus moves into the palette input.
    useEffect(() => {
      if (open) {
        triggerRef.current = document.activeElement;
      } else {
        const captured = triggerRef.current as HTMLElement | null;
        triggerRef.current = null;
        captured?.focus();
      }
    }, [open]);

    useEffect(() => {
      if (open) inputRef.current?.focus();
    }, [open]);

    // Rank + group exactly like the real component (CommandPalette.tsx):
    // rank every item against the trimmed query via `rankMatch` (a verbatim
    // port of `rankCommandMatch` — see the fidelity note above), bucket by
    // group in `groups`-prop order, then — with a query — reorder sections by
    // the best rank they contain.
    const trimmedQuery = query.trim();
    const ranked = trimmedQuery
      ? items
          .flatMap((item) => {
            const rank = rankMatch(item.label, trimmedQuery);
            return rank === null ? [] : [{ item, rank }];
          })
          .sort((a, b) => a.rank - b.rank)
      : items.map((item) => ({ item, rank: 0 }));

    const sectionsByGroup = new Map<string | null, { items: MockCommandItem[]; best: number }>();
    for (const { item, rank } of ranked) {
      const key = item.group ?? null;
      const section = sectionsByGroup.get(key);
      if (section) section.items.push(item);
      else sectionsByGroup.set(key, { items: [item], best: rank });
    }

    const groupOrder = groups.length
      ? groups
      : Array.from(sectionsByGroup.keys()).filter((key): key is string => key !== null);
    const orderedSections = [null, ...groupOrder].flatMap((key) => {
      const section = sectionsByGroup.get(key);
      return section ? [{ group: key, items: section.items, best: section.best }] : [];
    });
    if (trimmedQuery) orderedSections.sort((a, b) => a.best - b.best);

    const sections = orderedSections.map(({ group, items: sectionItems }) => ({
      group,
      items: sectionItems,
    }));
    const flat = sections.flatMap((section) => section.items);

    const select = (item: MockCommandItem) => {
      onOpenChange(false);
      item.onSelect?.();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        return;
      }
      if (flat.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flat.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flat[activeIndex];
        if (item) select(item);
      }
    };

    if (!open) return null;

    let index = 0;
    return (
      <div>
        <div role="dialog" aria-label="Command palette">
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search commands"
            aria-expanded={true}
            aria-controls="cmd-listbox"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <div id="cmd-listbox" role="listbox" aria-label="Command results">
            {flat.length === 0 ? (
              <div>No results found</div>
            ) : (
              sections.map((section) => (
                <div key={section.group ?? "__ungrouped"}>
                  {section.group && <div>{section.group}</div>}
                  {section.items.map((item) => {
                    const i = index++;
                    return (
                      <div
                        key={item.id}
                        role="option"
                        tabIndex={-1}
                        aria-selected={i === activeIndex}
                        data-active={i === activeIndex}
                        onClick={() => select(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            select(item);
                          }
                        }}
                      >
                        {item.label}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const Button = ({
    children,
    variant = "secondary",
    onClick,
  }: {
    children?: ReactNode;
    variant?: string;
    onClick?: () => void;
  }) => (
    <button type="button" data-variant={variant} onClick={onClick}>
      {children}
    </button>
  );

  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "span";
    return <Tag>{children}</Tag>;
  };

  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Kbd = ({ children }: { children?: ReactNode }) => <kbd>{children}</kbd>;

  return { CommandPalette, Button, Text, Stack, Card, Divider, Kbd };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openViaTrigger(user: UserEvent) {
  return user.click(screen.getByRole("button", { name: /search everything/i }));
}

function listbox(): HTMLElement {
  return screen.getByRole("listbox");
}

// ---------------------------------------------------------------------------
// Pure logic — fixtures and helpers (no components involved)
// ---------------------------------------------------------------------------

describe("CommandPaletteExamplePage — fixtures + catalog", () => {
  it("ships reservations, guests, and rooms fixtures", () => {
    expect(RESERVATIONS.length).toBeGreaterThanOrEqual(3);
    expect(GUESTS.length).toBeGreaterThanOrEqual(3);
    expect(ROOMS.length).toBeGreaterThanOrEqual(3);
  });

  it("catalog covers at least three groups: reservations, guests, rooms", () => {
    const groups = new Set(SEARCH_CATALOG.map((entry) => entry.group));
    expect(groups.has(GROUP_RESERVATIONS)).toBe(true);
    expect(groups.has(GROUP_GUESTS)).toBe(true);
    expect(groups.has(GROUP_ROOMS)).toBe(true);
    expect(groups.size).toBeGreaterThanOrEqual(3);
  });

  it("catalog has one entry per fixture row", () => {
    expect(SEARCH_CATALOG).toHaveLength(RESERVATIONS.length + GUESTS.length + ROOMS.length);
  });

  it("every catalog entry has a unique id, a label, a real group, and an href", () => {
    const ids = SEARCH_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const realGroups = [GROUP_RESERVATIONS, GROUP_GUESTS, GROUP_ROOMS];
    for (const entry of SEARCH_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(realGroups).toContain(entry.group);
      expect(entry.href.startsWith("/")).toBe(true);
    }
  });

  it("SEARCH_GROUPS orders Recent first, then the three types", () => {
    expect(SEARCH_GROUPS).toEqual([GROUP_RECENT, GROUP_RESERVATIONS, GROUP_GUESTS, GROUP_ROOMS]);
  });

  it("seeds initial recent ids that resolve to real catalog entries", () => {
    expect(INITIAL_RECENT_IDS.length).toBeGreaterThan(0);
    for (const id of INITIAL_RECENT_IDS) {
      expect(SEARCH_CATALOG.some((entry) => entry.id === id)).toBe(true);
    }
  });
});

describe("recordRecent", () => {
  it("prepends a new id, most-recent first", () => {
    expect(recordRecent(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("de-duplicates by moving an existing id to the front", () => {
    expect(recordRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });

  it("caps the list at the limit", () => {
    expect(recordRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

  it("defaults the cap to RECENT_LIMIT", () => {
    const seeded = Array.from({ length: RECENT_LIMIT }, (_, i) => `id-${i}`);
    expect(recordRecent(seeded, "new")).toHaveLength(RECENT_LIMIT);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b"];
    recordRecent(input, "c");
    expect(input).toEqual(["a", "b"]);
  });
});

describe("buildCommandItems", () => {
  it("maps the whole catalog when there are no recents, preserving groups", () => {
    const items = buildCommandItems(SEARCH_CATALOG, [], vi.fn());
    expect(items).toHaveLength(SEARCH_CATALOG.length);
    expect(items.every((item) => item.group !== GROUP_RECENT)).toBe(true);
  });

  it("wires onSelect to fire the callback with the catalog entry", () => {
    const onSelect = vi.fn();
    const items = buildCommandItems(SEARCH_CATALOG, [], onSelect);
    const first = SEARCH_CATALOG[0]!;
    const item = items.find((candidate) => candidate.id === first.id)!;
    item.onSelect?.();
    expect(onSelect).toHaveBeenCalledWith(first);
  });

  it("prepends resolved recents in a Recent group with distinct ids", () => {
    const recentId = SEARCH_CATALOG[0]!.id;
    const items = buildCommandItems(SEARCH_CATALOG, [recentId], vi.fn());
    const recent = items.filter((item) => item.group === GROUP_RECENT);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.id).not.toBe(recentId); // distinct id avoids DOM collision
    expect(items[0]!.group).toBe(GROUP_RECENT); // recents come first
  });

  it("a recent item's onSelect fires with the original catalog entry", () => {
    const onSelect = vi.fn();
    const original = SEARCH_CATALOG[0]!;
    const items = buildCommandItems(SEARCH_CATALOG, [original.id], onSelect);
    const recentItem = items.find((item) => item.group === GROUP_RECENT)!;
    recentItem.onSelect?.();
    expect(onSelect).toHaveBeenCalledWith(original);
  });

  it("ignores recent ids that no longer resolve to a catalog entry", () => {
    const items = buildCommandItems(SEARCH_CATALOG, ["does-not-exist"], vi.fn());
    expect(items.filter((item) => item.group === GROUP_RECENT)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Composition — the example wiring the real CommandPalette (mocked here)
// ---------------------------------------------------------------------------

describe("CommandPaletteExamplePage — composition", () => {
  it("renders the showcase header and a visible trigger; palette starts closed", () => {
    render(<CommandPaletteExamplePage />);
    expect(screen.getByRole("heading", { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search everything/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the palette via the visible trigger button", async () => {
    const user = userEvent.setup();
    render(<CommandPaletteExamplePage />);
    await openViaTrigger(user);
    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /search commands/i })).toBeInTheDocument();
  });

  it("opens the palette via the ⌘K keyboard shortcut", async () => {
    render(<CommandPaletteExamplePage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
  });

  it("also opens via the Ctrl+K shortcut", async () => {
    render(<CommandPaletteExamplePage />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("groups results by at least three types with headers", async () => {
    const user = userEvent.setup();
    render(<CommandPaletteExamplePage />);
    await openViaTrigger(user);
    const inBox = within(listbox());
    expect(inBox.getByText(GROUP_RESERVATIONS)).toBeInTheDocument();
    expect(inBox.getByText(GROUP_GUESTS)).toBeInTheDocument();
    expect(inBox.getByText(GROUP_ROOMS)).toBeInTheDocument();
    expect(inBox.getAllByRole("option").length).toBeGreaterThanOrEqual(SEARCH_CATALOG.length);
  });

  it("shows recent searches when the query is empty", async () => {
    const user = userEvent.setup();
    render(<CommandPaletteExamplePage />);
    await openViaTrigger(user);
    expect(within(listbox()).getByText(GROUP_RECENT)).toBeInTheDocument();
  });

  it("renders a no-results state for a non-matching query", async () => {
    const user = userEvent.setup();
    render(<CommandPaletteExamplePage />);
    await openViaTrigger(user);
    await user.type(screen.getByRole("combobox"), "zzzzznomatch");
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    expect(within(listbox()).queryAllByRole("option")).toHaveLength(0);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<CommandPaletteExamplePage />);
    const trigger = screen.getByRole("button", { name: /search everything/i });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("ranks results by best match, navigates with arrow keys, and selects with Enter", async () => {
    const user = userEvent.setup();
    render(<CommandPaletteExamplePage />);
    await openViaTrigger(user);
    // "Terrace" matches a Reservations entry ("Diego Alvarez · Terrace Suite
    // 507" — rank 1: a later word starts with the query) and a Rooms entry
    // ("Terrace Suite 507 · South Wing" — rank 0: the label itself starts with
    // the query). The stronger match leads regardless of `groups` order, so
    // Rooms comes first even though Reservations precedes Rooms in that list.
    await user.type(screen.getByRole("combobox"), "Terrace");
    const options = within(listbox()).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent(/south wing/i);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    const afterDown = within(listbox()).getAllByRole("option");
    expect(afterDown[0]).toHaveAttribute("aria-selected", "false");
    expect(afterDown[1]).toHaveAttribute("aria-selected", "true");
    expect(afterDown[1]).toHaveTextContent(/diego alvarez/i);
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/last opened/i)).toBeInTheDocument();
    expect(screen.getByText(/diego alvarez/i)).toBeInTheDocument();
  });

  it("fires the selection handler on click and records it as a recent search", async () => {
    const user = userEvent.setup();
    render(<CommandPaletteExamplePage />);
    await openViaTrigger(user);
    // Ella Fontaine is a guest and is not seeded into recents.
    expect(within(listbox()).getAllByText("Ella Fontaine")).toHaveLength(1);
    await user.click(screen.getByRole("option", { name: "Ella Fontaine" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/last opened/i)).toBeInTheDocument();
    // Reopen — she now appears in both the Recent group and the Guests group.
    await openViaTrigger(user);
    expect(within(listbox()).getAllByText("Ella Fontaine")).toHaveLength(2);
    expect(within(listbox()).getByText(GROUP_RECENT)).toBeInTheDocument();
  });
});
