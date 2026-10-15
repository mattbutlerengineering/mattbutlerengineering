import { forwardRef, useCallback, useEffect, useRef, type ForwardedRef } from "react";
import { motion } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import styles from "./Pagination.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Page navigation control with previous/next arrows and numbered page buttons.
 * Pages are 1-indexed. When there are many pages, middle buttons collapse into ellipsis
 * based on `siblingCount`.
 *
 * @example
 * <Pagination
 *   page={3}
 *   totalPages={20}
 *   onChange={(p) => setPage(p)}
 *   siblingCount={1}
 * />
 */
export interface PaginationProps {
  /** Current active page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Called when page changes */
  onChange: (page: number) => void;
  /**
   * Max page buttons visible (including first/last).
   * Middle pages collapse to ellipsis beyond this count.
   */
  siblingCount?: number;
  className?: string;
  /**
   * Accessible name for the nav landmark. Defaults to "Pagination" — override
   * this when a page renders more than one Pagination instance, since axe's
   * landmark-unique rule requires each nav landmark on a page to have a
   * distinct accessible name.
   */
  ariaLabel?: string;
}

/* ── Range helper ────────────────────────────── */
function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) result.push(i);
  return result;
}

/**
 * Build the page items to display.
 * Returns an array of page numbers and "ellipsis" markers.
 */
function buildPages(
  page: number,
  totalPages: number,
  siblingCount: number
): (number | "ellipsis")[] {
  // If total pages fits within the budget, show all
  const totalSlots = siblingCount * 2 + 5; // siblings + first + last + 2 ellipses + current
  if (totalPages <= totalSlots) {
    return range(1, totalPages);
  }

  const leftSibling = Math.max(page - siblingCount, 1);
  const rightSibling = Math.min(page + siblingCount, totalPages);

  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    // Show expanded left, collapsed right
    const leftRange = range(1, siblingCount * 2 + 3);
    return [...leftRange, "ellipsis", totalPages];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    // Show collapsed left, expanded right
    const rightRange = range(totalPages - (siblingCount * 2 + 2), totalPages);
    return [1, "ellipsis", ...rightRange];
  }

  // Both sides collapsed
  const middleRange = range(leftSibling, rightSibling);
  return [1, "ellipsis", ...middleRange, "ellipsis", totalPages];
}

/* ── Arrow icons ─────────────────────────────── */
const ChevronLeft = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8.5 3.5L5 7l3.5 3.5" />
  </svg>
);

const ChevronRight = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5.5 3.5L9 7l-3.5 3.5" />
  </svg>
);

/* ── Component ──────────────────────────────── */
type ArrowDirection = "prev" | "next";

function assignRef<T>(ref: ForwardedRef<T>, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

export const Pagination = forwardRef<HTMLElement, PaginationProps>(
  (
    { page, totalPages, onChange, siblingCount = 1, className = "", ariaLabel = "Pagination" },
    ref
  ) => {
    const pages = buildPages(page, totalPages, siblingCount);
    const motionPreset = useMotionPreset();
    const boopHover = motionPreset.boop;
    const navRef = useRef<HTMLElement | null>(null);
    const pendingArrowRef = useRef<{ direction: ArrowDirection; target: number } | null>(null);

    const setNavRef = useCallback(
      (node: HTMLElement | null) => {
        navRef.current = node;
        assignRef(ref, node);
      },
      [ref]
    );

    // Activating an arrow can land on the first/last page and disable that very
    // button, dropping focus to <body>. Hand focus to the current page instead,
    // but only if the page really became the clicked target.
    useEffect(() => {
      const pending = pendingArrowRef.current;
      pendingArrowRef.current = null;
      if (!pending || page !== pending.target) return;
      const atBound = pending.direction === "prev" ? page <= 1 : page >= totalPages;
      if (!atBound) return;
      navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
    }, [page, totalPages]);

    const goTo = (target: number, direction: ArrowDirection | null) => {
      const pending = direction ? { direction, target } : null;
      pendingArrowRef.current = pending;
      onChange(target);
      // A parent that ignores the click never re-renders us, so the handoff would
      // linger and fire on a later, unrelated page change. Drop it once the click's
      // own update cycle is over.
      setTimeout(() => {
        if (pendingArrowRef.current === pending) pendingArrowRef.current = null;
      }, 0);
    };

    return (
      <nav ref={setNavRef} aria-label={ariaLabel} className={cn(styles.pagination, className)}>
        <ul className={styles.list}>
          {/* Previous */}
          <li className={styles.listItem}>
            <motion.button
              type="button"
              className={styles.arrow}
              onClick={() => goTo(page - 1, "prev")}
              disabled={page <= 1}
              aria-label="Previous page"
              whileHover={page <= 1 ? undefined : boopHover}
            >
              {ChevronLeft}
            </motion.button>
          </li>

          {/* Pages */}
          {pages.map((item, i) =>
            item === "ellipsis" ? (
              <li key={`ellipsis-${i}`} className={styles.listItem} aria-hidden="true">
                <span className={styles.ellipsis}>&hellip;</span>
              </li>
            ) : (
              <li key={item} className={styles.listItem}>
                <motion.button
                  type="button"
                  className={cn(styles.page, item === page && styles.active)}
                  onClick={() => goTo(item, null)}
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? "page" : undefined}
                  whileHover={boopHover}
                >
                  {item}
                </motion.button>
              </li>
            )
          )}

          {/* Next */}
          <li className={styles.listItem}>
            <motion.button
              type="button"
              className={styles.arrow}
              onClick={() => goTo(page + 1, "next")}
              disabled={page >= totalPages}
              aria-label="Next page"
              whileHover={page >= totalPages ? undefined : boopHover}
            >
              {ChevronRight}
            </motion.button>
          </li>
        </ul>
      </nav>
    );
  }
);
Pagination.displayName = "Pagination";
