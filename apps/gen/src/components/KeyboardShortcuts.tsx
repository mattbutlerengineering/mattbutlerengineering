import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useCallback, useMemo } from "react";
import { Kbd, Shortcut } from "@mattbutlerengineering/rialto";
import styles from "./KeyboardShortcuts.module.css";

interface ShortcutEntry {
  label: string;
  keys: string[];
}

interface ShortcutSection {
  title: string;
  items: ShortcutEntry[];
}

export interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac/i.test(navigator.userAgent);
}

/** Returns the platform-appropriate modifier key symbol. */
function modKey(): string {
  return isMac() ? "\u2318" : "Ctrl";
}

/**
 * Modal overlay displaying all keyboard shortcuts grouped by category.
 * Close via Escape, backdrop click, or the close button.
 */
export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const mod = useMemo(() => modKey(), []);

  const sections: ShortcutSection[] = useMemo(
    () => [
      {
        title: "Navigation",
        items: [
          { label: "Command palette", keys: [mod, "K"] },
          { label: "Templates gallery", keys: [mod, "T"] },
        ],
      },
      {
        title: "Editing",
        items: [
          { label: "Send prompt", keys: ["Enter"] },
          { label: "New line", keys: ["Shift", "Enter"] },
          { label: "Previous prompt", keys: ["\u2191"] },
          { label: "Next prompt", keys: ["\u2193"] },
          { label: "Stop generation", keys: ["Esc"] },
        ],
      },
      {
        title: "Panels",
        items: [
          { label: "Toggle history panel", keys: [mod, "1"] },
          { label: "Toggle JSON inspector", keys: [mod, "2"] },
          { label: "Toggle fullscreen", keys: [mod, "F"] },
        ],
      },
      {
        title: "General",
        items: [
          { label: "Show this help", keys: ["?"] },
        ],
      },
    ],
    [mod]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  const handleOverlayClick = useCallback(
    (e: ReactMouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop overlay; Escape key handled separately
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Keyboard Shortcuts</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            &#x2715;
          </button>
        </div>

        <div className={styles.body}>
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <div className={styles.shortcutList}>
                {section.items.map((item) => (
                  <div key={item.label} className={styles.row}>
                    <span className={styles.label}>{item.label}</span>
                    <span className={styles.keys}>
                      {item.keys.length === 1 ? (
                        <Kbd>{item.keys[0]}</Kbd>
                      ) : (
                        <Shortcut keys={item.keys} />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Press <Kbd>Esc</Kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}

export interface HelpButtonProps {
  onClick: () => void;
}

/**
 * Fixed-position "?" button in the bottom-right corner.
 * Hidden on mobile via CSS media query.
 */
export function HelpButton({ onClick }: HelpButtonProps) {
  return (
    <button
      type="button"
      className={styles.helpButton}
      onClick={onClick}
      aria-label="Keyboard shortcuts"
    >
      ?
    </button>
  );
}
