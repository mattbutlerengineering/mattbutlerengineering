import { forwardRef, useId, useState, useCallback, type HTMLAttributes } from "react";
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
}

/** Product name, not translatable text. */
const BRAND_NAME = "MBE";

export const GlobalNav = forwardRef<HTMLElement, GlobalNavProps>(
  ({ currentApp, theme, onThemeToggle, labels, className, ...props }, ref) => {
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
          </ul>
        )}
      </nav>
    );
  }
);

GlobalNav.displayName = "GlobalNav";
