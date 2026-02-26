import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { springGentle } from "../../tokens/motion";
import styles from "./Navbar.module.css";

/**
 * A navigation link inside the Navbar, optionally nested to create expandable sub-menus.
 * Links with `children` render a chevron toggle that reveals the nested level inline.
 *
 * @example
 * const link: NavbarLink = {
 *   id: "docs",
 *   label: "Documentation",
 *   href: "/docs",
 *   badge: 3,
 * };
 */
export interface NavbarLink {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  /** Numeric badge shown to the right of the label (e.g., unread count). */
  badge?: number;
  /** Nested links revealed by an inline expand toggle. */
  children?: NavbarLink[];
}

/**
 * Full-featured top navigation bar with logo, search, user profile, and link tree.
 * Designed as a vertical sidebar-style navbar (logo and search at top, links below, optional footer).
 *
 * @example
 * <Navbar
 *   logo={<img src="/logo.svg" alt="Acme" />}
 *   links={[
 *     { id: "home", label: "Home", href: "/" },
 *     { id: "settings", label: "Settings", href: "/settings" },
 *   ]}
 *   search={{ placeholder: "Search...", onSearch: console.log }}
 * />
 */
export interface NavbarProps extends HTMLAttributes<HTMLElement> {
  logo?: ReactNode;
  /** User profile block rendered in the header area. */
  user?: {
    name: string;
    email?: string;
    /** Custom avatar element. Falls back to the first letter of `name`. */
    avatar?: ReactNode;
  };
  /** Search input configuration. Renders a search field when provided. */
  search?: {
    placeholder?: string;
    onSearch?: (value: string) => void;
  };
  links: NavbarLink[];
  /** Content rendered at the bottom of the navbar (e.g., version info, logout button). */
  footer?: ReactNode;
}

/**
 * Internal props for rendering a single link row inside the Navbar.
 * Not exported -- used only by the `NavbarLinkItem` sub-component.
 */
interface NavbarLinkItemProps {
  link: NavbarLink;
  /** Nesting depth, used to calculate left padding for visual hierarchy. */
  level: number;
}

function NavbarLinkItem({ link, level }: NavbarLinkItemProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = link.children && link.children.length > 0;

  return (
    <div className={styles.linkWrapper}>
      <a
        href={link.href || "#"}
        className={styles.link}
        style={{ paddingInlineStart: `${level * 16 + 12}px` }}
      >
        {link.icon && <span className={styles.linkIcon}>{link.icon}</span>}
        <span className={styles.linkLabel}>{link.label}</span>
        {link.badge !== undefined && <span className={styles.linkBadge}>{link.badge}</span>}
        {hasChildren && (
          <motion.button
            className={styles.chevronButton}
            onClick={(e) => {
              e.preventDefault();
              setIsOpen(!isOpen);
            }}
            aria-expanded={isOpen}
            aria-label="Toggle submenu"
          >
            <motion.svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : springGentle}
            >
              <path d="M4 2l4 4-4 4" />
            </motion.svg>
          </motion.button>
        )}
      </a>

      {hasChildren && isOpen && (
        <div className={styles.linkChildren}>
          {link.children!.map((child) => (
            <NavbarLinkItem key={child.id} link={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export const Navbar = forwardRef<HTMLElement, NavbarProps>(
  ({ logo, user, search, links, footer, className, ...props }, ref) => {
    const [searchValue, setSearchValue] = useState("");

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.target.value);
      search?.onSearch?.(e.target.value);
    };

    return (
      <nav ref={ref} className={[styles.navbar, className].filter(Boolean).join(" ")} {...props}>
        {/* Section 1: Header */}
        <div className={styles.header}>
          {logo && <div className={styles.logo}>{logo}</div>}

          {search && (
            <div className={styles.searchWrapper}>
              <svg
                className={styles.searchIcon}
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="6" cy="6" r="4.5" />
                <path d="M9.5 9.5L13 13" />
              </svg>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={search.placeholder || "Search..."}
                value={searchValue}
                onChange={handleSearchChange}
              />
              <kbd className={styles.searchKbd}>Ctrl K</kbd>
            </div>
          )}

          {user && (
            <div className={styles.user}>
              {user.avatar ? (
                <div className={styles.userAvatar}>{user.avatar}</div>
              ) : (
                <div className={styles.userAvatar}>{user.name.charAt(0).toUpperCase()}</div>
              )}
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.name}</span>
                {user.email && <span className={styles.userEmail}>{user.email}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Links */}
        <div className={styles.links}>
          {links.map((link) => (
            <NavbarLinkItem key={link.id} link={link} level={0} />
          ))}
        </div>

        {/* Footer */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </nav>
    );
  }
);

Navbar.displayName = "Navbar";
