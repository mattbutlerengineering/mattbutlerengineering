import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useCallback, useMemo } from "react";
import { Kbd, Shortcut } from "@mattbutlerengineering/rialto";
import { SHORTCUTS, SHORTCUT_SECTIONS, displayKeys } from "../lib/shortcuts.js";
import styles from "./KeyboardShortcuts.module.css";

export interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal overlay displaying all keyboard shortcuts grouped by category.
 * Close via Escape, backdrop click, or the close button.
 */
export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const sections = useMemo(
    () =>
      SHORTCUT_SECTIONS.map((title) => ({
        title,
        items: SHORTCUTS.filter((s) => s.section === title).map((s) => ({
          label: s.label,
          keys: displayKeys(s),
        })),
      })),
    []
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
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
        <div className={styles.header}>
          <h2 className={styles.title}>Keyboard Shortcuts</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>

        <div className={styles.body}>
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <div className={styles.shortcutList}>
                {section.items.map((item) => {
                  const firstKey = item.keys[0];
                  return (
                    <div key={item.label} className={styles.row}>
                      <span className={styles.label}>{item.label}</span>
                      <span className={styles.keys}>
                        {item.keys.length === 1 && firstKey ? (
                          <Kbd>{firstKey}</Kbd>
                        ) : (
                          <Shortcut keys={item.keys} />
                        )}
                      </span>
                    </div>
                  );
                })}
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
