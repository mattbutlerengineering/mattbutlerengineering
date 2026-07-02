import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Spec } from "@json-render/react";
import type { StoredSpec } from "../types.js";
import { createRefinementPrompt } from "./createRefinementPrompt.js";

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
let capturedOnComplete: OnComplete | undefined;

vi.mock("../hooks/useGenStream.js", () => ({
  useGenStream: (opts: { onComplete?: OnComplete }) => {
    capturedOnComplete = opts.onComplete;
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
    mockSaveSpec.mockResolvedValue(makeStoredSpec({ id: "new-id" }));
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

    it("only surfaces displayError while streaming", () => {
      const err = new Error("boom");
      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      const { result, rerender } = renderHook(() => usePlaygroundSession());
      expect(result.current.displayError).toBe(null);
      expect(result.current.error).toBe(err);

      genStreamState = { ...genStreamState, isStreaming: true };
      rerender();
      expect(result.current.displayError).toBe(err);
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
  });
});
