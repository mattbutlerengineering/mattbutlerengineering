import { useState, useCallback, useMemo } from "react";
import { Input } from "@mbe/rialto";
import type { StoredSpec } from "../types.js";
import { relativeTime } from "../utils/relative-time.js";
import styles from "./HistoryPanel.module.css";

export interface HistoryPanelProps {
  entries: StoredSpec[];
  activeId: string | null;
  filter: "all" | "favorites";
  isLoading: boolean;
  onSelect: (id: string) => void;
  onReplay: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onFilterChange: (f: "all" | "favorites") => void;
}

/**
 * Left column showing the API-backed prompt history as a scrollable list.
 * Supports filtering by favorites, search by prompt text, star toggle, and replay button.
 * Active entry is highlighted with an accent border.
 */
export function HistoryPanel({
  entries,
  activeId,
  filter,
  isLoading,
  onSelect,
  onReplay,
  onToggleFavorite,
  onFilterChange,
}: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleFilterChange = useCallback(
    (f: "all" | "favorites") => {
      setSearchQuery("");
      onFilterChange(f);
    },
    [onFilterChange]
  );

  const filteredEntries = useMemo(() => {
    const byTab = filter === "favorites" ? entries.filter((e) => e.isFavorite) : entries;
    if (searchQuery.trim() === "") return byTab;
    const query = searchQuery.trim().toLowerCase();
    return byTab.filter((e) => e.prompt.toLowerCase().includes(query));
  }, [entries, filter, searchQuery]);

  return (
    <aside className={styles.panel}>
      <div className={styles.filterBar}>
        <button
          type="button"
          className={[styles.filterTab, filter === "all" ? styles.filterTabActive : ""].join(" ")}
          onClick={() => handleFilterChange("all")}
        >
          All
        </button>
        <button
          type="button"
          className={[
            styles.filterTab,
            filter === "favorites" ? styles.filterTabActive : "",
          ].join(" ")}
          onClick={() => handleFilterChange("favorites")}
        >
          Favorites
        </button>
      </div>

      <div className={styles.searchBar}>
        <Input
          placeholder="Search specs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
        {searchQuery.trim() !== "" && (
          <span className={styles.searchCount}>
            {filteredEntries.length} result{filteredEntries.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {isLoading && entries.length === 0 ? (
        <p className={styles.empty}>Loading...</p>
      ) : filteredEntries.length === 0 ? (
        <p className={styles.empty}>
          {filter === "favorites" ? "No favorites yet" : "No history yet"}
        </p>
      ) : (
        <ul className={styles.list}>
          {filteredEntries.map((entry) => (
            <li key={entry.id} className={styles.listItem}>
              <button
                type="button"
                className={[styles.item, activeId === entry.id ? styles.itemActive : ""].join(" ")}
                onClick={() => onSelect(entry.id)}
                aria-pressed={activeId === entry.id}
              >
                <span className={styles.itemPrompt}>
                  {entry.prompt.length > 60
                    ? `${entry.prompt.slice(0, 60)}\u2026`
                    : entry.prompt}
                </span>
                <span className={styles.itemTime}>
                  {relativeTime(new Date(entry.createdAt))}
                </span>
              </button>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={[
                    styles.starButton,
                    entry.isFavorite ? styles.starButtonActive : "",
                  ].join(" ")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(entry.id);
                  }}
                  aria-label={entry.isFavorite ? "Unfavorite" : "Favorite"}
                  title={entry.isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  {entry.isFavorite ? "\u2605" : "\u2606"}
                </button>
                <button
                  type="button"
                  className={styles.replayButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplay(entry.id);
                  }}
                  aria-label="Replay prompt"
                  title="Replay this prompt"
                >
                  Replay
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
