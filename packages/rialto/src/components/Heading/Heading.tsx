import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import styles from "./Heading.module.css";

/* ── Types ───────────────────────────────────── */

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingSize = HeadingLevel;

type HeadingColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "on-accent";

type HeadingAlign = "left" | "center" | "right";

/**
 * Semantic heading primitive. `level` controls the rendered HTML element
 * (`h1`–`h6`) and is the primary input — it represents document outline
 * position. `size` decouples visual weight from semantic level when those
 * need to diverge (e.g., a big section opener that's still the page's
 * second heading).
 *
 * Uses the display font (Bricolage Grotesque) with tight leading and
 * tight tracking, matching Rialto's `Text variant="display"` DNA.
 *
 * @example Default — an `h2` at size 2
 * <Heading>Section title</Heading>
 *
 * @example Page title
 * <Heading level={1}>Reservations</Heading>
 *
 * @example Visually large h2
 * <Heading level={2} size={1}>Big section opener</Heading>
 *
 * @example Render as a non-heading element but keep the styling
 * <Heading level={2} as="div">Styled like a heading, not in the outline</Heading>
 */
export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Semantic heading level — also the default rendered element. @default 2 */
  level?: HeadingLevel;
  /** Visual size override. Defaults to `level`. */
  size?: HeadingSize;
  /** Override the default color for the level */
  color?: HeadingColor;
  /** Text alignment */
  align?: HeadingAlign;
  /** Render as a different HTML element (e.g., "div" for visual-only headings) */
  as?: ElementType;
  /** Truncate with ellipsis (single line) */
  truncate?: boolean;
  children?: ReactNode;
}

/* ── Class helpers ───────────────────────────── */

const sizeClass: Record<HeadingSize, string> = {
  1: "size1",
  2: "size2",
  3: "size3",
  4: "size4",
  5: "size5",
  6: "size6",
};

const colorClass: Record<HeadingColor, string> = {
  primary: "colorPrimary",
  secondary: "colorSecondary",
  tertiary: "colorTertiary",
  accent: "colorAccent",
  success: "colorSuccess",
  warning: "colorWarning",
  error: "colorError",
  "on-accent": "colorOnAccent",
};

const alignClass: Record<HeadingAlign, string> = {
  left: "alignLeft",
  center: "alignCenter",
  right: "alignRight",
};

/* ── Component ──────────────────────────────── */

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  (
    {
      level = 2,
      size,
      color,
      align,
      as,
      truncate = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const Tag = (as ?? (`h${level}` as ElementType));
    const resolvedSize = size ?? level;

    const classes = [
      styles.heading,
      styles[sizeClass[resolvedSize]],
      color ? styles[colorClass[color]] : "",
      align ? styles[alignClass[align]] : "",
      truncate ? styles.truncate : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <Tag ref={ref} className={classes} {...props}>
        {children}
      </Tag>
    );
  },
);

Heading.displayName = "Heading";
