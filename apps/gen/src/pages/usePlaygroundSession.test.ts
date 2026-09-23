import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Spec } from "@json-render/react";
import type { StoredSpec } from "../types.js";
import { createRefinementPrompt } from "./createRefinementPrompt.js";
import { createErrorRecoveryPrompt } from "./createErrorRecoveryPrompt.js";

const mockSend = vi.fn();
const mockStop = vi.fn();

interface GenStreamState {
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  rawLines: string[];
}

let genStreamState: GenStreamState = {
  spec: null,
  isStreaming: false,
  error: null,
  rawLines: [],
};

type OnComplete = (spec: Spec, rawLines: string[]) => void;
type OnError = (error: Error) => void;
let capturedOnComplete: OnComplete | undefined;
let capturedOnError: OnError | undefined;

vi.mock("../hooks/useGenStream.js", () => ({
  useGenStream: (opts: { onComplete?: OnComplete; onError?: OnError }) => {
    capturedOnComplete = opts.onComplete;
    capturedOnError = opts.onError;
    return { ...genStreamState, send: mockSend, stop: mockStop };
  },
}));

const mockSaveSpec = vi.fn();
const mockToggleFavorite = vi.fn();
const mockDeleteSpec = vi.fn();

let specsApiState: { specs: StoredSpec[]; isLoading: boolean } = {
  specs: [],
  isLoading: false,
};

vi.mock("../hooks/useSpecsApi.js", () => ({
  useSpecsApi: () => ({
    ...specsApiState,
    saveSpec: mockSaveSpec,
    toggleFavorite: mockToggleFavorite,
    deleteSpec: mockDeleteSpec,
  }),
}));

import { usePlaygroundSession } from "./usePlaygroundSession.js";

