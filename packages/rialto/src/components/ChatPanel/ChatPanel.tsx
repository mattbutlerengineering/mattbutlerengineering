import { forwardRef, useState, useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { Drawer } from "../Drawer/Drawer.js";
import { useChatStream, type ChatStreamFn } from "./useChatStream.js";
import type { DomainContext } from "./types.js";
import type { ChatMessageElement, PendingAction } from "./useChatStream.js";
import { sanitizeElementProps } from "./sanitize.js";
import styles from "./ChatPanel.module.css";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { useMotionPreset } from "../../providers/useMotionPreset";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentRegistry = Record<string, React.ComponentType<any>>;

// Registry components implement json-render's ComponentRenderProps contract
// ({ element, children, emit, on }); ChatPanel has no action system, so events
// are accepted and dropped.
const NOOP_EMIT = () => {};
// Full json-render EventHandle shape — an adapter calling on("press").emit()
// must get a function, not undefined.
const NOOP_ON = () => ({ emit: NOOP_EMIT, bound: false, shouldPreventDefault: false });

function renderElement(
  el: ChatMessageElement,
  registry: ComponentRegistry | undefined,
  elementsById: ReadonlyMap<string, ChatMessageElement>,
  seen: ReadonlySet<string>
): React.ReactNode {
  const Component = registry?.[el.type];
  const nextSeen = new Set(seen).add(el.id);
  const childNodes = (el.children ?? [])
    .filter((childId) => !nextSeen.has(childId))
    .map((childId) => elementsById.get(childId))
    .filter((child): child is ChatMessageElement => child !== undefined)
    .map((child) => renderElement(child, registry, elementsById, nextSeen));
  if (!Component) {
    // Unknown type: placeholder — but its known children still render inside
    // it, so one hallucinated wrapper doesn't swallow real content.
    return (
      <div key={el.id} className={styles.elementCard} data-element-type={el.type}>
        {el.props?.title ? String(el.props.title) : el.type}
        {childNodes}
      </div>
    );
  }
  const safeProps = sanitizeElementProps(el.props ?? {});
  return (
    <Component
      key={el.id}
      element={{ key: el.id, type: el.type, props: safeProps }}
      emit={NOOP_EMIT}
      on={NOOP_ON}
    >
      {childNodes.length > 0 ? childNodes : undefined}
    </Component>
  );
}

/**
 * The agent streams a flat element list whose `children` are ids. Render only
 * the roots (elements no other element references) and nest the rest; if a
 * reference cycle leaves no roots, fall back to rendering every element (the
 * per-path `seen` set in renderElement keeps that finite).
 */
function renderElements(
  elements: readonly ChatMessageElement[],
  registry: ComponentRegistry | undefined
): React.ReactNode {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const referenced = new Set(elements.flatMap((el) => el.children ?? []));
  const roots = elements.filter((el) => !referenced.has(el.id));
  const topLevel = roots.length > 0 ? roots : elements;
  return topLevel.map((el) => renderElement(el, registry, byId, new Set()));
}

/** How the confirm bar presents a pending write: a title and labelled values. */
export interface ActionDescription {
  title: string;
  details: ReadonlyArray<{ label: string; value: string }>;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The default: the tool name and its raw input, as the server sent them. */
function describeRawAction(action: PendingAction): ActionDescription {
  return {
    title: sentenceCase(action.toolName.replace(/_/g, " ")),
    details: Object.entries(action.toolInput).map(([label, value]) => ({
      label,
      value: String(value),
    })),
  };
}

export interface ChatPanelProps {
  onClose: () => void;
  api: string;
  /** Streaming transport the host app injects (see `ChatStreamFn`). */
  stream: ChatStreamFn;
  domainContext: DomainContext;
  getAccessToken: () => string | null | Promise<string | null>;
  standalone?: boolean;
  registry?: ComponentRegistry;
  /** Extra fields merged into every request body (e.g. the selected venue). */
  requestContext?: Readonly<Record<string, unknown>>;
  /** Starter prompts offered on an empty conversation; clicking one sends it. */
  suggestions?: readonly string[];
  /**
   * Presents a pending write in the confirm bar (e.g. a table's name instead of
   * its id). Defaults to the tool name and raw input.
   */
  describeAction?: (action: PendingAction) => ActionDescription;
}

export const ChatPanel = forwardRef<HTMLDivElement, ChatPanelProps>(function ChatPanel(
  {
    onClose,
    api,
    stream,
    domainContext,
    getAccessToken,
    standalone,
    registry,
    requestContext,
    suggestions,
    describeAction = describeRawAction,
  },
  ref
) {
  const { messages: t } = useRialtoLocale();
  const {
    messages,
    isStreaming,
    error,
    pendingAction,
    activeTool,
    permissionDenials,
    send,
    stop,
    retry,
    confirmAction,
    cancelAction,
  } = useChatStream({
    api,
    stream,
    domainContext,
    getAccessToken,
    requestContext,
  });

  const [inputValue, setInputValue] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPreset();

  // Keep the newest message in view as replies stream in.
  useEffect(() => {
    const log = messagesRef.current;
    log?.scrollTo?.({ top: log.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, activeTool, pendingAction, error, reduced]);

  const awaitingReply = isStreaming && !activeTool && messages.at(-1)?.role !== "assistant";
  const showSuggestions = messages.length === 0 && !isStreaming && (suggestions?.length ?? 0) > 0;

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    // Sending mid-stream would abort the reply in flight; Stop is the way to end it.
    if (!trimmed || isStreaming) return;
    setInputValue("");
    send(trimmed);
  }, [inputValue, isStreaming, send]);

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
      <div ref={messagesRef} className={styles.messages} role="log" aria-live="polite">
        {showSuggestions && (
          <div className={styles.suggestions} role="group" aria-label={t.chatSuggestions}>
            {suggestions!.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={styles.suggestion}
                onClick={() => send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === "user" ? styles.userMessage : styles.assistantMessage}
          >
            {msg.content && <span className={styles.messageText}>{msg.content}</span>}
            {msg.elements && msg.elements.length > 0 && (
              <div className={styles.elements} data-testid="chat-elements">
                {renderElements(msg.elements, registry)}
              </div>
            )}
          </div>
        ))}
        {awaitingReply && (
          <div className={styles.loading} aria-label={t.loading}>
            ...
          </div>
        )}
        {activeTool && (
          <div className={styles.loading} role="status">
            {activeTool.replace(/_/g, " ")}...
          </div>
        )}
        {permissionDenials.map((denial, i) => (
          <div key={i} className={styles.assistantMessage} role="alert">
            <strong>{denial.toolName}</strong> {t.toolBlocked(denial.reason)}
          </div>
        ))}
        {error && (
          <div className={styles.assistantMessage} role="alert">
            {error.message}
            <div className={styles.confirmActions}>
              <button className={styles.confirmButton} onClick={retry} aria-label={t.tryAgain}>
                {t.tryAgain}
              </button>
            </div>
          </div>
        )}
      </div>
      {pendingAction && (
        <div className={styles.confirmBar} role="alert">
          {(() => {
            const description = describeAction(pendingAction);
            return (
              <>
                <div className={styles.confirmLabel}>{description.title}</div>
                <div className={styles.confirmDetails}>
                  {description.details.map(({ label, value }) => (
                    <span key={label} className={styles.confirmDetail}>
                      <strong>{label}</strong>: {value}
                    </span>
                  ))}
                </div>
              </>
            );
          })()}
          <div className={styles.confirmActions}>
            <button
              className={styles.confirmButton}
              onClick={confirmAction}
              aria-label={t.confirmAction}
            >
              {t.confirm}
            </button>
            <button
              className={styles.cancelButton}
              onClick={cancelAction}
              aria-label={t.cancelAction}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      <div className={styles.inputBar}>
        <textarea
          className={styles.input}
          aria-label={t.chatInput}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.chatPlaceholder}
          rows={1}
        />
        {isStreaming ? (
          <button className={styles.sendButton} onClick={stop} aria-label={t.stop}>
            {t.stop}
          </button>
        ) : (
          <button
            className={styles.sendButton}
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            aria-label={t.send}
          >
            {t.send}
          </button>
        )}
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
    <Drawer ref={ref} open={true} onClose={onClose} title={t.chat} side="right">
      {content}
    </Drawer>
  );
});

ChatPanel.displayName = "ChatPanel";
