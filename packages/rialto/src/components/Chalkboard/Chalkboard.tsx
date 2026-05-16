import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import styles from "./Chalkboard.module.css";

/**
 * A stylized menu board rendered like a restaurant chalkboard. Composes with
 * `ChalkboardSection` and `ChalkboardItem` subcomponents. Purely presentational
 * — no interactivity, semantic HTML underneath the handwriting styling.
 *
 * @example
 * <Chalkboard title="Today's Specials" subtitle="March 15">
 *   <ChalkboardSection heading="Starters">
 *     <ChalkboardItem name="Crab Cakes" price="$14" />
 *   </ChalkboardSection>
 * </Chalkboard>
 */
export interface ChalkboardProps extends HTMLAttributes<HTMLElement> {
  /** Top-level header (rendered as <h2>) */
  title?: string;
  /** Secondary context beneath the title — often a date */
  subtitle?: string;
  /** Section content — typically ChalkboardSection components */
  children: ReactNode;
  /** Visual palette. @default "slate" */
  variant?: "slate" | "green";
  /** Wrap with a wooden frame border. @default false */
  framed?: boolean;
}

export const Chalkboard = forwardRef<HTMLElement, ChalkboardProps>(
  (
    { title, subtitle, children, variant = "slate", framed = false, className, ...rest },
    ref
  ) => {
    const classes = [
      styles.board,
      styles[`variant-${variant}`],
      framed && styles.framed,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <section ref={ref} className={classes} {...rest}>
        <div className={styles.surface}>
          {(title || subtitle) && (
            <header className={styles.header}>
              {title && <h2 className={styles.title}>{title}</h2>}
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </header>
          )}
          <div className={styles.content}>{children}</div>
          <div className={styles.chalkDust} aria-hidden="true" />
        </div>
      </section>
    );
  }
);
Chalkboard.displayName = "Chalkboard";

/* ── Section ─────────────────────────────────── */

export interface ChalkboardSectionProps extends HTMLAttributes<HTMLElement> {
  /** Section heading (rendered as <h3>) */
  heading?: string;
  children: ReactNode;
}

export const ChalkboardSection = forwardRef<HTMLElement, ChalkboardSectionProps>(
  ({ heading, children, className, ...rest }, ref) => {
    return (
      <section
        ref={ref}
        className={[styles.section, className].filter(Boolean).join(" ")}
        {...rest}
      >
        {heading && <h3 className={styles.sectionHeading}>{heading}</h3>}
        <ul className={styles.itemList}>{children}</ul>
      </section>
    );
  }
);
ChalkboardSection.displayName = "ChalkboardSection";

/* ── Item ────────────────────────────────────── */

export interface ChalkboardItemProps {
  /** Item name (e.g., "Crab Cakes") */
  name: string;
  /** Price shown on the right (e.g., "$14") */
  price?: string;
  /** Optional secondary description shown beneath the name */
  description?: string;
  /** Marks the item as sold out — struck through visually */
  soldOut?: boolean;
}

export function ChalkboardItem({
  name,
  price,
  description,
  soldOut = false,
}: ChalkboardItemProps) {
  const classes = [styles.item, soldOut && styles.soldOut].filter(Boolean).join(" ");

  return (
    <li className={classes}>
      <div className={styles.itemRow}>
        <span className={styles.itemName}>
          {name}
          {soldOut && (
            <span className={styles.soldOutLabel}>
              <span aria-hidden="true"> — </span>
              sold out
            </span>
          )}
        </span>
        {price && <span className={styles.itemPrice}>{price}</span>}
      </div>
      {description && <p className={styles.itemDescription}>{description}</p>}
    </li>
  );
}
ChalkboardItem.displayName = "ChalkboardItem";
