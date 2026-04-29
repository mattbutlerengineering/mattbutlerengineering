import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input } from "@mattbutlerengineering/rialto";
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
  onDelete: (id: string) => void;
  onFilterChange: (f: "all" | "favorites") => void;
}

const PROMPT_TRUNCATE_LENGTH = 60;
const DELETE_CONFIRM_TIMEOUT_MS = 3000;

/**
 * Left column showing the API-backed prompt history as a scrollable list.
 * Supports filtering by favorites, star toggle, replay, delete, and search.
 * Active entry is highlighted with an accent border.
 * Keyboard navigation via Arrow Up/Down and Enter.
 */
export function HistoryPanel({
  entries,
  activeId,
  filter,
  isLoading,
  onSelect,
  onReplay,
  onToggleFavorite,
  onDelete,
  onFilterChange,
}: HistoryPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const favoriteFiltered =
    filter === "favorites" ? entries.filter((e) => e.isFavorite) : entries;

  const filteredEntries = searchTerm
    ? favoriteFiltered.filter((e) =>
        e.prompt.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : favoriteFiltered;

  const isFiltered = searchTerm || filter === "favorites";
  const countLabel = isFiltered
    ? `${filteredEntries.length} of ${entries.length} specs`
    : `${entries.length} ${entries.length === 1 ? "spec" : "specs"}`;

  // Clear confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  // Auto-dismiss delete confirmation after timeout
  useEffect(() => {
    if (confirmingDeleteId === null) return;

    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
    }

    confirmTimerRef.current = setTimeout(() => {
      setConfirmingDeleteId(null);
      confirmTimerRef.current = null;
    }, DELETE_CONFIRM_TIMEOUT_MS);

    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, [confirmingDeleteId]);

  const handleDeleteClick = useCallback((id: string) => {
    setConfirmingDeleteId(id);
  }, []);

  const handleDeleteConfirm = useCallback(
    (id: string) => {
      setConfirmingDeleteId(null);
      onDelete(id);
    },
    [onDelete]
  );

  const handleDeleteCancel = useCallback(() => {
    setConfirmingDeleteId(null);
  }, []);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      const count = filteredEntries.length;
      if (count === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = focusedIndex < count - 1 ? focusedIndex + 1 : 0;
          setFocusedIndex(next);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = focusedIndex > 0 ? focusedIndex - 1 : count - 1;
          setFocusedIndex(prev);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < count) {
            onSelect(filteredEntries[focusedIndex].id);
          }
          break;
        }
      }
    },
    [filteredEntries, focusedIndex, onSelect]
  );

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-history-item]");
    const target = items[focusedIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setFocusedIndex(-1);
  }, []);

  const handleFilterChange = useCallback(
    (f: "all" | "favorites") => {
      setFocusedIndex(-1);
      onFilterChange(f);
    },
    [onFilterChange]
  );

  const focusedEntryId =
    focusedIndex >= 0 && focusedIndex < filteredEntries.length
      ? `history-item-${filteredEntries[focusedIndex].id}`
      : undefined;

  return (
    <aside className={styles.panel}>
      <div className={styles.filterBar}>
        <Button
          variant="ghost"
          size="sm"
          className={[styles.filterTab, filter === "all" ? styles.filterTabActive : ""].join(" ")}
          onClick={() => handleFilterChange("all")}
        >
          All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={[
            styles.filterTab,
            filter === "favorites" ? styles.filterTabActive : "",
          ].join(" ")}
          onClick={() => handleFilterChange("favorites")}
        >
          Favorites
        </Button>
      </div>

      <div className={styles.searchBar}>
        <Input
          type="text"
          className={styles.searchInput}
          placeholder="Search prompts..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            className={styles.searchClear}
            onClick={() => handleSearchChange("")}
            aria-label="Clear search"
          >
            {"\u00D7"}
          </Button>
        )}
      </div>

      {entries.length > 0 && (
        <p className={styles.entryCount}>{countLabel}</p>
      )}

      {isLoading && entries.length === 0 ? (
        <p className={styles.empty}>Loading...</p>
      ) : filteredEntries.length === 0 ? (
        <p className={styles.empty}>
          {searchTerm
            ? "No matching prompts"
            : filter === "favorites"
              ? "No favorites yet"
              : "No history yet"}
        </p>
      ) : (
        <ul
          ref={listRef}
          className={styles.list}
          role="listbox"
          tabIndex={0}
          aria-activedescendant={focusedEntryId}
          aria-label="Prompt history"
          onKeyDown={handleListKeyDown}
        >
          {filteredEntries.map((entry, index) => {
            const isTruncated = entry.prompt.length > PROMPT_TRUNCATE_LENGTH;
            const displayPrompt = isTruncated
              ? `${entry.prompt.slice(0, PROMPT_TRUNCATE_LENGTH)}\u2026`
              : entry.prompt;
            const isRefined = entry.prompt.startsWith("Refined:");
            const isFocused = index === focusedIndex;
            const isConfirmingDelete = confirmingDeleteId === entry.id;

            return (
              <li
                key={entry.id}
                id={`history-item-${entry.id}`}
                className={[
                  styles.listItem,
                  isFocused ? styles.listItemFocused : "",
                ].join(" ")}
                role="option"
                aria-selected={activeId === entry.id}
                data-history-item
              >
                <div 
                  tabIndex={-1} 
                  className={styles.buttonWrapper}
                >
                  <Button
                    variant="ghost"
                    className={[
                      styles.item,
                      activeId === entry.id ? styles.itemActive : "",
                    ].join(" ")}
                    onClick={() => onSelect(entry.id)}
                  >
                    <span
                      className={styles.itemPrompt}
                      title={isTruncated ? entry.prompt : undefined}
                      data-tooltip={isTruncated ? entry.prompt : undefined}
                    >
                      {displayPrompt}
                    </span>
                    <span className={styles.itemMeta}>
                      <span className={styles.itemTime}>
                        {relativeTime(new Date(entry.createdAt))}
                      </span>
                      {isRefined && (
                        <>
                          <span className={styles.metaDot}>{"\u00B7"}</span>
                          <span className={styles.refinedTag}>Refined</span>
                        </>
                      )}
                      {entry.isFavorite && (
                        <>
                          <span className={styles.metaDot}>{"\u00B7"}</span>
                          <span className={styles.metaStar}>{"\u2605"}</span>
                        </>
                      )}
                    </span>
                  </Button>
                </div>

                {isConfirmingDelete ? (
                  <div className={styles.deleteConfirm}>
                    <span className={styles.deleteConfirmLabel}>Delete?</span>
                    <span title="Confirm delete">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.deleteConfirmYes}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConfirm(entry.id);
                        }}
                        aria-label="Confirm delete"
                      >
                        {"\u2713"}
                      </Button>
                    </span>
                    <span title="Cancel delete">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.deleteConfirmNo}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCancel();
                        }}
                        aria-label="Cancel delete"
                      >
                        {"\u00D7"}
                      </Button>
                    </span>
                  </div>
                ) : (
                  <div className={[
                    styles.itemActions,
                    entry.isFavorite ? styles.itemActionsHasFavorite : "",
                  ].join(" ")}>
                    <span 
                      title={entry.isFavorite ? "Remove from favorites" : "Add to favorites"}
                      tabIndex={-1}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={[
                          styles.starButton,
                          entry.isFavorite ? styles.starButtonActive : "",
                        ].join(" ")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(entry.id);
                        }}
                        aria-label={entry.isFavorite ? "Unfavorite" : "Favorite"}
                      >
                        {entry.isFavorite ? "\u2605" : "\u2606"}
                      </Button>
                    </span>
                    <span title="Replay this prompt" tabIndex={-1}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.replayButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReplay(entry.id);
                        }}
                        aria-label="Replay prompt"
                      >
                        Replay
                      </Button>
                    </span>
                    <span title="Delete this spec" tabIndex={-1}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.deleteButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(entry.id);
                        }}
                        aria-label="Delete spec"
                      >
                        {"\u00D7"}
                      </Button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
