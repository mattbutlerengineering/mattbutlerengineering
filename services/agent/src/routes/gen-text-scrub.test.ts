import { describe, it, expect } from "vitest";
import { createComponentCallScrubber, type ScrubberOptions } from "./gen-text-scrub.js";

function run(chunks: string[], options?: ScrubberOptions): string {
  const scrub = createComponentCallScrubber(options);
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

  it("releases the text of an unbalanced call after a bounded window", () => {
    const filler = "x".repeat(5000);
    const out = run(["See ReservationList(", filler, " and the rest of the reply."]);
    expect(out).toContain(" and the rest of the reply.");
  });

  it("releases an unbalanced call when the stream ends", () => {
    expect(run(["Try ReservationList(items=[1"])).toContain("Try ");
    expect(run(["Try ReservationList(items=[1"])).toContain("items=[1");
  });

  it("resets held text and depth on reset() so step 1's cut-off call spares step 2", () => {
    const scrub = createComponentCallScrubber();
    let out = scrub.push("Step one: ReservationList(items=[1");
    out += scrub.reset();
    out += scrub.push("Monday is open (all day).");
    out += scrub.flush();
    expect(out).toBe("Step one: Monday is open (all day).");
  });

  it("scrubs one-hump catalog names, split across chunks too", () => {
    const options = { knownNames: ["Calendar", "Stack"] };
    expect(run(["Here: Calendar(month=1) ok"], options)).toBe("Here:  ok");
    expect(run(["Here: Calen", "dar", "(month=1) ok"], options)).toBe("Here:  ok");
  });

  it("leaves one-hump names alone when not catalog names or not followed by a paren", () => {
    const options = { knownNames: ["Calendar"] };
    expect(run(["Hello (world). Tuesday(ish) Calendar is nice."], options)).toBe(
      "Hello (world). Tuesday(ish) Calendar is nice."
    );
    expect(run(["Hello Calendar(1)"])).toBe("Hello Calendar(1)");
  });
});
