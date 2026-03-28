import { useState, type KeyboardEvent } from "react";
import { Button } from "@mbe/rialto";
import styles from "./PromptBar.module.css";

export interface PromptBarProps {
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

/**
 * Bottom bar with text input and Generate/Stop toggle button.
 * Submits on Enter (unless empty). Clears input after submit.
 */
export function PromptBar({ onSubmit, onStop, isStreaming, disabled }: PromptBarProps) {
  const [value, setValue] = useState("");

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
    <div className={styles.bar}>
      <textarea
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the UI you want to build..."
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
          Generate
        </Button>
      )}
    </div>
  );
}
