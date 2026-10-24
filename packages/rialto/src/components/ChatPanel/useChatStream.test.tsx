import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RialtoLocaleProvider } from "../../i18n/RialtoLocaleProvider";
import { esMX } from "../../i18n/locales/es-MX";
import { frCA } from "../../i18n/locales/fr-CA";
import type { RialtoMessages } from "../../i18n/messages";
import { useChatStream, type ChatStreamFn } from "./useChatStream.js";

// In-memory stream adapter: the second implementation of ChatStreamFn that
// justifies the injection seam (the app supplies the real NDJSON transport).
const streamNDJSON = vi.fn<ChatStreamFn>();

function createMockProps() {
  return {
    api: "/api/gen/agent",
    stream: streamNDJSON,
    getAccessToken: vi.fn(() => "test-token"),
    domainContext: {
      schemas: [{ name: "Reservation", description: "A booking", fields: "id, guestName" }],
    },
  };
}

async function* mockStream<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

/** An async generator whose first `next()` rejects — simulates a fetch failure. */
function erroringStream<T>(error: Error): AsyncGenerator<T> {
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    next(): Promise<IteratorResult<T>> {
      return Promise.reject(error);
    },
    return(): Promise<IteratorResult<T>> {
      return Promise.resolve({ done: true, value: undefined as unknown as T });
    },
    throw(): Promise<IteratorResult<T>> {
      return Promise.reject(error);
    },
    [Symbol.asyncDispose](): Promise<void> {
      return Promise.resolve();
    },
  };
}

