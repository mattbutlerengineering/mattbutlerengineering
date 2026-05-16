import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { NavSection, NavItem } from "../nav-sections.js";
import styles from "./DashboardSidebar.module.css";

/* ── Step status icons ───────────────────────── */

function CompletedIcon() {
  return (
    <svg
      className={styles.stepIcon}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CurrentIcon() {
  return (
    <svg
      className={styles.stepIcon}
      width="14"
      height="14"
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

function LockedIcon() {
  return (
    <svg
      className={styles.stepIcon}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

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
  /** Optional slot rendered above all nav sections (e.g. VenueSwitcher) */
  headerSlot?: ReactNode;
}

/* ── Component ───────────────────────────────── */

export function DashboardSidebar({
  sections,
  activePath,
  onNavigate,
  extraItems,
  isMobileOpen = false,
  onMobileClose,
  headerSlot,
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
        {headerSlot}
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
                      const isDisabled = item.disabled === true;
                      return (
                        <li key={item.id} className={styles.navItem}>
                          <button
                            className={`${styles.navLink} ${active ? styles.navLinkActive : ""} ${isDisabled ? styles.navLinkDisabled : ""}`}
                            onClick={isDisabled ? undefined : () => handleItemClick(item.path)}
                            aria-current={active ? "page" : undefined}
                            aria-disabled={isDisabled ? "true" : undefined}
                            type="button"
                            tabIndex={isDisabled ? -1 : undefined}
                          >
                            {item.stepStatus === "completed" && <CompletedIcon />}
                            {item.stepStatus === "current" && <CurrentIcon />}
                            {item.stepStatus === "locked" && <LockedIcon />}
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
                      const isDisabled = item.disabled === true;
                      return (
                        <li key={item.id} className={styles.navItem}>
                          <button
                            className={`${styles.navLink} ${active ? styles.navLinkActive : ""} ${isDisabled ? styles.navLinkDisabled : ""}`}
                            onClick={isDisabled ? undefined : () => handleItemClick(item.path)}
                            aria-current={active ? "page" : undefined}
                            aria-disabled={isDisabled ? "true" : undefined}
                            type="button"
                            tabIndex={isDisabled ? -1 : undefined}
                          >
                            {item.stepStatus === "completed" && <CompletedIcon />}
                            {item.stepStatus === "current" && <CurrentIcon />}
                            {item.stepStatus === "locked" && <LockedIcon />}
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
