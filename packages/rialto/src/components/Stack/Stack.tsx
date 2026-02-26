import { forwardRef, type HTMLAttributes, type ElementType } from "react";
import styles from "./Stack.module.css";

/* ── Types ───────────────────────────────────── */

type StackGap = "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
type StackJustify = "start" | "center" | "end" | "between";

/**
 * Flexbox layout primitive for stacking children vertically or horizontally with
 * consistent spacing from the Rialto token scale.
 *
 * Defaults to a vertical column; set `direction="row"` for horizontal layout.
 *
 * @example
 * <Stack gap="md" align="center">
 *   <Text variant="label">Name</Text>
 *   <Text>Jane Doe</Text>
 * </Stack>
 */
export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** Stack direction */
  direction?: "column" | "row";
  /** Gap between children — maps to --rialto-space-* tokens */
  gap?: StackGap;
  /** Cross-axis alignment */
  align?: StackAlign;
  /** Main-axis justification */
  justify?: StackJustify;
  /** Allow wrapping */
  wrap?: boolean;
  /** Render as a different HTML element */
  as?: ElementType;
}

/* ── Class maps ──────────────────────────────── */

const gapClass: Record<StackGap, string> = {
  "2xs": "gap2xs",
  xs: "gapXs",
  sm: "gapSm",
  md: "gapMd",
  lg: "gapLg",
  xl: "gapXl",
  "2xl": "gap2xl",
  "3xl": "gap3xl",
};

const alignClass: Record<StackAlign, string> = {
  start: "alignStart",
  center: "alignCenter",
  end: "alignEnd",
  stretch: "alignStretch",
  baseline: "alignBaseline",
};

const justifyClass: Record<StackJustify, string> = {
  start: "justifyStart",
  center: "justifyCenter",
  end: "justifyEnd",
  between: "justifyBetween",
};

/* ── Component ──────────────────────────────── */

export const Stack = forwardRef<HTMLElement, StackProps>(
  (
    {
      direction = "column",
      gap,
      align,
      justify,
      wrap = false,
      as: Tag = "div",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const classes = [
      styles.stack,
      direction === "row" ? styles.row : "",
      gap ? styles[gapClass[gap]] : "",
      align ? styles[alignClass[align]] : "",
      justify ? styles[justifyClass[justify]] : "",
      wrap ? styles.wrap : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <Tag ref={ref} className={classes} {...props}>
        {children}
      </Tag>
    );
  }
);

Stack.displayName = "Stack";
