import { describe, it, expect, vi } from "vitest";
import type { ChatStreamFn, ChatStreamRequest } from "@mattbutlerengineering/rialto";
import { createOnboardingChatStream } from "./onboarding-chat-stream.js";
import type { OnboardingPatchTarget } from "./onboarding-chat-patch.js";

const TARGET: OnboardingPatchTarget = {
  locationTime: { ianaTimezone: "America/New_York", currencyCode: "USD" },
  settings: { defaultReservationDuration: "90", maxPartySize: "8", advanceBookingDays: "30" },
};

function streamOf(lines: readonly unknown[]): ChatStreamFn {
  return async function* () {
    for (const line of lines) yield line;
  };
}

function request(overrides: Record<string, unknown> = {}): ChatStreamRequest {
  return {
    url: "/api/gen/onboarding",
    body: {
      step: "locationTime",
      messages: [{ role: "user", content: "hi" }],
      ...overrides,
    },
  };
}

function setup(lines: readonly unknown[]) {
  const callbacks = {
    onApplied: vi.fn(),
    onFallback: vi.fn(),
    onMalformed: vi.fn(),
    describeRejection: vi.fn(() => "Time zone is required"),
  };
  const stream = createOnboardingChatStream({
    base: streamOf(lines),
    getTarget: () => TARGET,
    ...callbacks,
  });
  return { stream, ...callbacks };
}

async function collect(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const line of iterable) out.push(line);
  return out;
}

const PATCH_LINE = {
  type: "onboarding_patch",
  patch: { step: "locationTime", data: { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" } },
};

describe("createOnboardingChatStream", () => {
  it("applies a valid patch and reports the fields that changed", async () => {
    const { stream, onApplied } = setup([PATCH_LINE]);
    await collect(stream(request()));
    expect(onApplied).toHaveBeenCalledWith({
      step: "locationTime",
      data: { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" },
      changed: ["ianaTimezone", "currencyCode"],
    });
  });

  it("reports only fields whose value actually changed", async () => {
    const { stream, onApplied } = setup([
      {
        type: "onboarding_patch",
        patch: { step: "locationTime", data: { ianaTimezone: "Europe/Lisbon" } },
      },
    ]);
    await collect(stream(request()));
    expect(onApplied.mock.calls[0]?.[0].changed).toEqual(["ianaTimezone"]);
  });

  it("shows validator errors as chat text and applies nothing when a patch is rejected", async () => {
    const { stream, onApplied, describeRejection } = setup([
      {
        type: "onboarding_patch",
        patch: { step: "locationTime", data: { ianaTimezone: "" } },
      },
    ]);
    const out = await collect(stream(request()));
    expect(onApplied).not.toHaveBeenCalled();
    expect(describeRejection).toHaveBeenCalled();
    expect(out).toEqual([{ type: "text", content: "Time zone is required" }]);
  });

  it("ignores a malformed patch and reports it", async () => {
    const { stream, onApplied, onMalformed } = setup([
      { type: "onboarding_patch", patch: { step: "locationTime", data: { bogus: "x" } } },
    ]);
    const out = await collect(stream(request()));
    expect(onApplied).not.toHaveBeenCalled();
    expect(onMalformed).toHaveBeenCalledTimes(1);
    expect(out).toEqual([]);
  });

  it("treats a patch for a different step than the request as malformed", async () => {
    const { stream, onApplied, onMalformed } = setup([
      {
        type: "onboarding_patch",
        patch: { step: "settings", data: { maxPartySize: "10" } },
      },
    ]);
    await collect(stream(request()));
    expect(onApplied).not.toHaveBeenCalled();
    expect(onMalformed).toHaveBeenCalledTimes(1);
  });

  it("steps aside on the ceiling line and stops reading", async () => {
    const { stream, onFallback } = setup([
      { type: "onboarding_ceiling", fallback: "form", ceilingUsd: 0.05 },
      { type: "text", content: "never seen" },
    ]);
    const out = await collect(stream(request()));
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(out).toEqual([]);
  });

  it("steps aside on a stream error instead of surfacing it", async () => {
    const onFallback = vi.fn();
    const stream = createOnboardingChatStream({
      base: async function* () {
        yield { type: "text", content: "Hel" };
        throw new Error("This UI is too large");
      },
      getTarget: () => TARGET,
      onApplied: vi.fn(),
      onFallback,
      onMalformed: vi.fn(),
      describeRejection: () => "",
    });
    const out = await collect(stream(request()));
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(out).toEqual([{ type: "text", content: "Hel" }]);
  });

  it("rethrows an abort so Stop still works", async () => {
    const stream = createOnboardingChatStream({
      base: async function* () {
        yield* [];
        throw new DOMException("aborted", "AbortError");
      },
      getTarget: () => TARGET,
      onApplied: vi.fn(),
      onFallback: vi.fn(),
      onMalformed: vi.fn(),
      describeRejection: () => "",
    });
    await expect(collect(stream(request()))).rejects.toThrow("aborted");
  });

  it("passes text lines through untouched", async () => {
    const { stream } = setup([{ type: "text", content: "Lisbon, got it." }]);
    expect(await collect(stream(request()))).toEqual([
      { type: "text", content: "Lisbon, got it." },
    ]);
  });

  it("sends only the last 6 messages, each capped at 600 characters, starting on a user turn", async () => {
    const seen: ChatStreamRequest[] = [];
    const stream = createOnboardingChatStream({
      base: async function* (req) {
        seen.push(req);
        yield* [];
      },
      getTarget: () => TARGET,
      onApplied: vi.fn(),
      onFallback: vi.fn(),
      onMalformed: vi.fn(),
      describeRejection: () => "",
    });
    const messages = Array.from({ length: 9 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: i === 8 ? "x".repeat(700) : `m${i}`,
    }));
    await collect(stream(request({ messages })));
    const sent = (seen[0]?.body as { messages: { role: string; content: string }[] }).messages;
    // last 6 of 9 = m3..m8, m3 is an assistant turn -> dropped
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(sent.at(-1)?.content).toHaveLength(600);
    expect(sent[0]?.content).toBe("m4");
  });
});
