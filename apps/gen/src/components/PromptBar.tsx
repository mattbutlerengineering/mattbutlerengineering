import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import { Button } from "@mbe/rialto";
import styles from "./PromptBar.module.css";

export interface PromptBarProps {
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  /** Controls placeholder text and button labels. Defaults to "generate". */
  mode?: "generate" | "refine";
  /** Called when user clicks the "New" button to exit refinement mode. */
  onExitRefinement?: () => void;
}

const MAX_CHARS = 2000;
const WARN_CHARS = 1500;
const MAX_HISTORY = 50;
const MAX_ROWS = 6;
const LINE_HEIGHT_PX = 24;

/**
 * Bottom bar with text input and Generate/Stop toggle button.
 * Submits on Enter (unless empty). Clears input after submit.
 * Supports prompt history recall (Up/Down), auto-resize, and character count.
 * In "refine" mode, shows a different placeholder and a "New" exit button.
 */
export function PromptBar({
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  mode = "generate",
  onExitRefinement,
}: PromptBarProps) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<readonly string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRefineMode = mode === "refine";
  const placeholder = isRefineMode
    ? "Refine this UI..."
    : "Describe the UI you want to build...";
  const submitLabel = isRefineMode ? "Refine" : "Generate";

  const charCount = value.length;
  const isOverWarn = charCount > WARN_CHARS;

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset to single row to measure content
    textarea.style.height = `${LINE_HEIGHT_PX}px`;
    const maxHeight = LINE_HEIGHT_PX * MAX_ROWS;
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setHistory((prev) => {
      const withoutDuplicate = prev.filter((entry) => entry !== trimmed);
      const updated = [...withoutDuplicate, trimmed];
      return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
    });
    setHistoryIndex(-1);
    setValue("");
  }, [value, disabled, onSubmit]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      if (next.length > MAX_CHARS) return;
      setValue(next);
      setHistoryIndex(-1);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming) {
          handleSubmit();
        }
        return;
      }

      if (e.key === "ArrowUp" && value === "" && history.length > 0) {
        e.preventDefault();
        const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIndex);
        setValue(history[nextIndex]);
        return;
      }

      if (e.key === "ArrowDown" && historyIndex !== -1) {
        e.preventDefault();
        if (historyIndex >= history.length - 1) {
          setHistoryIndex(-1);
          setValue("");
        } else {
          const nextIndex = historyIndex + 1;
          setHistoryIndex(nextIndex);
          setValue(history[nextIndex]);
        }
      }
    },
    [isStreaming, handleSubmit, value, history, historyIndex]
  );

  return (
    <div className={styles.bar}>
      <div className={styles.inputRow}>
        {isRefineMode && onExitRefinement && (
          <Button
            variant="ghost"
            size="md"
            onClick={onExitRefinement}
            disabled={isStreaming}
          >
            New
          </Button>
        )}
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            aria-label="Prompt input"
          />
          <span
            className={`${styles.charCount} ${isOverWarn ? styles.charCountWarn : ""}`}
            aria-live="polite"
          >
            {charCount} / {MAX_CHARS}
          </span>
        </div>
        {isStreaming ? (
          <Button variant="secondary" size="md" onClick={onStop} disabled={disabled} data-stop>
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={disabled || value.trim().length === 0}
          >
            {submitLabel}
          </Button>
        )}
      </div>
      {isFocused && (
        <div className={styles.hints}>
          Enter to send &middot; Shift+Enter for new line &middot; &uarr; for history
        </div>
      )}
    </div>
  );
}
