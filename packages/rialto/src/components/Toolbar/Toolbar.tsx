import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";
import { useDirection } from "../../hooks/useDirection";
import { cn } from "../../utils/class-composer";
import styles from "./Toolbar.module.css";

const CONTROL_SELECTOR = [
  "button",
  "a[href]",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[role='button']",
  "[tabindex]",
].join(",");

function isEnabled(el: HTMLElement): boolean {
  return !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true";
}

/* ── Toolbar ─────────────────────────────────── */

/**
 * Groups related controls into a single Tab stop with roving focus (WAI-ARIA APG Toolbar).
 * Arrow keys move between enabled controls, Home/End jump to the ends, and the arrow
 * keys are mirrored for horizontal toolbars in RTL.
 *
 * @example
 * <Toolbar aria-label="Formatting">
 *   <Button>Bold</Button>
 *   <Button>Italic</Button>
 *   <ToolbarSeparator />
 *   <Button>Link</Button>
 * </Toolbar>
 */
export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  /** Layout axis and which arrow keys move focus. Defaults to horizontal. */
  orientation?: "horizontal" | "vertical";
}

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(
  ({ orientation = "horizontal", className, children, onKeyDown, onFocus, ...rest }, ref) => {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const activeRef = useRef<HTMLElement | null>(null);
    const dir = useDirection(innerRef);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    const getControls = (): HTMLElement[] =>
      innerRef.current
        ? Array.from(innerRef.current.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))
        : [];

    // Keep exactly one enabled control tabbable: the last focused, else the first.
    useLayoutEffect(() => {
      const controls = getControls();
      const enabled = controls.filter(isEnabled);
      const active =
        activeRef.current && enabled.includes(activeRef.current) ? activeRef.current : enabled[0];
      for (const el of controls) el.tabIndex = el === active ? 0 : -1;
    });

    const moveTo = (target: HTMLElement | undefined) => {
      if (!target) return;
      for (const el of getControls()) el.tabIndex = el === target ? 0 : -1;
      activeRef.current = target;
      target.focus();
    };

    const handleFocus: ToolbarProps["onFocus"] = (event) => {
      onFocus?.(event);
      const target = event.target as HTMLElement;
      if (target !== event.currentTarget && getControls().includes(target) && isEnabled(target)) {
        for (const el of getControls()) el.tabIndex = el === target ? 0 : -1;
        activeRef.current = target;
      }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      const enabled = getControls().filter(isEnabled);
      const index = enabled.indexOf(event.target as HTMLElement);
      if (index === -1) return;

      const horizontal = orientation === "horizontal";
      const forwardKey = horizontal ? (dir === "rtl" ? "ArrowLeft" : "ArrowRight") : "ArrowDown";
      const backKey = horizontal ? (dir === "rtl" ? "ArrowRight" : "ArrowLeft") : "ArrowUp";

      let target: HTMLElement | undefined;
      if (event.key === forwardKey) target = enabled[(index + 1) % enabled.length];
      else if (event.key === backKey)
        target = enabled[(index - 1 + enabled.length) % enabled.length];
      else if (event.key === "Home") target = enabled[0];
      else if (event.key === "End") target = enabled[enabled.length - 1];
      else return;

      event.preventDefault();
      moveTo(target);
    };

    return (
      <div
        {...rest}
        ref={setRefs}
        role="toolbar"
        aria-orientation={orientation}
        className={cn(styles.toolbar, orientation === "vertical" && styles.vertical, className)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      >
        {children}
      </div>
    );
  }
);
Toolbar.displayName = "Toolbar";

/* ── ToolbarSeparator ────────────────────────── */

/**
 * Visual divider between toolbar control groups. Rendered perpendicular to the toolbar axis.
 * Pass `orientation` matching the parent toolbar's orientation; it defaults to horizontal
 * toolbars (a vertical rule).
 */
export interface ToolbarSeparatorProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  /** The parent toolbar's orientation. The rule is drawn perpendicular to it. */
  toolbarOrientation?: "horizontal" | "vertical";
}

export const ToolbarSeparator = forwardRef<HTMLDivElement, ToolbarSeparatorProps>(
  ({ toolbarOrientation = "horizontal", className, ...rest }, ref) => {
    const separatorOrientation = toolbarOrientation === "horizontal" ? "vertical" : "horizontal";
    return (
      <div
        {...rest}
        ref={ref}
        role="separator"
        aria-orientation={separatorOrientation}
        className={cn(
          styles.separator,
          separatorOrientation === "vertical"
            ? styles.separatorVertical
            : styles.separatorHorizontal,
          className
        )}
      />
    );
  }
);
ToolbarSeparator.displayName = "ToolbarSeparator";
