import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock streamNDJSON from api-client
vi.mock("@mbe/api-client/streaming", () => ({
  streamNDJSON: vi.fn(),
}));

import { streamNDJSON } from "@mbe/api-client/streaming";
import { useChatStream } from "./useChatStream.js";

describe("useChatStream", () => {
  const mockGetAccessToken = vi.fn(() => "test-token");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initial state: empty messages, not streaming, no error", () => {
    const { result } = renderHook(() =>
      useChatStream({ api: "/api/gen/agent", getAccessToken: mockGetAccessToken })
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("send() appends user message immediately", async () => {
    vi.mocked(streamNDJSON).mockImplementation(async function* () {
      // yield nothing — simulates empty stream
    });

    const { result } = renderHook(() =>
      useChatStream({ api: "/api/gen/agent", getAccessToken: mockGetAccessToken })
    );

    await act(async () => {
      await result.current.send("check availability");
    });

    expect(result.current.messages).toContainEqual(
      expect.objectContaining({ role: "user", content: "check availability" })
    );
  });

  it("NDJSON text chunks accumulate into assistant message", async () => {
    vi.mocked(streamNDJSON).mockImplementation(async function* () {
      yield { type: "text", content: "Hello " };
      yield { type: "text", content: "there!" };
    });

    const { result } = renderHook(() =>
      useChatStream({ api: "/api/gen/agent", getAccessToken: mockGetAccessToken })
    );

    await act(async () => {
      await result.current.send("hi");
    });

    const assistantMsg = result.current.messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.content).toBe("Hello there!");
  });

  it("isStreaming is true during stream, false after completion", async () => {
    let resolveStream!: () => void;
    const streamPromise = new Promise<void>((res) => {
      resolveStream = res;
    });

    vi.mocked(streamNDJSON).mockImplementation(async function* () {
      await streamPromise;
      yield { type: "text", content: "done" };
    });

    const { result } = renderHook(() =>
      useChatStream({ api: "/api/gen/agent", getAccessToken: mockGetAccessToken })
    );

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.send("test");
    });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      resolveStream();
      await sendPromise;
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it("stop() aborts stream and sets isStreaming to false", async () => {
    let aborted = false;
    vi.mocked(streamNDJSON).mockImplementation(async function* (config) {
      config.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      // Simulate long stream
      await new Promise<void>((_, reject) => {
        config.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
      yield { type: "text", content: "never reached" };
    });

    const { result } = renderHook(() =>
      useChatStream({ api: "/api/gen/agent", getAccessToken: mockGetAccessToken })
    );

    act(() => {
      void result.current.send("test");
    });

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.isStreaming).toBe(false);
    expect(aborted).toBe(true);
  });

  it("non-text chunk types are ignored", async () => {
    vi.mocked(streamNDJSON).mockImplementation(async function* () {
      yield { type: "tool_call", content: "ignored" };
      yield { type: "text", content: "Hello" };
    });

    const { result } = renderHook(() =>
      useChatStream({ api: "/api/gen/agent", getAccessToken: mockGetAccessToken })
    );

    await act(async () => {
      await result.current.send("hi");
    });

    const assistantMsg = result.current.messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.content).toBe("Hello");
  });

  it("posts full message history to api", async () => {
    vi.mocked(streamNDJSON).mockImplementation(async function* () {
      yield { type: "text", content: "first response" };
    });

    const { result } = renderHook(() =>
      useChatStream({ api: "/api/gen/agent", getAccessToken: mockGetAccessToken })
    );

    await act(async () => {
      await result.current.send("first message");
    });

    vi.mocked(streamNDJSON).mockImplementation(async function* () {
      yield { type: "text", content: "second response" };
    });

    await act(async () => {
      await result.current.send("second message");
    });

    // Second call should have included history
    const calls = vi.mocked(streamNDJSON).mock.calls;
    const secondCall = calls[1]?.[0];
    expect(secondCall?.body).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "first message" }),
        expect.objectContaining({ role: "assistant", content: "first response" }),
        expect.objectContaining({ role: "user", content: "second message" }),
      ]),
    });
  });
});
