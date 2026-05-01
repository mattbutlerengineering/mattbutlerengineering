import { forwardRef } from "react";
import styles from "./StatusLED.module.css";

export interface StatusLEDProps {
  /** The color of the LED indicator */
  variant?: "success" | "warning" | "danger" | "accent" | "neutral" | "off";
  /** Sizing presets or custom CSS size */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number | string;
  /** Whether the LED should gently breathe (pulse) */
  pulse?: boolean;
  /** Accessible label for the status */
  label?: string;
  className?: string;
}

/**
 * A reusable, recessed LED indicator that glows and breathes.
 * Used for status indicators in Avatars, MasterOverrides, and dashboard telltales.
 */
export const StatusLED = forwardRef<HTMLSpanElement, StatusLEDProps>(
  ({ variant = "neutral", size = "md", pulse = false, label, className }, ref) => {
    const isCustomSize = typeof size === "number" || (typeof size === "string" && !["xs", "sm", "md", "lg", "xl"].includes(size));
    
    const style = isCustomSize ? { 
      width: size, 
      height: size,
      "--rialto-led-size": typeof size === "number" ? `${size}px` : size 
    } as React.CSSProperties : undefined;

    const classes = [
      styles.led,
      !isCustomSize && styles[size as string],
      styles[variant],
      pulse && styles.pulse,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span
        ref={ref}
        className={classes}
        style={style}
        role={label ? "img" : "presentation"}
        aria-label={label}
        aria-hidden={!label}
      />
    );
  }
);

StatusLED.displayName = "StatusLED";
