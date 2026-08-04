import { forwardRef, type ReactNode } from "react";
import { Button, type ButtonProps } from "../Button/Button";
import { cn, variantClass } from "../../utils/class-composer";
import styles from "./IconButton.module.css";

/**
 * Icon-only action trigger.
 *
 * Composes {@link Button} for all button semantics, focus-ring, and tactile
 * press-depth — this primitive only constrains the footprint to a square and
 * enforces an accessible label. Because there is no visible text, `aria-label`
 * is **required at the type level**: omitting it is a compile error.
 *
 * @example
 * <IconButton icon={<Trash2 />} aria-label="Delete" onClick={handleDelete} />
 */
export interface IconButtonProps extends Omit<
  ButtonProps,
  "children" | "isLoading" | "loadingText"
> {
  /** The glyph to render — a ~16–20px icon or inline SVG. */
  icon: ReactNode;
  /**
   * Accessible label announced by screen readers. REQUIRED — an icon-only
   * control has no text content, so omitting this is a compile error.
   */
  "aria-label": string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = "ghost", size = "md", type = "button", className, ...props },
  ref
) {
  const classes = cn(styles.iconButton, variantClass(styles, size, "md"), className);

  return (
    <Button ref={ref} variant={variant} type={type} className={classes} {...props}>
      {icon}
    </Button>
  );
});

IconButton.displayName = "IconButton";
