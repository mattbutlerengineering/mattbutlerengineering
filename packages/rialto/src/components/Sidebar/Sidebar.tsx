import { forwardRef, useId, type HTMLAttributes, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
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
  const motionPreset = useMotionPreset();
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
      transition={motionPreset.precision}
    >
      <path d="M10 3L5 8l5 5" />
    </motion.svg>
  );
}

function ItemElement({ item, collapsed }: { item: SidebarItem; collapsed: boolean }) {
  const motionPreset = useMotionPreset();
  const shouldReduceMotion = motionPreset.reduced;
  const classes = cn(
    styles.item,
    item.active && styles.itemActive,
    item.disabled && styles.itemDisabled
  );

  // Keep position/scale correction on the collapsing rail so text and icons
  // are never distorted by the parent nav's transform-based width animation.
  const layoutMode = shouldReduceMotion ? false : "position";
  const layoutTransition = motionPreset.spring;

  const content = (
    <>
      {item.icon && (
        <motion.span className={styles.itemIcon} layout={layoutMode} transition={layoutTransition}>
          {item.icon}
        </motion.span>
      )}
      <motion.span
        className={styles.itemLabel}
        layout={layoutMode}
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={motionPreset.precision}
      >
        {item.label}
      </motion.span>
    </>
  );

  if (item.href) {
    return (
      <motion.a
        className={classes}
        href={item.href}
        aria-current={item.active ? "page" : undefined}
        aria-disabled={item.disabled || undefined}
        tabIndex={item.disabled ? -1 : undefined}
        layout={layoutMode}
        transition={layoutTransition}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.button
      type="button"
      className={classes}
      onClick={item.onClick}
      disabled={item.disabled}
      aria-current={item.active ? "page" : undefined}
      layout={layoutMode}
      transition={layoutTransition}
    >
      {content}
    </motion.button>
  );
}

function SectionGroup({
  section,
  collapsed,
  children,
}: {
  section: SidebarSection;
  collapsed: boolean;
  children: ReactNode;
}) {
  const labelId = useId();
  const showLabel = Boolean(section.label) && !collapsed;
  return (
    <div className={styles.section} role="group" aria-labelledby={showLabel ? labelId : undefined}>
      {showLabel && (
        <span id={labelId} className={styles.sectionLabel}>
          {section.label}
        </span>
      )}
      {children}
    </div>
  );
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  ({ items, collapsed = false, onCollapse, className, ...props }, ref) => {
    const motionPreset = useMotionPreset();
    const shouldReduceMotion = motionPreset.reduced;

    const renderItems = (list: SidebarItem[]) =>
      list.map((item) => <ItemElement key={item.id} item={item} collapsed={collapsed} />);

    return (
      <motion.nav
        ref={ref}
        aria-label="Sidebar navigation"
        layout={shouldReduceMotion ? false : true}
        transition={motionPreset.spring}
        {...(props as React.ComponentProps<typeof motion.nav>)}
        className={cn(styles.sidebar, className)}
        style={{ width: collapsed ? 56 : 240, ...props.style }}
      >
        <div className={styles.content}>
          {items.map((entry, i) => {
            if (isSidebarSection(entry)) {
              return (
                <SectionGroup key={entry.label ?? i} section={entry} collapsed={collapsed}>
                  {renderItems(entry.items)}
                </SectionGroup>
              );
            }
            return <ItemElement key={entry.id} item={entry} collapsed={collapsed} />;
          })}
        </div>

        {onCollapse && (
          <motion.button
            type="button"
            className={styles.collapseToggle}
            onClick={() => onCollapse(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            layout={shouldReduceMotion ? false : "position"}
            transition={motionPreset.spring}
          >
            <CollapseIcon collapsed={collapsed} />
          </motion.button>
        )}
      </motion.nav>
    );
  }
);

Sidebar.displayName = "Sidebar";
