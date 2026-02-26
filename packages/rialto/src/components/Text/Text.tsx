import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import styles from "./Text.module.css";

/* ── Types ───────────────────────────────────── */

type TextVariant = "body" | "caption" | "detail" | "label" | "display";
type TextColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "accent"
  | "success"
  | "error"
  | "on-accent";
type TextAlign = "left" | "center" | "right";

/**
 * Typography component that maps semantic variants to the Rialto type scale.
 *
 * Each variant renders a sensible default HTML element (e.g. `body` renders `<p>`,
 * `label` renders `<span>`), which can be overridden with the `as` prop.
 *
 * @example
 * <Text variant="display" color="primary">Welcome</Text>
 * <Text variant="caption" color="secondary">
 *   Updated 3 min ago
 * </Text>
 */
export interface TextProps extends HTMLAttributes<HTMLElement> {
  /** Typography preset — sets size, weight, color, and tracking defaults */
  variant?: TextVariant;
  /** Override the default color for the variant */
  color?: TextColor;
  /** Text alignment */
  align?: TextAlign;
  /** Render as a different HTML element */
  as?: ElementType;
  /** Use monospace font */
  mono?: boolean;
  /** Truncate with ellipsis (single line) */
  truncate?: boolean;
  children?: ReactNode;
}

/* ── Default elements per variant ────────────── */

const DEFAULT_ELEMENT: Record<TextVariant, ElementType> = {
  body: "p",
  caption: "p",
  detail: "span",
  label: "span",
  display: "p",
};

/* ── Class helpers ───────────────────────────── */

const colorClass: Record<TextColor, string> = {
  primary: "colorPrimary",
  secondary: "colorSecondary",
  tertiary: "colorTertiary",
  accent: "colorAccent",
  success: "colorSuccess",
  error: "colorError",
  "on-accent": "colorOnAccent",
};

const alignClass: Record<TextAlign, string> = {
  left: "alignLeft",
  center: "alignCenter",
  right: "alignRight",
};

/* ── Component ──────────────────────────────── */

export const Text = forwardRef<HTMLElement, TextProps>(
  (
    {
      variant = "body",
      color,
      align,
      as,
      mono = false,
      truncate = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const Tag = as ?? DEFAULT_ELEMENT[variant];

    const classes = [
      styles.text,
      styles[variant],
      color ? styles[colorClass[color]] : "",
      align ? styles[alignClass[align]] : "",
      mono ? styles.mono : "",
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
  }
);

Text.displayName = "Text";
