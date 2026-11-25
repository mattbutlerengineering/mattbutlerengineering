import { describe, expect, it } from "vitest";
import { chatStepFor } from "./onboarding-chat-types.js";

describe("chatStepFor", () => {
  it("maps the steps that take free-form input to a chat step", () => {
    expect([2, 3, 4, 5].map(chatStepFor)).toEqual([
      "locationTime",
      "hours",
      "settings",
      "floorPlan",
    ]);
  });

  it("gives the steps the owner finishes by hand no chat, so no model call", () => {
    expect(chatStepFor(1)).toBeUndefined();
    expect(chatStepFor(6)).toBeUndefined();
    expect(chatStepFor(0)).toBeUndefined();
    expect(chatStepFor(7)).toBeUndefined();
  });
});
