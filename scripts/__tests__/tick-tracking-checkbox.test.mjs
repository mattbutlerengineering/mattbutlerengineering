import { describe, it, expect } from "vitest";

import { tickTrackingCheckbox, planTrackingUpdates } from "../tick-tracking-checkbox.mjs";

const BODY = `## Summary

Batch 2026-08-17.

## Implementation Plan

- [ ] #4185 — first child
- [ ] #4186 — second child
- [ ] #418 — a much older child

## Notes

- Total issues: 3
`;

describe("tickTrackingCheckbox", () => {
  it("ticks the matching line when the child closes", () => {
    const out = tickTrackingCheckbox(BODY, 4186, true);
    expect(out).toContain("- [x] #4186 — second child");
  });

  it("leaves every other line byte-identical", () => {
    const out = tickTrackingCheckbox(BODY, 4186, true);
    const before = BODY.split("\n");
    const after = out.split("\n");
    expect(after).toHaveLength(before.length);
    const differing = after.filter((line, i) => line !== before[i]);
    expect(differing).toEqual(["- [x] #4186 — second child"]);
  });

  it("matches issue numbers exactly — #418 does not tick #4185", () => {
    const out = tickTrackingCheckbox(BODY, 418, true);
    expect(out).toContain("- [x] #418 — a much older child");
    expect(out).toContain("- [ ] #4185 — first child");
    expect(out).toContain("- [ ] #4186 — second child");
  });

  it("does not tick a longer number when the shorter one is the target", () => {
    const body = "- [ ] #41850 — long\n";
    expect(tickTrackingCheckbox(body, 4185, true)).toBe(body);
  });

  it("returns the body unchanged when no line matches", () => {
    expect(tickTrackingCheckbox(BODY, 9999, true)).toBe(BODY);
  });

  it("unticks on reopen", () => {
    const ticked = tickTrackingCheckbox(BODY, 4185, true);
    const out = tickTrackingCheckbox(ticked, 4185, false);
    expect(out).toBe(BODY);
  });

  it("is idempotent when already in the desired state", () => {
    const ticked = tickTrackingCheckbox(BODY, 4185, true);
    expect(tickTrackingCheckbox(ticked, 4185, true)).toBe(ticked);
    expect(tickTrackingCheckbox(BODY, 4185, false)).toBe(BODY);
  });

  it("treats an uppercase [X] as already ticked", () => {
    const body = "- [X] #4185 — first child\n";
    expect(tickTrackingCheckbox(body, 4185, true)).toBe(body);
  });

  it("only matches #N as the first token after the checkbox", () => {
    const body = "- [ ] #4185 — fixes the #418 collision\n";
    expect(tickTrackingCheckbox(body, 418, true)).toBe(body);
    expect(tickTrackingCheckbox(body, 4185, true)).toContain("- [x] #4185");
  });

  it("accepts asterisk bullets and indented nesting", () => {
    const body = "  * [ ] #4185 — nested child\n";
    expect(tickTrackingCheckbox(body, 4185, true)).toBe("  * [x] #4185 — nested child\n");
  });

  it("ignores prose lines that merely mention the number", () => {
    const body = "Closes #4185 once every child lands.\n";
    expect(tickTrackingCheckbox(body, 4185, true)).toBe(body);
  });

  it("handles a null or empty body without throwing", () => {
    expect(tickTrackingCheckbox("", 4185, true)).toBe("");
    expect(tickTrackingCheckbox(null, 4185, true)).toBe(null);
  });

  it("preserves CRLF line endings", () => {
    const body = "- [ ] #4185 — first\r\n- [ ] #4186 — second\r\n";
    const out = tickTrackingCheckbox(body, 4185, true);
    expect(out).toBe("- [x] #4185 — first\r\n- [ ] #4186 — second\r\n");
  });
});

describe("planTrackingUpdates", () => {
  const tracking = [
    { number: 100, body: "- [ ] #4185 — child\n" },
    { number: 200, body: "- [ ] #4185 — same child, second parent\n" },
    { number: 300, body: "- [ ] #9999 — unrelated child\n" },
  ];

  it("updates every open tracking issue referencing the child", () => {
    const updates = planTrackingUpdates(
      { number: 4185, isTracking: false, closed: true },
      tracking
    );
    expect(updates.map((u) => u.number)).toEqual([100, 200]);
    expect(updates[0].body).toContain("- [x] #4185");
    expect(updates[1].body).toContain("- [x] #4185");
  });

  it("leaves tracking issues that do not reference the child alone", () => {
    const updates = planTrackingUpdates(
      { number: 4185, isTracking: false, closed: true },
      tracking
    );
    expect(updates.some((u) => u.number === 300)).toBe(false);
  });

  it("is a no-op when the event issue is itself a tracking issue", () => {
    expect(planTrackingUpdates({ number: 4185, isTracking: true, closed: true }, tracking)).toEqual(
      []
    );
  });

  it("is a no-op when no tracking issue needs changing", () => {
    expect(planTrackingUpdates({ number: 777, isTracking: false, closed: true }, tracking)).toEqual(
      []
    );
  });

  it("is a no-op when every box is already in the desired state", () => {
    const ticked = [{ number: 100, body: "- [x] #4185 — child\n" }];
    expect(planTrackingUpdates({ number: 4185, isTracking: false, closed: true }, ticked)).toEqual(
      []
    );
  });

  it("unticks on reopen", () => {
    const ticked = [{ number: 100, body: "- [x] #4185 — child\n" }];
    const updates = planTrackingUpdates({ number: 4185, isTracking: false, closed: false }, ticked);
    expect(updates).toHaveLength(1);
    expect(updates[0].body).toContain("- [ ] #4185");
  });

  it("handles an empty tracking list", () => {
    expect(planTrackingUpdates({ number: 4185, isTracking: false, closed: true }, [])).toEqual([]);
  });
});
