import { forwardRef, type ButtonHTMLAttributes } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
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
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "secondary", size = "md", className, children, disabled, onClick, ...props },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();

    const sizeClass = size !== "md" ? styles[size] : "";
    const classes = [styles.button, styles[variant], sizeClass, className]
      .filter(Boolean)
      .join(" ");

    return (
      <motion.button
        ref={ref}
        className={classes}
        disabled={disabled}
        onClick={onClick}
        whileHover={
          disabled || shouldReduceMotion
            ? undefined
            : { scale: boop.scale, transition: boop.transition }
        }
        whileTap={disabled || shouldReduceMotion ? undefined : "pressed"}
        variants={{
          pressed: {
            scale: 0.975,
            y: 1,
          },
        }}
        transition={precision}
        {...(props as MotionButtonProps)}
      >
        {children}
      </motion.button>
    );
  }
);

Button.displayName = "Button";
