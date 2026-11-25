import { describe, it, expect, vi } from "vitest";
import type { ChatStreamFn, ChatStreamRequest } from "@mattbutlerengineering/rialto";
import { createOnboardingChatStream } from "./onboarding-chat-stream.js";
import type { OnboardingPatchTarget } from "./onboarding-chat-patch.js";
import { emptyDraft } from "../availability/quick-setup-draft.js";
import { EMPTY_FLOOR_PLAN_DRAFT } from "./floor-plan-draft.js";

const TARGET: OnboardingPatchTarget = {
  locationTime: { ianaTimezone: "America/New_York", currencyCode: "USD" },
  settings: { defaultReservationDuration: "90", maxPartySize: "8", advanceBookingDays: "30" },
  hours: emptyDraft("onboarding-service-1"),
  floorPlan: EMPTY_FLOOR_PLAN_DRAFT,
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

function patchLineFor(step: string, data: Record<string, string>) {
  return { type: "onboarding_patch", patch: { step, data } };
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
      kind: "applied",
      step: "locationTime",
      data: { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" },
      changed: ["ianaTimezone", "currencyCode"],
    });
  });

  it("applies an hours patch and reports the flat fields that changed", async () => {
    const { stream, onApplied } = setup([
      patchLineFor("hours", { serviceName: "Dinner", opens: "17:00", closes: "22:00" }),
    ]);
    await collect(stream(request({ step: "hours" })));
    expect(onApplied).toHaveBeenCalledTimes(1);
    const applied = onApplied.mock.calls[0]?.[0];
    expect(applied.step).toBe("hours");
    expect(applied.changed).toEqual(["serviceName", "opens", "closes", "lastSeating"]);
  });

  it("applies a floor plan patch and reports the fields that changed", async () => {
    const { stream, onApplied } = setup([
      patchLineFor("floorPlan", { templateId: "cafe", roomSize: "cozy" }),
    ]);
    await collect(stream(request({ step: "floorPlan" })));
    expect(onApplied.mock.calls[0]?.[0]).toMatchObject({
      step: "floorPlan",
      changed: ["templateId"],
    });
  });

  it("drops a patch for another step than the request's", async () => {
    const { stream, onApplied, onMalformed } = setup([
      patchLineFor("floorPlan", { templateId: "cafe" }),
    ]);
    await collect(stream(request({ step: "hours" })));
    expect(onApplied).not.toHaveBeenCalled();
    expect(onMalformed).toHaveBeenCalledTimes(1);
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

  it("merges a second patch in the same response over the first, not over stale data", async () => {
    const { stream, onApplied } = setup([
      patchLineFor("locationTime", { ianaTimezone: "Europe/Lisbon" }),
      patchLineFor("locationTime", { currencyCode: "EUR" }),
    ]);
    await collect(stream(request()));
    expect(onApplied).toHaveBeenCalledTimes(2);
    expect(onApplied.mock.calls[1]?.[0]).toEqual({
      kind: "applied",
      step: "locationTime",
      data: { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" },
      changed: ["currencyCode"],
    });
  });

  it("starts a rejection on its own paragraph after streamed text", async () => {
    const { stream } = setup([
      { type: "text", content: "Got it." },
      patchLineFor("locationTime", { ianaTimezone: "" }),
    ]);
    const out = (await collect(stream(request()))) as { content: string }[];
    expect(out.map((l) => l.content).join("")).toBe("Got it.\n\nTime zone is required");
  });

  it("steps aside for good on the ceiling line and stops reading", async () => {
    const { stream, onFallback } = setup([
      { type: "onboarding_ceiling", fallback: "form", ceilingUsd: 0.05 },
      { type: "text", content: "never seen" },
    ]);
    const out = await collect(stream(request()));
    expect(onFallback).toHaveBeenCalledWith("ceiling");
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
    expect(onFallback).toHaveBeenCalledWith("error");
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
