import { forwardRef, type ButtonHTMLAttributes } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { precision, boop } from "../../tokens/motion";
import styles from "./Button.module.css";

type MotionButtonProps = HTMLMotionProps<"button">;

/**
 * Primary action trigger with tactile press feedback.
 * Use for any clickable action -- forms, dialogs, toolbar controls, etc.
 * The button scales down slightly on press to simulate physical depth change.
 *
 * @example
 * <Button variant="primary" size="md" onClick={handleSave}>
 *   Save changes
 * </Button>
 */
export interface ButtonProps extends Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "type" | "onClick" | "aria-label" | "id" | "name"
> {
  /** Visual style: `"primary"` (gold fill), `"secondary"` (aluminum outline), `"ghost"` (no border). */
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  children?: React.ReactNode;
  /** When true, shows a spinner and disables the button */
  isLoading?: boolean;
  /** Optional text to show while loading. If omitted, original children are shown. */
  loadingText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      className,
      children,
      disabled,
      isLoading,
      loadingText,
      onClick,
      ...props
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();

    const sizeClass = size !== "md" ? styles[size] : "";
    const classes = [
      styles.button,
      styles[variant],
      sizeClass,
      isLoading && styles.isLoading,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const isDisabled = disabled || isLoading;

    return (
      <motion.button
        ref={ref}
        className={classes}
        disabled={isDisabled}
        onClick={onClick}
        whileHover={
          isDisabled || shouldReduceMotion
            ? undefined
            : { scale: boop.scale, transition: boop.transition }
        }
        whileTap={isDisabled || shouldReduceMotion ? undefined : "pressed"}
        variants={{
          pressed: {
            scale: 0.975,
            y: 1,
          },
        }}
        transition={precision}
        {...(props as MotionButtonProps)}
      >
        {isLoading && (
          <Loader2 className={styles.spinner} size={size === "sm" ? 14 : 18} aria-hidden />
        )}
        <span className={isLoading ? styles.contentHidden : undefined}>
          {isLoading && loadingText ? loadingText : children}
        </span>
      </motion.button>
    );
  }
);

Button.displayName = "Button";
