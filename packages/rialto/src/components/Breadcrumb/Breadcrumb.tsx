import { forwardRef, type ReactNode } from "react";
import styles from "./Breadcrumb.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * A single entry in the breadcrumb trail.
 * Omit `href` on the last item to mark it as the current page.
 *
 * @example
 * const crumb: BreadcrumbItem = {
 *   label: "Products",
 *   href: "/products",
 * };
 */
export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** URL or click handler — omit for current page */
  href?: string;
  onClick?: () => void;
  /** Optional icon rendered before label */
  icon?: ReactNode;
}

/**
 * Navigation trail showing the user's location within a hierarchy.
 * Automatically collapses middle items into an ellipsis when `maxItems` is set.
 *
 * @example
 * <Breadcrumb
 *   items={[
 *     { label: "Home", href: "/" },
 *     { label: "Products", href: "/products" },
 *     { label: "Widget" },
 *   ]}
 *   maxItems={3}
 * />
 */
export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /**
   * Max visible items before collapsing middle items with ellipsis.
   * First and last N items remain visible. 0 = no collapsing.
   */
  maxItems?: number;
  /** Custom separator — defaults to chevron */
  separator?: ReactNode;
  className?: string;
}

/* ── Chevron separator ──────────────────────── */
const ChevronSeparator = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4.5 2.5L7.5 6L4.5 9.5" />
  </svg>
);

/* ── Component ──────────────────────────────── */
export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(
  ({ items, maxItems = 0, separator, className = "" }, ref) => {
    const sep = separator ?? ChevronSeparator;

    // Determine which items to display
    let displayItems: (BreadcrumbItem | "ellipsis")[];

    if (maxItems > 0 && items.length > maxItems) {
      // Show first item, ellipsis, then last (maxItems - 1) items
      const tail = maxItems - 1;
      displayItems = [items[0]!, "ellipsis" as const, ...items.slice(-tail)];
    } else {
      displayItems = [...items];
    }

    return (
      <nav ref={ref} aria-label="Breadcrumb" className={`${styles.nav} ${className}`}>
        <ol className={styles.list}>
          {displayItems.map((item, i) => {
            const isLast = i === displayItems.length - 1;

            return (
              <li key={i} className={styles.item}>
                {/* Separator (not before first item) */}
                {i > 0 && (
                  <span className={styles.separator} aria-hidden="true">
                    {sep}
                  </span>
                )}

                {/* Ellipsis */}
                {item === "ellipsis" ? (
                  <span className={styles.ellipsis} aria-hidden="true">
                    &hellip;
                  </span>
                ) : isLast ? (
                  /* Current page */
                  <span className={styles.current} aria-current="page">
                    {item.icon && <>{item.icon} </>}
                    {item.label}
                  </span>
                ) : item.href ? (
                  /* Link */
                  <a href={item.href} className={styles.link} onClick={item.onClick}>
                    {item.icon && <>{item.icon} </>}
                    {item.label}
                  </a>
                ) : (
                  /* Button-style link (no href) */
                  <button type="button" className={styles.link} onClick={item.onClick}>
                    {item.icon && <>{item.icon} </>}
                    {item.label}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }
);
Breadcrumb.displayName = "Breadcrumb";
