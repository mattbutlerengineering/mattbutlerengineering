import { useState, type KeyboardEvent } from "react";
import { Button } from "../Button/Button.js";
import styles from "./CopilotPromptBar.module.css";

export interface CopilotPromptBarProps {
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

/**
 * Narrow prompt bar anchored to the bottom of the GenCopilot panel.
 * Submits on Enter (not Shift+Enter). Clears input after submit.
 * Shows Stop button during streaming, Generate button otherwise.
 */
export function CopilotPromptBar({ onSubmit, onStop, isStreaming }: CopilotPromptBarProps) {
  const [value, setValue] = useState("");

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
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
        placeholder="Describe the UI you want to generate..."
        rows={2}
        aria-label="Copilot prompt input"
      />
      {isStreaming ? (
        // Rialto Button has no "danger" variant; use secondary with CSS data-stop override for error color
        <Button variant="secondary" size="md" onClick={onStop} data-stop>
          Stop
        </Button>
      ) : (
        <Button
          variant="primary"
          size="md"
          onClick={handleSubmit}
          disabled={value.trim().length === 0}
        >
          Generate
        </Button>
      )}
    </div>
  );
}
