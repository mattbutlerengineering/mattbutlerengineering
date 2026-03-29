import { useState, useCallback, useEffect, useRef } from "react";
import type { NavSection, NavItem } from "../nav-sections.js";
import styles from "./DashboardSidebar.module.css";

/* ── Constants ───────────────────────────────── */

const STORAGE_KEY = "hospitality-sidebar-collapsed";

/* ── Inline SVG icon ─────────────────────────── */

function ChevronIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
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

export interface DashboardSidebarProps {
  sections: readonly NavSection[];
  activePath: string;
  onNavigate: (path: string) => void;
  /** Extra items appended to a named section (e.g. Sign Out in Account) */
  extraItems?: ReadonlyMap<string, readonly NavItem[]>;
  /** Whether the mobile drawer is open (only affects screens < 768px) */
  isMobileOpen?: boolean;
  /** Called when the mobile drawer should close */
  onMobileClose?: () => void;
}

/* ── Component ───────────────────────────────── */

export function DashboardSidebar({
  sections,
  activePath,
  onNavigate,
  extraItems,
  isMobileOpen = false,
  onMobileClose,
}: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const sidebarRef = useRef<HTMLElement>(null);

  // Persist collapsed state
  useEffect(() => {
    saveCollapsed(collapsed);
  }, [collapsed]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!isMobileOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onMobileClose?.();
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

  const handleItemClick = useCallback(
    (path: string) => {
      onNavigate(path);
      onMobileClose?.();
    },
    [onNavigate, onMobileClose]
  );

  const isItemActive = useCallback(
    (item: NavItem): boolean =>
      activePath === item.path || activePath.startsWith(item.path + "/"),
    [activePath]
  );

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
        aria-label="Dashboard navigation"
      >
        <div className={styles.sections}>
          {sections.map((section, sectionIndex) => {
            const sectionKey = section.label ?? `section-${String(sectionIndex)}`;

            // Merge extra items for named sections
            const sectionItems =
              section.label && extraItems?.has(section.label)
                ? [...section.items, ...extraItems.get(section.label)!]
                : section.items;

            // Unlabelled sections render flat (no collapsible header)
            if (!section.label) {
              return (
                <div key={sectionKey} className={styles.section}>
                  <ul className={styles.sectionItemsFlat}>
                    {sectionItems.map((item) => {
                      const active = isItemActive(item);
                      return (
                        <li key={item.id} className={styles.navItem}>
                          <button
                            className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                            onClick={() => handleItemClick(item.path)}
                            aria-current={active ? "page" : undefined}
                            type="button"
                          >
                            {item.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }

            // Named sections are collapsible
            const isExpanded = !collapsed.has(section.label);

            return (
              <div key={sectionKey} className={styles.section}>
                <button
                  className={styles.sectionHeader}
                  onClick={() => toggleSection(section.label!)}
                  aria-expanded={isExpanded}
                  type="button"
                >
                  <span
                    className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ""}`}
                  >
                    <ChevronIcon />
                  </span>
                  <span className={styles.sectionLabel}>{section.label}</span>
                </button>

                {isExpanded && (
                  <ul className={styles.sectionItems}>
                    {sectionItems.map((item) => {
                      const active = isItemActive(item);
                      return (
                        <li key={item.id} className={styles.navItem}>
                          <button
                            className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                            onClick={() => handleItemClick(item.path)}
                            aria-current={active ? "page" : undefined}
                            type="button"
                          >
                            {item.label}
                          </button>
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

DashboardSidebar.displayName = "DashboardSidebar";
