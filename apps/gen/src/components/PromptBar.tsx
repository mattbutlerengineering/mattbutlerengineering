import { useState, useRef, type KeyboardEvent } from "react";
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

/**
 * Bottom bar with text input and Generate/Stop toggle button.
 * Submits on Enter (unless empty). Clears input after submit.
 * In "refine" mode, shows a different placeholder and a "New" exit button.
 */
const SUGGESTIONS = [
  "Create a login form",
  "Build a dashboard card",
  "Design a pricing table",
  "Make a settings page",
] as const;

export function PromptBar({
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  mode = "generate",
  onExitRefinement,
}: PromptBarProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRefineMode = mode === "refine";
  const placeholder = isRefineMode
    ? "Refine this UI..."
    : "Describe the UI you want to build...";
  const submitLabel = isRefineMode ? "Refine" : "Generate";

  const showSuggestions = value.trim().length === 0 && !isStreaming && mode === "generate";

  function handleSuggestionClick(suggestion: string) {
    setValue(suggestion);
    textareaRef.current?.focus();
  }

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) {
        handleSubmit();
      }
    }
  }

  return (
    <div className={styles.wrapper}>
      {showSuggestions && (
        <div className={styles.suggestions}>
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              variant="ghost"
              size="sm"
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={disabled}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}
      <div className={styles.bar}>
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
      <textarea
        ref={textareaRef}
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        aria-label="Prompt input"
      />
      {isStreaming ? (
        // Rialto Button has no "danger" variant; use secondary with CSS override
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
    </div>
  );
}