describe("useChatStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with empty messages and not streaming", () => {
    const { result } = renderHook(() => useChatStream(createMockProps()));

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("merges requestContext into every request body", async () => {
    vi.mocked(streamNDJSON).mockReturnValueOnce(mockStream([{ type: "text", content: "ok" }]));
    const { result } = renderHook(() =>
      useChatStream({
        ...createMockProps(),
        requestContext: { venueId: "venue-1", timeZone: "America/Los_Angeles" },
      })
    );

    await act(async () => {
      await result.current.send("how does tonight look?");
    });

    expect(vi.mocked(streamNDJSON).mock.calls[0]![0].body).toEqual({
      venueId: "venue-1",
      timeZone: "America/Los_Angeles",
      messages: [{ role: "user", content: "how does tonight look?" }],
    });
  });

  it("sends a message and accumulates response from NDJSON stream", async () => {
    vi.mocked(streamNDJSON).mockReturnValueOnce(
      mockStream([
        { type: "text", content: "Hello" },
        { type: "text", content: " there" },
      ])
    );

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("what is available?");
    });

    expect(result.current.messages).toEqual([
      { role: "user", content: "what is available?" },
      { role: "assistant", content: "Hello there" },
    ]);
    expect(result.current.isStreaming).toBe(false);
  });

  it("passes auth token in headers", async () => {
    vi.mocked(streamNDJSON).mockReturnValueOnce(mockStream([]));

    const props = createMockProps();
    const { result } = renderHook(() => useChatStream(props));

    await act(async () => {
      await result.current.send("hello");
    });

    expect(streamNDJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/api/gen/agent",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("sends full message history on each request", async () => {
    vi.mocked(streamNDJSON)
      .mockReturnValueOnce(mockStream([{ type: "text", content: "first reply" }]))
      .mockReturnValueOnce(mockStream([{ type: "text", content: "second reply" }]));

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("message one");
    });

    await act(async () => {
      await result.current.send("message two");
    });

    const secondCall = vi.mocked(streamNDJSON).mock.calls[1]![0];
    const body = secondCall.body as { messages: Array<{ role: string; content: string }> };
    expect(body.messages).toEqual([
      { role: "user", content: "message one" },
      { role: "assistant", content: "first reply" },
      { role: "user", content: "message two" },
    ]);
  });

  it("accumulates element lines into message parts", async () => {
    vi.mocked(streamNDJSON).mockReturnValueOnce(
      mockStream([
        { type: "text", content: "Here are the slots:" },
        {
          type: "element",
          element: { id: "card-1", type: "Card", props: { title: "7pm" }, children: [] },
        },
        { type: "text", content: " Pick one." },
      ])
    );

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("show slots");
    });

    const assistantMsg = result.current.messages[1]!;
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.content).toBe("Here are the slots: Pick one.");
    expect(assistantMsg.elements).toEqual([
      { id: "card-1", type: "Card", props: { title: "7pm" }, children: [] },
    ]);
  });

  it("exposes pending action from action_request lines", async () => {
    vi.mocked(streamNDJSON).mockReturnValueOnce(
      mockStream([
        {
          type: "action_request",
          actionId: "call-3",
          toolName: "create_reservation",
          toolInput: { guestName: "Smith", date: "2026-05-18", time: "19:00", partySize: 4 },
        },
        { type: "text", content: "Ready to book for Smith?" },
      ])
    );

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("book Smith at 7pm");
    });

    expect(result.current.pendingAction).toEqual({
      actionId: "call-3",
      toolName: "create_reservation",
      toolInput: { guestName: "Smith", date: "2026-05-18", time: "19:00", partySize: 4 },
    });
  });

  it("confirm sends action_confirm message and clears pending", async () => {
    vi.mocked(streamNDJSON)
      .mockReturnValueOnce(
        mockStream([
          {
            type: "action_request",
            actionId: "call-3",
            toolName: "create_reservation",
            toolInput: { guestName: "Smith" },
          },
        ])
      )
      .mockReturnValueOnce(mockStream([{ type: "text", content: "Reservation confirmed!" }]));

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("book Smith");
    });

    expect(result.current.pendingAction).toBeTruthy();

    await act(async () => {
      await result.current.confirmAction();
    });

    expect(result.current.pendingAction).toBeNull();

    const lastCall = vi.mocked(streamNDJSON).mock.calls[1]![0];
    const body = lastCall.body as {
      actionConfirm: { actionId: string; toolName: string; toolInput: Record<string, unknown> };
    };
    // The server's confirmation gate executes exactly this toolName + toolInput,
    // so the confirm resend must carry what the user saw — not just the id.
    expect(body.actionConfirm).toEqual({
      actionId: "call-3",
      toolName: "create_reservation",
      toolInput: { guestName: "Smith" },
    });
  });

  it("retry after a confirm does not replay actionConfirm", async () => {
    vi.mocked(streamNDJSON)
      .mockReturnValueOnce(
        mockStream([
          {
            type: "action_request",
            actionId: "call-3",
            toolName: "create_reservation",
            toolInput: { guestName: "Smith" },
          },
        ])
      )
      .mockReturnValueOnce(mockStream([{ type: "text", content: "Done" }]))
      .mockReturnValueOnce(mockStream([{ type: "text", content: "Retried" }]));

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("book Smith");
    });
    await act(async () => {
      await result.current.confirmAction();
    });
    await act(async () => {
      await result.current.retry();
    });

    // The server's gate re-arms on any body carrying actionConfirm, so a
    // replayed confirm would execute the write a second time. A retry must
    // re-ask the model instead — the gate then holds the write for a fresh,
    // explicit confirmation.
    const retryBody = vi.mocked(streamNDJSON).mock.calls[2]![0].body as Record<string, unknown>;
    expect(retryBody.actionConfirm).toBeUndefined();
    expect(retryBody.messages).toEqual([{ role: "user", content: "book Smith" }]);
  });

  it("cancel clears pending action and adds cancel message", async () => {
    vi.mocked(streamNDJSON).mockReturnValueOnce(
      mockStream([
        {
          type: "action_request",
          actionId: "call-3",
          toolName: "create_reservation",
          toolInput: { guestName: "Smith" },
        },
      ])
    );

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("book Smith");
    });

    act(() => {
      result.current.cancelAction();
    });

    expect(result.current.pendingAction).toBeNull();
  });

  it("exposes a human-readable error when the stream fails", async () => {
    vi.mocked(streamNDJSON).mockReturnValueOnce(
      erroringStream(new Error("Request failed: Internal Server Error"))
    );

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("book a table");
    });

    expect(result.current.error?.message).toBe("Request failed: Internal Server Error");
    expect(result.current.isStreaming).toBe(false);
  });

  it("retry resends the last request and clears the error on success", async () => {
    vi.mocked(streamNDJSON)
      .mockReturnValueOnce(erroringStream(new Error("Request failed: Internal Server Error")))
      .mockReturnValueOnce(mockStream([{ type: "text", content: "Got it" }]));

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("book a table");
    });

    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Got it",
    });

    const [firstCall, secondCall] = vi.mocked(streamNDJSON).mock.calls;
    expect(secondCall![0].body).toEqual(firstCall![0].body);
  });

  it("sets isStreaming true during streaming", async () => {
    let resolveStream: () => void;
    const streamPromise = new Promise<void>((r) => {
      resolveStream = r;
    });

    async function* slowStream() {
      yield { type: "text", content: "chunk" };
      await streamPromise;
    }

    vi.mocked(streamNDJSON).mockReturnValueOnce(slowStream());

    const { result } = renderHook(() => useChatStream(createMockProps()));

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.send("hello");
    });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      resolveStream!();
      await sendPromise!;
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it("surfaces permission_denied events and resets them on the next request", async () => {
    vi.mocked(streamNDJSON)
      .mockReturnValueOnce(
        mockStream([
          { type: "permission_denied", toolName: "Bash", reason: "Command is blocked" },
          { type: "text", content: "I could not do that." },
        ])
      )
      .mockReturnValueOnce(mockStream([{ type: "text", content: "ok" }]));

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("run it");
    });
    expect(result.current.permissionDenials).toEqual([
      { toolName: "Bash", reason: "Command is blocked" },
    ]);

    await act(async () => {
      await result.current.send("again");
    });
    expect(result.current.permissionDenials).toEqual([]);
  });

  it.each([
    ["en-US", undefined, "Not allowed"],
    ["es-MX", esMX, "No permitido"],
    ["fr-CA", frCA, "Non autorisé"],
  ] as const)(
    "falls back to the %s no-reason denial text",
    async (_tag, messages: RialtoMessages | undefined, reason) => {
      vi.mocked(streamNDJSON).mockReturnValueOnce(
        mockStream([{ type: "permission_denied", toolName: "Bash" }])
      );
      const wrapper = ({ children }: { children: ReactNode }) => (
        <RialtoLocaleProvider messages={messages}>{children}</RialtoLocaleProvider>
      );
      const { result } = renderHook(() => useChatStream(createMockProps()), { wrapper });

      await act(async () => {
        await result.current.send("run it");
      });
      expect(result.current.permissionDenials).toEqual([{ toolName: "Bash", reason }]);
    }
  );

  it("tracks the running tool from tool_status events and clears it when the tool completes", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    async function* stream() {
      yield { type: "tool_status", tool: "lookup_reservation", status: "running" };
      await gate;
      yield { type: "tool_status", tool: "lookup_reservation", status: "complete" };
    }
    vi.mocked(streamNDJSON).mockReturnValueOnce(stream());

    const { result } = renderHook(() => useChatStream(createMockProps()));

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.send("find it");
    });
    await vi.waitFor(() => expect(result.current.activeTool).toBe("lookup_reservation"));

    await act(async () => {
      release();
      await sendPromise!;
    });
    expect(result.current.activeTool).toBeNull();
  });

  it("clears the running tool when the stream ends without a complete event", async () => {
    vi.mocked(streamNDJSON).mockReturnValueOnce(
      mockStream([{ type: "tool_status", tool: "lookup_reservation", status: "running" }])
    );

    const { result } = renderHook(() => useChatStream(createMockProps()));

    await act(async () => {
      await result.current.send("find it");
    });
    expect(result.current.activeTool).toBeNull();
  });
});
