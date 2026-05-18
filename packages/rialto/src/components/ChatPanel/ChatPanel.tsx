import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Drawer } from "../Drawer/Drawer.js";
import { Button } from "../Button/Button.js";
import { Text } from "../Text/Text.js";
import { useChatStream } from "./useChatStream.js";
import type { ChatMessage } from "./useChatStream.js";
import styles from "./ChatPanel.module.css";

export interface ChatPanelProps {
  /** Called when the user closes the panel — consumer should unmount ChatPanel */
  onClose: () => void;
  /** API endpoint for the agent stream (e.g. "/api/gen/agent") */
  api: string;
  /**
   * Callback that returns the current auth token (or null if unauthenticated).
   */
  getAccessToken: () => string | null | undefined;
  /** Optional domain context hint shown in empty state */
  domainContext?: string;
}

/**
 * ChatPanel is a slide-over panel (Drawer) providing a multi-turn AI chat
 * interface for hospitality staff to check availability, reservations, and guests.
 *
 * @example
 * ```tsx
 * {chatOpen && (
 *   <ChatPanel
 *     onClose={() => setChatOpen(false)}
 *     api="/api/gen/agent"
 *     getAccessToken={getAccessToken}
 *   />
 * )}
 * ```
 */
export function ChatPanel({ onClose, api, getAccessToken }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming, send } = useChatStream({ api, getAccessToken });

  // Auto-scroll to latest message (guard for jsdom which lacks scrollIntoView)
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function handleSubmit() {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;
    void send(trimmed);
    setInputValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <Drawer open={true} onClose={onClose} title="Staff Assistant" side="right">
      <div className={styles.body}>
        {/* Message list */}
        <div className={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">
          {isEmpty ? (
            <div className={styles.emptyState}>
              <Text color="secondary">
                Ask me anything about availability, reservations, or guests.
              </Text>
            </div>
          ) : (
            messages.map((msg: ChatMessage) => (
              <div
                key={msg.id}
                className={msg.role === "user" ? styles.userMessage : styles.assistantMessage}
              >
                <Text>{msg.content}</Text>
              </div>
            ))
          )}

          {/* Loading indicator while streaming */}
          {isStreaming && (
            <div className={styles.loadingIndicator} data-testid="chat-loading-indicator">
              <Text color="secondary">...</Text>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className={styles.inputBar}>
          <textarea
            className={styles.input}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={2}
            aria-label="Chat message input"
            disabled={isStreaming}
          />
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={isStreaming || inputValue.trim().length === 0}
            aria-label="Send"
          >
            Send
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

ChatPanel.displayName = "ChatPanel";
