import { forwardRef, useState, useCallback, type KeyboardEvent } from "react";
import { Drawer } from "../Drawer/Drawer.js";
import { useChatStream } from "./useChatStream.js";
import type { DomainContext } from "../GenCopilot/GenCopilot.js";
import styles from "./ChatPanel.module.css";

export interface ChatPanelProps {
  onClose: () => void;
  api: string;
  domainContext: DomainContext;
  getAccessToken: () => string | null | Promise<string | null>;
  standalone?: boolean;
}

export const ChatPanel = forwardRef<HTMLDivElement, ChatPanelProps>(function ChatPanel(
  { onClose, api, domainContext, getAccessToken, standalone },
  ref
) {
  const { messages, isStreaming, pendingAction, send, confirmAction, cancelAction } = useChatStream(
    {
      api,
      domainContext,
      getAccessToken,
    }
  );

  const [inputValue, setInputValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setInputValue("");
    send(trimmed);
  }, [inputValue, send]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const content = (
    <div className={styles.body}>
      <div className={styles.messages} role="log" aria-live="polite">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === "user" ? styles.userMessage : styles.assistantMessage}
          >
            {msg.content}
            {msg.elements && msg.elements.length > 0 && (
              <div className={styles.elements} data-testid="chat-elements">
                {msg.elements.map((el) => (
                  <div key={el.id} className={styles.elementCard} data-element-type={el.type}>
                    {el.props?.title ? String(el.props.title) : el.type}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isStreaming && messages.length === 0 && (
          <div className={styles.loading} aria-label="Loading">
            ...
          </div>
        )}
      </div>
      {pendingAction && (
        <div className={styles.confirmBar} role="alert">
          <div className={styles.confirmLabel}>{pendingAction.toolName.replace(/_/g, " ")}</div>
          <div className={styles.confirmDetails}>
            {Object.entries(pendingAction.toolInput).map(([key, value]) => (
              <span key={key} className={styles.confirmDetail}>
                <strong>{key}</strong>: {String(value)}
              </span>
            ))}
          </div>
          <div className={styles.confirmActions}>
            <button
              className={styles.confirmButton}
              onClick={confirmAction}
              aria-label="Confirm action"
            >
              Confirm
            </button>
            <button
              className={styles.cancelButton}
              onClick={cancelAction}
              aria-label="Cancel action"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className={styles.inputBar}>
        <textarea
          className={styles.input}
          aria-label="Chat input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about availability, reservations..."
          rows={1}
        />
        <button
          className={styles.sendButton}
          onClick={handleSubmit}
          disabled={!inputValue.trim() || isStreaming}
          aria-label="Send"
        >
          Send
        </button>
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div ref={ref} className={styles.standalone}>
        {content}
      </div>
    );
  }

  return (
    <Drawer ref={ref} open={true} onClose={onClose} title="Chat" side="right">
      {content}
    </Drawer>
  );
});

ChatPanel.displayName = "ChatPanel";
