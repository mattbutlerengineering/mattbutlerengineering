import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import { Button } from "@mattbutlerengineering/rialto";
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
  /** The prompt behind the current failure, if any — restored into the input
   *  so it isn't lost and can be edited before the next attempt. */
  failedPrompt?: string | null;
  /** The error behind failedPrompt. Keyed on (not failedPrompt's text) so a
   *  second failure with identical prompt text still re-seeds the input even
   *  though the user may have already edited it away after the first one. */
  failedError?: Error | null;
  /** A prompt restored after a refresh interrupted a generation. */
  initialPrompt?: string | null;
}

const MAX_CHARS = 2000;
const WARN_CHARS = 1500;
const MAX_HISTORY = 50;
const MAX_ROWS = 6;
const LINE_HEIGHT_PX = 24;
/**
 * A double-click's second click lands on Stop: the first click flips
 * `isStreaming`, React swaps the button under the pointer, and Stop aborts
 * the run before any tokens arrive. The OS double-click window is ~500ms.
 */
const DOUBLE_CLICK_GUARD_MS = 500;

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
  failedPrompt = null,
  failedError = null,
  initialPrompt = null,
}: PromptBarProps) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<readonly string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittedAtRef = useRef(0);

  // Restore the failing prompt into the input so it isn't lost. Render-time
  // "seed on change" (React's documented alternative to an effect for
  // deriving state from a prop — see "You Might Not Need an Effect"):
  // tracks the last error object already seeded from, so the SAME error
  // can't re-seed twice and clobber an in-progress edit, while a genuinely
  // new failure (a new Error instance) still re-seeds even if its message
  // text repeats. A failure with no prompt to restore (a selected failed
  // history entry) never advances the seed, so returning to a live failure
  // already seeded can't clobber a draft typed in between.
  const [seededError, setSeededError] = useState<Error | null>(null);
  if (failedError && failedPrompt != null && failedError !== seededError) {
    setSeededError(failedError);
    setValue(failedPrompt);
  }

  const [seededInitial, setSeededInitial] = useState(false);
  if (!seededInitial && initialPrompt && !failedError) {
    setSeededInitial(true);
    setValue(initialPrompt);
  }

  const isRefineMode = mode === "refine";
  const placeholder = isRefineMode ? "Refine this UI..." : "Describe the UI you want to build...";
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
    submittedAtRef.current = performance.now();
    onSubmit(trimmed);
    setHistory((prev) => {
      const withoutDuplicate = prev.filter((entry) => entry !== trimmed);
      const updated = [...withoutDuplicate, trimmed];
      return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
    });
    setHistoryIndex(-1);
    setValue("");
  }, [value, disabled, onSubmit]);

  const handleStop = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      // The click that completes a double-click on Generate. Ignoring it
      // leaves the in-flight generation running.
      if (performance.now() - submittedAtRef.current < DOUBLE_CLICK_GUARD_MS) {
        event.preventDefault();
        return;
      }
      onStop();
    },
    [onStop]
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    // A paste longer than the cap used to be ignored. The browser had already
    // inserted it, so the controlled value stayed "" and the counter read 0.
    const next = e.target.value.slice(0, MAX_CHARS);
    setValue(next);
    setHistoryIndex(-1);
  }, []);

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
        const nextValue = history[nextIndex];
        if (nextValue !== undefined) {
          setHistoryIndex(nextIndex);
          setValue(nextValue);
        }
        return;
      }

      if (e.key === "ArrowDown" && historyIndex !== -1) {
        e.preventDefault();
        if (historyIndex >= history.length - 1) {
          setHistoryIndex(-1);
          setValue("");
        } else {
          const nextIndex = historyIndex + 1;
          const nextValue = history[nextIndex];
          if (nextValue !== undefined) {
            setHistoryIndex(nextIndex);
            setValue(nextValue);
          }
        }
      }
    },
    [isStreaming, handleSubmit, value, history, historyIndex]
  );

  return (
    <div className={styles.bar}>
      <div className={styles.inputRow}>
        {isRefineMode && onExitRefinement && (
          <Button variant="ghost" size="md" onClick={onExitRefinement} disabled={isStreaming}>
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
          <Button variant="secondary" size="md" onClick={handleStop} disabled={disabled} data-stop>
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
      {failedError && <p className={styles.errorNote}>{failedError.message}</p>}
      {/* Always mounted; CSS shows it on :focus-within so focus changes never
          resize the bar and move Generate out from under the pointer (F26). */}
      <div className={styles.hints}>
        Enter to send &middot; Shift+Enter for new line &middot; &uarr; for history
      </div>
    </div>
  );
}
