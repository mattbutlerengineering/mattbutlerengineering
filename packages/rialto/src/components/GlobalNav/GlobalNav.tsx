import {
  forwardRef,
  useId,
  useRef,
  useState,
  useCallback,
  type HTMLAttributes,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { ThemeToggle } from "../ThemeToggle/ThemeToggle";
import { cn } from "../../utils/class-composer";
import styles from "./GlobalNav.module.css";

/** Navigation item definition. */
interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly app: "marketing" | "hospitality" | "rialto";
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Home", href: "/", app: "marketing" },
  { label: "Hospitality", href: "/hospitality", app: "hospitality" },
  { label: "Design System", href: "/rialto", app: "rialto" },
];

/** A dropdown of same-site links that sits after the app links (a group in the mobile menu). */
export interface GlobalNavMenu {
  /** Trigger text and mobile group name. */
  readonly label: string;
  readonly items: readonly { label: string; href: string; current?: boolean }[];
}

/**
 * Cross-app navigation bar for mattbutlerengineering.com.
 *
 * Uses full `<a href>` tags (not React Router `<Link>`) because
 * navigation between apps requires full page loads — each app is
 * served by a separate Cloudflare Worker.
 *
 * @example
 * <GlobalNav currentApp="marketing" theme="dark" onThemeToggle={() => {}} />
 */
export interface GlobalNavProps extends Pick<
  HTMLAttributes<HTMLElement>,
  "id" | "aria-label" | "className" | "style"
> {
  /**
   * Which app is currently active — drives the active link indicator.
   * `"gen"` is a sibling app with no nav link of its own, so no link is marked active.
   */
  currentApp: "marketing" | "hospitality" | "rialto" | "gen";
  /** Current resolved theme for the theme toggle icon. */
  theme?: "light" | "dark";
  /** Called when the user clicks the theme toggle. */
  onThemeToggle?: () => void;
  /** Link labels per app, for consumers that localize them. Omitted apps keep the English defaults. */
  labels?: Partial<Record<NavItem["app"], string>>;
  /** Optional dropdown after the app links. The trigger is marked current when any item is. */
  menu?: GlobalNavMenu;
}

/** Product name, not translatable text. */
const BRAND_NAME = "MBE";

export const GlobalNav = forwardRef<HTMLElement, GlobalNavProps>(
  ({ currentApp, theme, onThemeToggle, labels, menu, className, ...props }, ref) => {
    const { messages } = useRialtoLocale();
    const [menuOpen, setMenuOpen] = useState(false);
    const mobileMenuId = useId();

    const handleToggle = useCallback(() => {
      setMenuOpen((prev) => !prev);
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Escape" && menuOpen) {
          setMenuOpen(false);
        }
      },
      [menuOpen]
    );

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLUListElement>(null);
    const menuCurrent = menu?.items.some((item) => item.current) ?? false;

    const handleDropdownKeyDown = useCallback((e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const links = Array.from(dropdownRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
      if (links.length === 0) return;
      e.preventDefault();
      const at = links.indexOf(document.activeElement as HTMLAnchorElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = at === -1 ? (step === 1 ? 0 : links.length - 1) : at + step;
      links[(next + links.length) % links.length]?.focus();
    }, []);

    const handleDropdownBlur = useCallback((e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDropdownOpen(false);
    }, []);

    const classes = cn(styles.globalNav, className);
    const items = NAV_ITEMS.map((item) => ({ ...item, label: labels?.[item.app] ?? item.label }));

    return (
      <nav ref={ref} className={classes} aria-label={messages.globalNavigation} {...props}>
        <div className={styles.inner}>
          {/* ── Brand ──────────────────────────────── */}
          <a href="/" className={styles.brand}>
            {BRAND_NAME}
          </a>

          {/* ── Desktop links ─────────────────────── */}
          <ul className={styles.desktopLinks}>
            {items.map((item) => (
              <li key={item.app}>
                <a
                  href={item.href}
                  className={cn(styles.link, currentApp === item.app && styles.active)}
                  aria-current={currentApp === item.app ? "page" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
            {menu && (
              <li>
                <div
                  role="presentation"
                  className={styles.dropdown}
                  onKeyDown={handleDropdownKeyDown}
                  onBlur={handleDropdownBlur}
                >
                  <button
                    ref={triggerRef}
                    type="button"
                    className={cn(styles.link, styles.trigger, menuCurrent && styles.active)}
                    aria-expanded={dropdownOpen}
                    aria-controls={dropdownId}
                    aria-current={menuCurrent ? "page" : undefined}
                    onClick={() => setDropdownOpen((prev) => !prev)}
                  >
                    {menu.label}
                  </button>
                  {dropdownOpen && (
                    <ul id={dropdownId} ref={dropdownRef} className={styles.dropdownList}>
                      {menu.items.map((item) => (
                        <li key={item.href}>
                          <a
                            href={item.href}
                            className={cn(styles.dropdownLink, item.current && styles.active)}
                            aria-current={item.current ? "page" : undefined}
                          >
                            {item.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )}
          </ul>

          {/* ── Actions (theme toggle) ────────────── */}
          <div className={styles.actions}>
            {theme && onThemeToggle && <ThemeToggle theme={theme} onToggle={onThemeToggle} />}

            {/* ── Mobile hamburger ──────────────────── */}
            <button
              type="button"
              className={styles.hamburger}
              onClick={handleToggle}
              onKeyDown={handleKeyDown}
              aria-expanded={menuOpen}
              aria-controls={mobileMenuId}
              aria-label={menuOpen ? messages.closeMenu : messages.openMenu}
            >
              <span className={cn(styles.hamburgerBar, menuOpen && styles.open)} />
            </button>
          </div>
        </div>

        {/* ── Mobile menu ─────────────────────────── */}
        {menuOpen && (
          <ul id={mobileMenuId} className={styles.mobileMenu}>
            {items.map((item) => (
              <li key={item.app}>
                <a
                  href={item.href}
                  className={cn(styles.mobileLink, currentApp === item.app && styles.active)}
                  aria-current={currentApp === item.app ? "page" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
            {menu && (
              <li role="presentation">
                <ul role="group" aria-label={menu.label} className={styles.mobileGroup}>
                  {menu.items.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className={cn(styles.mobileLink, item.current && styles.active)}
                        aria-current={item.current ? "page" : undefined}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </nav>
    );
  }
);

GlobalNav.displayName = "GlobalNav";
