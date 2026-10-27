// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  PENDING_PROMPT_KEY,
  clearPendingPrompt,
  readInterruptedPrompt,
  rememberPendingPrompt,
  resetInterruptedPromptCache,
} from "./pending-prompt.js";

afterEach(() => {
  sessionStorage.clear();
  resetInterruptedPromptCache();
});

describe("pending prompt", () => {
  it("returns the stashed prompt once, then nothing", () => {
    rememberPendingPrompt("a 500-row table of users");
    expect(sessionStorage.getItem(PENDING_PROMPT_KEY)).toBe("a 500-row table of users");
    expect(readInterruptedPrompt()).toBe("a 500-row table of users");
    expect(sessionStorage.getItem(PENDING_PROMPT_KEY)).toBeNull();
    expect(readInterruptedPrompt()).toBe("a 500-row table of users");
  });

  it("returns null when nothing was stashed", () => {
    expect(readInterruptedPrompt()).toBeNull();
  });

  it("clears a stashed prompt so a finished generation is not restored", () => {
    rememberPendingPrompt("pricing page");
    clearPendingPrompt();
    resetInterruptedPromptCache();
    expect(readInterruptedPrompt()).toBeNull();
  });
});
