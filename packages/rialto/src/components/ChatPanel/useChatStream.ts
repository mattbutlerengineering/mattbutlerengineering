import { useState, useRef, useCallback, useEffect } from "react";
import type { DomainContext } from "./types.js";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";

export interface ChatMessageElement {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  elements?: ChatMessageElement[];
}

export interface PendingAction {
  actionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface PermissionDenial {
  toolName: string;
  reason: string;
}

interface NDJSONLine {
  type: "text" | "tool_status" | "element" | "action_request" | "permission_denied";
  reason?: string;
  content?: string;
  tool?: string;
  status?: string;
  element?: ChatMessageElement;
  actionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

/** A streaming request issued by the chat hook. */
export interface ChatStreamRequest {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Transport the host app injects: performs the request and yields each decoded
 * NDJSON line. Rialto owns no HTTP client, so the app supplies one.
 */
export type ChatStreamFn = (request: ChatStreamRequest) => AsyncIterable<unknown>;

export interface UseChatStreamOptions {
  api: string;
  stream: ChatStreamFn;
  domainContext: DomainContext;
  getAccessToken: () => string | null | Promise<string | null>;
  /**
   * Extra fields the host app merges into every request body, e.g. the
   * selected venue and its time zone, so the server knows what "tonight" means.
   */
  requestContext?: Readonly<Record<string, unknown>>;
}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: Error | null;
  pendingAction: PendingAction | null;
  /** Name of the tool the server reports as currently running, if any. */
  activeTool: string | null;
  /** Tool calls the server refused during the current request. */
  permissionDenials: PermissionDenial[];
  send: (content: string) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  confirmAction: () => Promise<void>;
  cancelAction: () => void;
}

export function useChatStream({
  api,
  stream,
  getAccessToken,
  requestContext,
}: UseChatStreamOptions): UseChatStreamReturn {
  const { messages: t } = useRialtoLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [permissionDenials, setPermissionDenials] = useState<PermissionDenial[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const getAccessTokenRef = useRef(getAccessToken);
  const streamRef = useRef(stream);
  const requestContextRef = useRef(requestContext);
  const messagesRef = useRef(messages);
  const pendingActionRef = useRef(pendingAction);
  const lastRequestRef = useRef<{
    body: Record<string, unknown>;
    baseMessages: ChatMessage[];
  } | null>(null);

  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    requestContextRef.current = requestContext;
  }, [requestContext]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  const streamRequest = useCallback(
    async (requestBody: Record<string, unknown>, baseMessages: ChatMessage[]): Promise<void> => {
      abortControllerRef.current?.abort();
      const body = { ...requestContextRef.current, ...requestBody };
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Never store actionConfirm for replay: the server's gate re-arms on any
      // body carrying it, so a retry() after a confirmed resend would execute
      // the write again. A retry re-asks the model; the gate holds the write
      // until the user confirms afresh.
      const { actionConfirm: _confirmed, ...replayBody } = body;
      lastRequestRef.current = { body: replayBody, baseMessages };
      setIsStreaming(true);
      setError(null);
      setActiveTool(null);
      setPermissionDenials([]);

      let assistantContent = "";
      const elements: ChatMessageElement[] = [];
      const currentMessages = baseMessages;

      try {
        const token = await Promise.resolve(getAccessTokenRef.current());
        const lines = streamRef.current({
          url: api,
          body,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });

        for await (const raw of lines) {
          const line = raw as NDJSONLine;
          if (line.type === "text" && line.content) {
            assistantContent += line.content;
            const msg: ChatMessage = { role: "assistant", content: assistantContent };
            if (elements.length > 0) msg.elements = [...elements];
            setMessages([...currentMessages, msg]);
          } else if (line.type === "element" && line.element) {
            elements.push(line.element);
            const msg: ChatMessage = { role: "assistant", content: assistantContent };
            if (elements.length > 0) msg.elements = [...elements];
            setMessages([...currentMessages, msg]);
          } else if (line.type === "action_request" && line.actionId && line.toolName) {
            setPendingAction({
              actionId: line.actionId,
              toolName: line.toolName,
              toolInput: line.toolInput ?? {},
            });
          } else if (line.type === "tool_status" && line.tool) {
            setActiveTool(line.status === "running" ? line.tool : null);
          } else if (line.type === "permission_denied" && line.toolName) {
            const denial: PermissionDenial = {
              toolName: line.toolName,
              reason: line.reason ?? t.notAllowed,
            };
            setPermissionDenials((prev) => [...prev, denial]);
          }
        }

        if (assistantContent || elements.length > 0) {
          const msg: ChatMessage = { role: "assistant", content: assistantContent };
          if (elements.length > 0) msg.elements = [...elements];
          setMessages([...currentMessages, msg]);
        }

        setActiveTool(null);
        setIsStreaming(false);
      } catch (err) {
        setActiveTool(null);
        if (err instanceof Error && err.name === "AbortError") {
          setIsStreaming(false);
          return;
        }

        const caughtError = err instanceof Error ? err : new Error(String(err));
        setError(caughtError);
        setIsStreaming(false);
      }
    },
    [api, t]
  );

  const send = useCallback(
    async (content: string): Promise<void> => {
      const userMessage: ChatMessage = { role: "user", content };
      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);

      await streamRequest(
        { messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })) },
        updatedMessages
      );
    },
    [streamRequest]
  );

  const confirmAction = useCallback(async (): Promise<void> => {
    const action = pendingActionRef.current;
    if (!action) return;

    setPendingAction(null);

    const currentMsgs = messagesRef.current;
    await streamRequest(
      {
        messages: currentMsgs.map((m) => ({ role: m.role, content: m.content })),
        // The server executes exactly this toolName + toolInput (its confirmation
        // gate ignores the model's re-derived input), so send what the user saw.
        actionConfirm: {
          actionId: action.actionId,
          toolName: action.toolName,
          toolInput: action.toolInput,
        },
      },
      currentMsgs
    );
  }, [streamRequest]);

  const cancelAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const retry = useCallback(async (): Promise<void> => {
    const last = lastRequestRef.current;
    if (!last) return;
    await streamRequest(last.body, last.baseMessages);
  }, [streamRequest]);

  return {
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
  };
}
