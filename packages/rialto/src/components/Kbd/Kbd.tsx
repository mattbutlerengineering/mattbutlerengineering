import { forwardRef } from "react";
import styles from "./Kbd.module.css";

/* ── Single key cap ─────────────────────────── */

/**
 * Renders a single keyboard key in a styled `<kbd>` element that resembles
 * a physical key cap with a machined-surface look.
 *
 * @example
 * <Kbd>Esc</Kbd>
 * <Kbd>A</Kbd>
 */
export interface KbdProps {
  children: string;
  className?: string;
}

export const Kbd = forwardRef<HTMLElement, KbdProps>(({ children, className = "" }, ref) => {
  return (
    <kbd ref={ref} className={`${styles.kbd} ${className}`}>
      {children}
    </kbd>
  );
});
Kbd.displayName = "Kbd";

/* ── Shortcut combo (e.g. ⌘ + K) ───────────── */

/**
 * Displays a multi-key shortcut as a horizontal sequence of {@link Kbd} caps
 * separated by `+` glyphs.
 *
 * @example
 * <Shortcut keys={["⌘", "K"]} />
 * <Shortcut keys={["Ctrl", "Shift", "P"]} />
 */
export interface ShortcutProps {
  /** Array of key labels, e.g. ["⌘", "K"] */
  keys: string[];
  className?: string;
}

export const Shortcut = forwardRef<HTMLSpanElement, ShortcutProps>(
  ({ keys, className = "" }, ref) => {
    return (
      <span ref={ref} className={`${styles.shortcut} ${className}`}>
        {keys.map((key, i) => (
          <span key={i}>
            {i > 0 && <span className={styles.separator}>+</span>}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </span>
    );
  }
);
Shortcut.displayName = "Shortcut";
