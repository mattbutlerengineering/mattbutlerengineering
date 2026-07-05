import React from "react";
import { IconButton } from "../IconButton/IconButton";

export interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
}

/**
 * Sun/moon icon button for toggling between light and dark mode.
 *
 * When in dark mode — shows sun icon (click switches to light).
 * When in light mode — shows moon icon (click switches to dark).
 *
 * Built on {@link IconButton}, so it inherits Button's focus-ring, tactile
 * press-depth, and reduced-motion handling instead of re-implementing button
 * semantics. The required accessible label is supplied here.
 */
export const ThemeToggle = React.forwardRef<HTMLButtonElement, ThemeToggleProps>(
  function ThemeToggle({ theme, onToggle }, ref) {
    const isDark = theme === "dark";

    return (
      <IconButton
        ref={ref}
        variant="secondary"
        onClick={onToggle}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        icon={
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {isDark ? (
              /* Sun icon — shown in dark mode to switch to light */
              <>
                <circle cx="8" cy="8" r="3" />
                <line x1="8" y1="1.5" x2="8" y2="3" />
                <line x1="8" y1="13" x2="8" y2="14.5" />
                <line x1="2.4" y1="2.4" x2="3.5" y2="3.5" />
                <line x1="12.5" y1="12.5" x2="13.6" y2="13.6" />
                <line x1="1.5" y1="8" x2="3" y2="8" />
                <line x1="13" y1="8" x2="14.5" y2="8" />
                <line x1="2.4" y1="13.6" x2="3.5" y2="12.5" />
                <line x1="12.5" y1="3.5" x2="13.6" y2="2.4" />
              </>
            ) : (
              /* Moon icon — shown in light mode to switch to dark */
              <path d="M12 3a6 6 0 1 0 0 10A6 6 0 0 1 12 3Z" />
            )}
          </svg>
        }
      />
    );
  }
);

ThemeToggle.displayName = "ThemeToggle";
