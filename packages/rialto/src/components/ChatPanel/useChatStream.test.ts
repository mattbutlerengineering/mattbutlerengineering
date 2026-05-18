import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatStream } from "./useChatStream.js";

vi.mock("@mbe/api-client/streaming", () => ({
  streamNDJSON: vi.fn(),
}));

import { streamNDJSON } from "@mbe/api-client/streaming";

function createMockProps() {
  return {
    api: "/api/gen/agent",
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
    const body = lastCall.body as { actionConfirm: { actionId: string } };
    expect(body.actionConfirm).toEqual({ actionId: "call-3" });
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

  it("sets isStreaming true during streaming", async () => {
    let resolveStream: () => void;
    const streamPromise = new Promise<void>((r) => {
      resolveStream = r;
    });

    async function* slowStream() {
      yield { type: "text", content: "chunk" };
      await streamPromise;
    }

    vi.mocked(streamNDJSON).mockReturnValueOnce(slowStream() as never);

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
});
