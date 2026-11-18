/*
 * The remote ships no rialto JavaScript: it is a small separately deployed bundle, and rialto's
 * Button and Text would change the side nav's look (ux.md F10.1: no visible difference). It uses
 * rialto's tokens through CSS only, so the native elements below are deliberate.
 */
/* eslint-disable mbe-local/prefer-rialto-components */
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { resolveLocale, translate } from "./i18n.js";
import { sections as buildSections } from "./sections.js";
import { SlotMount } from "./SlotMount.js";
import styles from "./SideNav.module.css";
import type { NavAction, NavItem, SideNavProps, SideNavSlots } from "./types.js";

/** Same key the hospitality sidebar used, so an operator's collapsed sections carry over. */
const STORAGE_KEY = "hospitality-sidebar-collapsed";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ChevronIcon(): ReactElement {
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

function loadCollapsed(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch (error) {
    // Corrupt or unavailable storage only costs the remembered state.
    console.warn("hospitality-sidenav: could not read collapsed sections", error);
    return new Set();
  }
}

function saveCollapsed(collapsed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch (error) {
    console.warn("hospitality-sidenav: could not save collapsed sections", error);
  }
}

/** The longest item path that holds the active path, so `/availability/map` lights only the map. */
function activeItemPath(items: readonly NavItem[], pathname: string): string | null {
  return items
    .flatMap((item) => (item.action.type === "route" ? [item.action.path] : []))
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .reduce<string | null>(
      (best, path) => (best && best.length >= path.length ? best : path),
      null
    );
}

function ItemButton(props: {
  item: NavItem;
  active: boolean;
  onSelect: (action: NavAction) => void;
}): ReactElement {
  const { item, active, onSelect } = props;
  return (
    <li className={styles.navItem}>
      <button
        className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
        onClick={() => onSelect(item.action)}
        aria-current={active ? "page" : undefined}
        type="button"
      >
        {item.label}
        {item.badge !== undefined && (
          <>
            {" "}
            <span className={styles.navBadge}>{item.badge}</span>
          </>
        )}
      </button>
    </li>
  );
}

export function SideNav(props: SideNavProps & { slots: SideNavSlots }): ReactElement {
  const { pathname, locale, direction, isMobileOpen, onAction, onMobileClose, slots } = props;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(loadCollapsed);
  const panelRef = useRef<HTMLElement>(null);
  // Pure and a few dozen items: cheaper to rebuild than to key a memo on every input.
  const sections = buildSections(props);

  useEffect(() => saveCollapsed(collapsed), [collapsed]);

  useEffect(() => {
    if (!isMobileOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isMobileOpen, onMobileClose]);

  // Mobile drawer focus: move focus in on open, keep Tab inside the panel, and return focus to
  // whatever opened it on close.
  useEffect(() => {
    if (!isMobileOpen) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = (): HTMLElement[] =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    focusable()[0]?.focus();
    const onTab = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const current = document.activeElement;
      if (!panel.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      if (opener?.isConnected) opener.focus();
    };
  }, [isMobileOpen]);

  const toggleSection = useCallback((key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const select = useCallback(
    (action: NavAction) => {
      onAction(action);
      onMobileClose();
    },
    [onAction, onMobileClose]
  );

  const activePath = activeItemPath(
    sections.flatMap((section) => section.items),
    pathname
  );
  const isActive = (item: NavItem): boolean =>
    item.action.type === "route" && item.action.path === activePath;

  return (
    <>
      {isMobileOpen && (
        <div
          className={styles.backdrop}
          onClick={onMobileClose}
          aria-hidden="true"
          data-backdrop=""
        />
      )}
      <nav
        ref={panelRef}
        className={`${styles.root} ${isMobileOpen ? styles.mobileOpen : ""}`}
        aria-label={translate(resolveLocale(locale), "nav.label")}
        dir={direction}
      >
        <SlotMount element={slots.header} />
        <div className={styles.sections}>
          {sections.map((section, index) => {
            const key = section.id ?? section.label ?? `section-${String(index)}`;
            const items = (
              <ul className={section.label ? styles.sectionItems : styles.sectionItemsFlat}>
                {section.items.map((item) => (
                  <ItemButton key={item.id} item={item} active={isActive(item)} onSelect={select} />
                ))}
              </ul>
            );
            if (!section.label) {
              return (
                <div key={key} className={styles.section}>
                  {items}
                </div>
              );
            }
            const expanded = !collapsed.has(key);
            return (
              <div key={key} className={styles.section}>
                <button
                  className={styles.sectionHeader}
                  onClick={() => toggleSection(key)}
                  aria-expanded={expanded}
                  type="button"
                >
                  <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ""}`}>
                    <ChevronIcon />
                  </span>
                  <span className={styles.sectionLabel}>{section.label}</span>
                </button>
                {expanded && items}
              </div>
            );
          })}
        </div>
        <SlotMount element={slots.footer} />
      </nav>
    </>
  );
}
