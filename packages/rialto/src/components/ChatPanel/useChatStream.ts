import { useState, useRef, useCallback, useEffect } from "react";
import { streamNDJSON } from "@mbe/api-client/streaming";
import type { DomainContext } from "../GenCopilot/GenCopilot.js";

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

interface NDJSONLine {
  type: "text" | "tool_status" | "element" | "action_request";
  content?: string;
  tool?: string;
  status?: string;
  element?: ChatMessageElement;
  actionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

export interface UseChatStreamOptions {
  api: string;
  domainContext: DomainContext;
  getAccessToken: () => string | null | Promise<string | null>;
}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: Error | null;
  pendingAction: PendingAction | null;
  send: (content: string) => Promise<void>;
  stop: () => void;
  confirmAction: () => Promise<void>;
  cancelAction: () => void;
}

export function useChatStream({ api, getAccessToken }: UseChatStreamOptions): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const getAccessTokenRef = useRef(getAccessToken);
  const messagesRef = useRef(messages);
  const pendingActionRef = useRef(pendingAction);

  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  const streamRequest = useCallback(
    async (body: Record<string, unknown>, baseMessages: ChatMessage[]): Promise<void> => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsStreaming(true);
      setError(null);

      let assistantContent = "";
      const elements: ChatMessageElement[] = [];
      const currentMessages = baseMessages;

      try {
        const token = await Promise.resolve(getAccessTokenRef.current());
        const stream = streamNDJSON<NDJSONLine>({
          url: api,
          body,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });

        for await (const line of stream) {
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
          }
        }

        if (assistantContent || elements.length > 0) {
          const msg: ChatMessage = { role: "assistant", content: assistantContent };
          if (elements.length > 0) msg.elements = [...elements];
          setMessages([...currentMessages, msg]);
        }

        setIsStreaming(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setIsStreaming(false);
          return;
        }

        const caughtError = err instanceof Error ? err : new Error(String(err));
        setError(caughtError);
        setIsStreaming(false);
      }
    },
    [api]
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
        actionConfirm: { actionId: action.actionId },
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

  return { messages, isStreaming, error, pendingAction, send, stop, confirmAction, cancelAction };
}
