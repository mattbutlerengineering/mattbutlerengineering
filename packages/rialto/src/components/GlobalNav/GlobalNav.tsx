import { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
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
 * <GlobalNav currentApp="marketing" />
 */
export interface GlobalNavProps
  extends Pick<HTMLAttributes<HTMLElement>, "id" | "aria-label" | "className" | "style"> {
  /** Which app is currently active — drives the active link indicator. */
  currentApp: "marketing" | "hospitality" | "rialto";
}

export const GlobalNav = forwardRef<HTMLElement, GlobalNavProps>(
  ({ currentApp, className, ...props }, ref) => {
    const [menuOpen, setMenuOpen] = useState(false);

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

    const classes = [styles.globalNav, className].filter(Boolean).join(" ");

    return (
      <nav
        ref={ref}
        className={classes}
        aria-label="Global navigation"
        {...props}
      >
        <div className={styles.inner}>
          {/* ── Brand ──────────────────────────────── */}
          <a href="/" className={styles.brand}>
            MBE
          </a>

          {/* ── Desktop links ─────────────────────── */}
          <ul className={styles.desktopLinks}>
            {NAV_ITEMS.map((item) => (
              <li key={item.app}>
                <a
                  href={item.href}
                  className={[styles.link, currentApp === item.app ? styles.active : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={currentApp === item.app ? "page" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          {/* ── Mobile hamburger ──────────────────── */}
          <button
            type="button"
            className={styles.hamburger}
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
            aria-expanded={menuOpen}
            aria-controls="global-nav-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <span className={[styles.hamburgerBar, menuOpen ? styles.open : ""].filter(Boolean).join(" ")} />
          </button>
        </div>

        {/* ── Mobile menu ─────────────────────────── */}
        {menuOpen && (
          <ul
            id="global-nav-mobile-menu"
            className={styles.mobileMenu}
          >
            {NAV_ITEMS.map((item) => (
              <li key={item.app}>
                <a
                  href={item.href}
                  className={[styles.mobileLink, currentApp === item.app ? styles.active : ""]
                    .filter(Boolean)
                    .join(" ")}
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
