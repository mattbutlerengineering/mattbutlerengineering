import { describe, it, expect } from "vitest";
import { createComponentCallScrubber } from "./gen-text-scrub.js";

function run(chunks: string[]): string {
  const scrub = createComponentCallScrubber();
  return chunks.map((c) => scrub.push(c)).join("") + scrub.flush();
}

describe("createComponentCallScrubber", () => {
  it("passes plain prose through unchanged", () => {
    expect(run(["Monday's slots ", "run every 15 minutes."])).toBe(
      "Monday's slots run every 15 minutes."
    );
  });

  it("drops a raw component call in one chunk", () => {
    expect(run(['Here you go: ReservationList(items=[{"id":1}]) Anything else?'])).toBe(
      "Here you go:  Anything else?"
    );
  });

  it("drops a component call split across chunks, including the name", () => {
    expect(run(["Here: ReservationLi", "st", '(items=[{"a":(1)}', "]) done"])).toBe("Here:  done");
  });

  it("keeps ordinary words that merely precede a parenthesis", () => {
    expect(run(["Tonight (Friday) is full. See OpenTable (partner)."])).toBe(
      "Tonight (Friday) is full. See OpenTable (partner)."
    );
  });

  it("flushes a held identifier fragment at the end", () => {
    expect(run(["Try ReservationList"])).toBe("Try ReservationList");
  });
});
