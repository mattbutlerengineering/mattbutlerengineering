import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { spring, precision } from "../../tokens/motion";
import { cn } from "../../utils/class-composer";
import styles from "./Sidebar.module.css";

/**
 * A single navigation link inside the sidebar.
 * Renders as an `<a>` when `href` is provided, otherwise as a `<button>`.
 *
 * @example
 * const item: SidebarItem = {
 *   id: "dashboard",
 *   label: "Dashboard",
 *   href: "/dashboard",
 *   icon: <DashboardIcon />,
 * };
 */
export interface SidebarItem {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  /** Marks the item as the current page -- renders with accent highlight. */
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * A labelled group of sidebar items, rendered under an optional section heading.
 * The heading is hidden automatically when the sidebar is collapsed.
 *
 * @example
 * const section: SidebarSection = {
 *   label: "Settings",
 *   items: [{ id: "profile", label: "Profile", href: "/settings/profile" }],
 * };
 */
export interface SidebarSection {
  /** Section heading. Hidden when the sidebar is collapsed. */
  label?: string;
  items: SidebarItem[];
}

function isSidebarSection(entry: SidebarItem | SidebarSection): entry is SidebarSection {
  return "items" in entry;
}

/**
 * Vertical navigation panel that supports collapsing to an icon-only rail.
 * Accepts a flat list of `SidebarItem`s or grouped `SidebarSection`s.
 * Width animates between expanded (240 px) and collapsed (56 px) using spring physics.
 *
 * @example
 * <Sidebar
 *   items={[
 *     { id: "home", label: "Home", href: "/", icon: <HomeIcon /> },
 *     { id: "settings", label: "Settings", href: "/settings" },
 *   ]}
 *   collapsed={false}
 *   onCollapse={(c) => setCollapsed(c)}
 * />
 */
export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** Flat items or grouped sections to render in the sidebar. */
  items: (SidebarItem | SidebarSection)[];
  /** Collapsed to icon-only mode */
  collapsed?: boolean;
  /** Collapse toggle callback */
  onCollapse?: (collapsed: boolean) => void;
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      animate={{ rotate: collapsed ? 180 : 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : precision}
    >
      <path d="M10 3L5 8l5 5" />
    </motion.svg>
  );
}

function ItemElement({ item, collapsed }: { item: SidebarItem; collapsed: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const classes = cn(
    styles.item,
    item.active && styles.itemActive,
    item.disabled && styles.itemDisabled
  );

  const content = (
    <>
      {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
      <motion.span
        className={styles.itemLabel}
        animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : "auto" }}
        transition={shouldReduceMotion ? { duration: 0 } : precision}
      >
        {item.label}
      </motion.span>
    </>
  );

  if (item.href) {
    return (
      <a
        className={classes}
        href={item.href}
        aria-current={item.active ? "page" : undefined}
        aria-disabled={item.disabled || undefined}
        tabIndex={item.disabled ? -1 : undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      onClick={item.onClick}
      disabled={item.disabled}
      aria-current={item.active ? "page" : undefined}
    >
      {content}
    </button>
  );
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  ({ items, collapsed = false, onCollapse, className, ...props }, ref) => {
    const shouldReduceMotion = useReducedMotion();

    const renderItems = (list: SidebarItem[]) =>
      list.map((item) => <ItemElement key={item.id} item={item} collapsed={collapsed} />);

    return (
      <motion.nav
        ref={ref}
        className={cn(styles.sidebar, className)}
        aria-label="Sidebar navigation"
        animate={{ width: collapsed ? 56 : 240 }}
        transition={shouldReduceMotion ? { duration: 0 } : spring}
        {...(props as React.ComponentProps<typeof motion.nav>)}
      >
        <div className={styles.content}>
          {items.map((entry, i) => {
            if (isSidebarSection(entry)) {
              return (
                <div key={entry.label ?? i} className={styles.section}>
                  {entry.label && !collapsed && (
                    <span className={styles.sectionLabel}>{entry.label}</span>
                  )}
                  {renderItems(entry.items)}
                </div>
              );
            }
            return <ItemElement key={entry.id} item={entry} collapsed={collapsed} />;
          })}
        </div>

        {onCollapse && (
          <button
            type="button"
            className={styles.collapseToggle}
            onClick={() => onCollapse(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        )}
      </motion.nav>
    );
  }
);

Sidebar.displayName = "Sidebar";
