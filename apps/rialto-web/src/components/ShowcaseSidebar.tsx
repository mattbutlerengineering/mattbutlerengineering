import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import type { NavSection, NavItem } from "../data/nav-sections";
import styles from "./ShowcaseSidebar.module.css";

/* ── Constants ───────────────────────────────── */

const STORAGE_KEY = "rialto-showcase-collapsed";

/* ── Inline SVG icons ────────────────────────── */

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ── Helpers ──────────────────────────────────── */

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed as string[]);
      }
    }
  } catch {
    // Ignore corrupted data
  }
  return new Set();
}

function saveCollapsed(collapsed: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(collapsed)));
  } catch {
    // Ignore storage quota errors
  }
}

/* ── Props ───────────────────────────────────── */

export interface ShowcaseSidebarProps {
  sections: NavSection[];
  demoPages: readonly NavItem[];
  activePath: string;
  onNavigate: (path: string) => void;
  /** Whether the mobile drawer is open (only affects screens < 768px) */
  isMobileOpen?: boolean;
  /** Called when the mobile drawer should close */
  onMobileClose?: () => void;
}

/* ── Component ───────────────────────────────── */

export function ShowcaseSidebar({
  sections,
  demoPages,
  isMobileOpen = false,
  onMobileClose,
}: ShowcaseSidebarProps) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const inputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Persist collapsed state
  useEffect(() => {
    saveCollapsed(collapsed);
  }, [collapsed]);

  // Focus trap + Escape handling for mobile drawer
  useEffect(() => {
    if (!isMobileOpen) return;

    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    // Move focus into the sidebar when it opens
    const firstFocusable = sidebar.querySelector<HTMLElement>(
      'input, button, [href], [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onMobileClose?.();
        return;
      }

      if (e.key !== "Tab") return;

      const focusableElements = sidebar.querySelectorAll<HTMLElement>(
        'input, button, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen, onMobileClose]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  const normalizedFilter = filter.toLowerCase().trim();
  const isFiltering = normalizedFilter.length > 0;

  // All sections including demos
  const allSections: NavSection[] = useMemo(
    () => [
      ...sections,
      { label: "Demos", items: [...demoPages] },
    ],
    [sections, demoPages]
  );

  // Filtered sections — hide sections with no matching items
  const visibleSections = useMemo(() => {
    if (!isFiltering) return allSections;

    return allSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          item.label.toLowerCase().includes(normalizedFilter)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [allSections, isFiltering, normalizedFilter]);

  const toggleSection = useCallback((label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const clearFilter = useCallback(() => {
    setFilter("");
    inputRef.current?.focus();
  }, []);

  const rootClassName = `${styles.root} ${isMobileOpen ? styles.mobileOpen : ""}`;

  return (
    <>
      {/* ── Mobile backdrop ────────────────── */}
      {isMobileOpen && (
        <div
          className={styles.backdrop}
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <nav
        ref={sidebarRef}
        className={rootClassName}
        aria-label="Component navigation"
      >
      {/* ── Search ──────────────────────────── */}
      <div className={styles.searchWrapper}>
        <div className={styles.searchInputWrapper}>
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Filter components…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter components"
          />
          {isFiltering && (
            <button
              className={styles.clearButton}
              onClick={clearFilter}
              aria-label="Clear filter"
              type="button"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      {/* ── Sections ───────────────────────── */}
      <div className={styles.sections}>
        {visibleSections.length === 0 && (
          <div className={styles.emptyState}>No components match &quot;{filter}&quot;</div>
        )}

        {visibleSections.map((section) => {
          const isExpanded = isFiltering || !collapsed.has(section.label);

          return (
            <div key={section.label} className={styles.section}>
              <button
                className={styles.sectionHeader}
                onClick={() => toggleSection(section.label)}
                aria-expanded={isExpanded}
                type="button"
              >
                <span
                  className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ""}`}
                >
                  <ChevronIcon />
                </span>
                <span className={styles.sectionLabel}>{section.label}</span>
                <span className={styles.sectionCount}>{section.items.length}</span>
              </button>

              {isExpanded && (
                <ul className={styles.sectionItems}>
                  {section.items.map((item) => {
                    const isComingSoon = item.comingSoon === true;

                    return (
                      <li key={item.id} className={styles.navItem}>
                        {isComingSoon ? (
                          <span className={`${styles.navLink} ${styles.navLinkComingSoon}`}>
                            {item.label}
                            <span className={styles.comingSoonBadge}>coming soon</span>
                          </span>
                        ) : (
                          <NavLink
                            to={item.path}
                            className={({ isActive }) =>
                              [styles.navLink, isActive ? styles.navLinkActive : ""]
                                .filter(Boolean)
                                .join(" ")
                            }
                            onClick={() => onMobileClose?.()}
                          >
                            {item.label}
                          </NavLink>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
    </>
  );
}

ShowcaseSidebar.displayName = "ShowcaseSidebar";