function makeStoredSpec(overrides: Partial<StoredSpec>): StoredSpec {
  return {
    id: "s1",
    userId: "u1",
    prompt: "a prompt",
    spec: { type: "Box", children: [] },
    rawLines: ["{}"],
    isFavorite: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

describe("usePlaygroundSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    genStreamState = { spec: null, isStreaming: false, error: null, rawLines: [] };
    specsApiState = { specs: [], isLoading: false };
    capturedOnComplete = undefined;
    capturedOnError = undefined;
    mockSaveSpec.mockResolvedValue(makeStoredSpec({ id: "new-id" }));
    window.history.pushState({}, "", "/");
  });

  it("starts in generate mode with no active spec", () => {
    const { result } = renderHook(() => usePlaygroundSession());
    expect(result.current.mode).toBe("generate");
    expect(result.current.activeSpecId).toBe(null);
    expect(result.current.displaySpec).toBe(null);
  });

  describe("submit", () => {
    it("sends the raw prompt in generate mode and clears the active spec", () => {
      specsApiState = { specs: [makeStoredSpec({ id: "s1" })], isLoading: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));
      expect(result.current.activeSpecId).toBe("s1");

      act(() => result.current.submit("draw a button"));
      expect(mockSend).toHaveBeenCalledWith("draw a button");
      expect(result.current.activeSpecId).toBe(null);
    });

    it("embeds the current spec via createRefinementPrompt while in refine mode", () => {
      const currentSpec = { type: "Card", children: [] } as unknown as Spec;
      genStreamState = { ...genStreamState, spec: currentSpec };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.refine());
      expect(result.current.mode).toBe("refine");

      act(() => result.current.submit("make it blue"));
      expect(mockSend).toHaveBeenCalledWith(createRefinementPrompt(currentSpec, "make it blue"));
    });

    it("falls back to a plain submit in refine mode when there is no display spec", () => {
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.refine());
      act(() => result.current.submit("hello"));

      expect(mockSend).toHaveBeenCalledWith("hello");
    });
  });

  describe("replay", () => {
    it("resubmits the entry's original prompt and exits refinement mode", () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", prompt: "Original prompt" })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.refine());
      act(() => result.current.replay("s1"));

      expect(mockSend).toHaveBeenCalledWith("Original prompt");
      expect(result.current.mode).toBe("generate");
      expect(result.current.activeSpecId).toBe(null);
    });

    it("is a no-op when the id isn't found in specs", () => {
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.replay("missing"));
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("retry", () => {
    it("resubmits the active entry's prompt", () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", prompt: "Retry me" })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));
      act(() => result.current.retry());

      expect(mockSend).toHaveBeenCalledWith("Retry me");
      expect(result.current.activeSpecId).toBe(null);
    });

    it("falls back to the last submitted prompt when there's no active entry", () => {
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("first try"));
      act(() => result.current.retry());

      expect(mockSend).toHaveBeenNthCalledWith(1, "first try");
      expect(mockSend).toHaveBeenNthCalledWith(2, "first try");
    });

    it("is a no-op when there is no active entry and no prior prompt", () => {
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.retry());
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("feeds the error back to the model instead of a bare resubmit when there is a current error", () => {
      const err = new Error("Invalid nested layout");
      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a form"));
      act(() => result.current.retry());

      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        createErrorRecoveryPrompt("draw a form", "Invalid nested layout")
      );
    });

    it("tags the retried prompt as recovered so a later success is distinguishable in history", async () => {
      const err = new Error("Invalid nested layout");
      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a form"));
      act(() => result.current.retry());

      const completedSpec = { type: "Box", children: [] } as unknown as Spec;
      await act(async () => {
        capturedOnComplete?.(completedSpec, ["{line}"]);
        await Promise.resolve();
      });

      expect(mockSaveSpec).toHaveBeenCalledWith({
        prompt: "Recovered: draw a form",
        spec: completedSpec,
        rawLines: ["{line}"],
      });
    });
  });

  describe("selectHistory", () => {
    it("sets the active id and exits refinement mode", () => {
      specsApiState = { specs: [makeStoredSpec({ id: "s1" })], isLoading: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.refine());
      act(() => result.current.selectHistory("s1"));

      expect(result.current.activeSpecId).toBe("s1");
      expect(result.current.mode).toBe("generate");
    });

    it("is ignored while streaming", () => {
      genStreamState = { ...genStreamState, isStreaming: true };
      specsApiState = { specs: [makeStoredSpec({ id: "s1" })], isLoading: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));
      expect(result.current.activeSpecId).toBe(null);
    });
  });

  describe("reset", () => {
    it("clears the active spec and exits refinement mode", () => {
      specsApiState = { specs: [makeStoredSpec({ id: "s1" })], isLoading: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.refine());
      act(() => result.current.selectHistory("s1"));
      act(() => result.current.reset());

      expect(result.current.mode).toBe("generate");
      expect(result.current.activeSpecId).toBe(null);
    });
  });

  describe("toggleFavorite / deleteSpec", () => {
    it("delegates toggleFavorite directly to useSpecsApi", () => {
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.toggleFavorite("s1"));
      expect(mockToggleFavorite).toHaveBeenCalledWith("s1");
    });

    it("clears the active id when deleting the active entry", () => {
      specsApiState = { specs: [makeStoredSpec({ id: "s1" })], isLoading: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));
      act(() => result.current.deleteSpec("s1"));

      expect(mockDeleteSpec).toHaveBeenCalledWith("s1");
      expect(result.current.activeSpecId).toBe(null);
    });

    it("leaves the active id untouched when deleting a different entry", () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1" }), makeStoredSpec({ id: "s2" })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));
      act(() => result.current.deleteSpec("s2"));

      expect(result.current.activeSpecId).toBe("s1");
    });
  });

  describe("derived display values", () => {
    it("prefers the active history entry's spec when not streaming", () => {
      const entrySpec = { type: "Card", children: [] } as unknown as Spec;
      genStreamState = {
        ...genStreamState,
        spec: { type: "Box", children: [] } as unknown as Spec,
      };
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", spec: entrySpec, rawLines: ["{entry}"] })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));

      expect(result.current.displaySpec).toEqual(entrySpec);
      expect(result.current.displayRawLines).toEqual(["{entry}"]);
    });

    it("prefers the live streaming spec over a selected history entry", () => {
      const entrySpec = { type: "Card", children: [] } as unknown as Spec;
      const liveSpec = { type: "Box", children: [] } as unknown as Spec;
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", spec: entrySpec })],
        isLoading: false,
      };
      const { result, rerender } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));
      expect(result.current.activeSpecId).toBe("s1");

      genStreamState = { ...genStreamState, isStreaming: true, spec: liveSpec };
      rerender();

      expect(result.current.displaySpec).toEqual(liveSpec);
      expect(result.current.activeSpecId).toBe(null);
    });

    it("surfaces displayError once the stream has settled into failure", () => {
      // useGenStream flips isStreaming to false in the same batch that it sets
      // error — so a settled failure is (isStreaming: false, error: <Error>).
      // The error must stay visible here instead of only flashing a toast.
      const err = new Error("boom");
      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      const { result } = renderHook(() => usePlaygroundSession());
      expect(result.current.displayError).toBe(err);
      expect(result.current.error).toBe(err);
    });

    it("suppresses displayError once a saved history entry is selected", () => {
      const err = new Error("boom");
      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      specsApiState = { specs: [makeStoredSpec({ id: "s1" })], isLoading: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));

      expect(result.current.displayError).toBe(null);
    });

    it("exposes the failing prompt so it can be restored for editing instead of lost", () => {
      const { result, rerender } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a form"));
      genStreamState = { ...genStreamState, error: new Error("boom"), isStreaming: false };
      rerender();

      expect(result.current.failedPrompt).toBe("draw a form");
    });

    it("does not expose a failing prompt when there is no error", () => {
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.submit("draw a form"));
      expect(result.current.failedPrompt).toBe(null);
    });
  });

  describe("initial prompt query param", () => {
    it("submits the decoded prompt param automatically on mount", async () => {
      window.history.pushState({}, "", "/?prompt=draw%20a%20button");

      renderHook(() => usePlaygroundSession());
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith("draw a button");
    });

    it("does not submit anything when the prompt param is absent", async () => {
      window.history.pushState({}, "", "/");

      renderHook(() => usePlaygroundSession());
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it("ignores a blank prompt param", async () => {
      window.history.pushState({}, "", "/?prompt=%20%20");

      renderHook(() => usePlaygroundSession());
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it("only submits once even if the hook re-renders", async () => {
      window.history.pushState({}, "", "/?prompt=hello");

      const { rerender } = renderHook(() => usePlaygroundSession());
      await act(async () => {
        await Promise.resolve();
      });
      rerender();
      rerender();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("generation completion", () => {
    it("saves the completed spec and makes it the active entry", async () => {
      const completedSpec = { type: "Box", children: [] } as unknown as Spec;
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw something"));

      await act(async () => {
        capturedOnComplete?.(completedSpec, ["{line}"]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockSaveSpec).toHaveBeenCalledWith({
        prompt: "draw something",
        spec: completedSpec,
        rawLines: ["{line}"],
      });
      expect(result.current.activeSpecId).toBe("new-id");
    });

    it("invokes onGenerationComplete when the stream completes", async () => {
      const onGenerationComplete = vi.fn();
      const completedSpec = { type: "Box", children: [] } as unknown as Spec;
      const { result } = renderHook(() => usePlaygroundSession({ onGenerationComplete }));

      act(() => result.current.submit("draw something"));

      await act(async () => {
        capturedOnComplete?.(completedSpec, ["{line}"]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(onGenerationComplete).toHaveBeenCalledTimes(1);
    });

    it("does not throw when onGenerationComplete is omitted", async () => {
      const completedSpec = { type: "Box", children: [] } as unknown as Spec;
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw something"));

      await act(async () => {
        capturedOnComplete?.(completedSpec, ["{line}"]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockSaveSpec).toHaveBeenCalled();
    });
  });

  describe("generation failure", () => {
    it("records the failed attempt in history, tagged and without a renderable spec", async () => {
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a broken form"));

      await act(async () => {
        capturedOnError?.(new Error("Invalid nested layout"));
        await Promise.resolve();
      });

      expect(mockSaveSpec).toHaveBeenCalledWith({
        prompt: "Failed: draw a broken form",
        spec: { root: "", elements: {} },
        rawLines: [],
      });
    });

    it("does not select the failed attempt as active, so the error stays visible", async () => {
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a broken form"));

      await act(async () => {
        capturedOnError?.(new Error("boom"));
        await Promise.resolve();
      });

      expect(result.current.activeSpecId).toBe(null);
    });
  });
});
