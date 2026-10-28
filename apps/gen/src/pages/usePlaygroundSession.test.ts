import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetInterruptedPromptCache } from "../lib/pending-prompt.js";
import { renderHook, act } from "@testing-library/react";
import type { Spec } from "@json-render/react";
import type { StoredSpec } from "../types.js";
import { createRefinementPrompt } from "./createRefinementPrompt.js";
import { createErrorRecoveryPrompt } from "./createErrorRecoveryPrompt.js";

const mockSend = vi.fn();
const mockStop = vi.fn();
const mockClear = vi.fn();

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
    return { ...genStreamState, send: mockSend, stop: mockStop, clear: mockClear };
  },
}));

const mockSaveSpec = vi.fn();
const mockToggleFavorite = vi.fn();
const mockDeleteSpec = vi.fn();

let specsApiState: { specs: StoredSpec[]; isLoading: boolean } = {
  specs: [],
  isLoading: false,
};

const mockFetchSpecs = vi.fn();

vi.mock("../hooks/useSpecsApi.js", () => ({
  useSpecsApi: () => ({
    ...specsApiState,
    error: null,
    fetchSpecs: mockFetchSpecs,
    saveSpec: mockSaveSpec,
    toggleFavorite: mockToggleFavorite,
    deleteSpec: mockDeleteSpec,
  }),
}));

const mockValidateSpec = vi.fn();
vi.mock("../lib/validate-spec.js", () => ({
  validateSpecAgainstCatalog: (spec: Spec) => mockValidateSpec(spec),
}));

import { usePlaygroundSession } from "./usePlaygroundSession.js";
import { createSubtreeRefinementPrompt } from "./createSubtreeRefinementPrompt.js";

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
    sessionStorage.clear();
    resetInterruptedPromptCache();
    vi.clearAllMocks();
    genStreamState = { spec: null, isStreaming: false, error: null, rawLines: [] };
    specsApiState = { specs: [], isLoading: false };
    capturedOnComplete = undefined;
    capturedOnError = undefined;
    mockSaveSpec.mockResolvedValue(makeStoredSpec({ id: "new-id" }));
    mockValidateSpec.mockReturnValue({ ok: true });
    window.history.pushState({}, "", "/");
  });

  it("starts in generate mode with no active spec", () => {
    const { result } = renderHook(() => usePlaygroundSession());
    expect(result.current.mode).toBe("generate");
    expect(result.current.activeSpecId).toBe(null);
    expect(result.current.displaySpec).toBe(null);
  });

  it("restores a prompt that a refresh interrupted and tells the user once", () => {
    sessionStorage.setItem("gen.pendingPrompt", "pricing page");
    resetInterruptedPromptCache();
    const onNotice = vi.fn();
    const { result } = renderHook(() => usePlaygroundSession({ onNotice }));
    expect(result.current.interruptedPrompt).toBe("pricing page");
    expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/interrupted/i));
  });

  it("drops the stashed prompt once the generation completes", async () => {
    const { result } = renderHook(() => usePlaygroundSession());
    act(() => result.current.submit("draw a table"));
    expect(sessionStorage.getItem("gen.pendingPrompt")).toBe("draw a table");
    await act(async () => {
      capturedOnComplete?.({ root: "r", elements: {} }, []);
    });
    expect(sessionStorage.getItem("gen.pendingPrompt")).toBeNull();
  });

  it("keeps the stashed prompt when the stream fails the way a refresh abort does", () => {
    const { result } = renderHook(() => usePlaygroundSession());
    act(() => result.current.submit("a 500-row table of users"));
    act(() => {
      capturedOnError?.(new TypeError("Failed to fetch"));
    });
    expect(sessionStorage.getItem("gen.pendingPrompt")).toBe("a 500-row table of users");
  });

  it("keeps the stashed prompt when the page hides as the stream completes", async () => {
    const { result } = renderHook(() => usePlaygroundSession());
    act(() => result.current.submit("pricing page"));
    window.dispatchEvent(new Event("pagehide"));
    await act(async () => {
      capturedOnComplete?.({ root: "r", elements: {} }, []);
    });
    expect(sessionStorage.getItem("gen.pendingPrompt")).toBe("pricing page");
  });

  describe("submit", () => {
    it("stops an in-flight generation before sending, so send is not ignored", () => {
      genStreamState = { spec: null, isStreaming: true, error: null, rawLines: [] };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("pricing template"));

      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith("pricing template");
      expect(mockStop.mock.invocationCallOrder[0]).toBeLessThan(
        mockSend.mock.invocationCallOrder[0] ?? 0
      );
    });

    it("does not stop when nothing is streaming", () => {
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.submit("hi"));
      expect(mockStop).not.toHaveBeenCalled();
    });

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

  describe("refineNode", () => {
    const BASE: Spec = {
      root: "root",
      elements: {
        root: { type: "Stack", props: {}, children: ["card", "footer"] },
        card: { type: "Stack", props: { gap: "sm" }, children: ["label"] },
        label: { type: "Text", props: { text: "Hi" }, children: [] },
        footer: { type: "Text", props: { text: "Bye" }, children: [] },
      },
    };
    const REPLACEMENT: Spec = {
      root: "card",
      elements: { card: { type: "Grid", props: { columns: 3 }, children: [] } },
    };

    function setup() {
      genStreamState = { ...genStreamState, spec: BASE };
      return renderHook(() => usePlaygroundSession());
    }

    async function complete(spec: Spec) {
      await act(async () => {
        capturedOnComplete?.(spec, ["{line}"]);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    it("requests only the subtree, with ancestry and target, via the stream", () => {
      const { result } = setup();
      act(() => result.current.refineNode("card", "make this a 3-column grid"));
      expect(mockSend).toHaveBeenCalledWith(
        createSubtreeRefinementPrompt(
          { root: "card", elements: { card: BASE.elements.card!, label: BASE.elements.label! } },
          [{ key: "root", type: "Stack" }],
          "make this a 3-column grid"
        ),
        {
          subtree: {
            root: "card",
            elements: { card: BASE.elements.card, label: BASE.elements.label },
          },
          ancestors: [{ key: "root", type: "Stack" }],
        },
        { target: { key: "card", type: "Stack" } }
      );
    });

    it("keeps showing the original spec while the subtree streams", () => {
      const { result, rerender } = setup();
      act(() => result.current.refineNode("card", "grid"));
      genStreamState = { ...genStreamState, isStreaming: true, spec: REPLACEMENT };
      rerender();
      expect(result.current.displaySpec).toBe(BASE);
    });

    it("splices the streamed subtree and saves the whole spec as a refine entry", async () => {
      const { result } = setup();
      act(() => result.current.refineNode("card", "grid"));
      await complete(REPLACEMENT);

      expect(mockSaveSpec).toHaveBeenCalledTimes(1);
      const saved = mockSaveSpec.mock.calls[0]?.[0] as { spec: Spec; kind: string; prompt: string };
      expect(saved.kind).toBe("refine");
      expect(saved.prompt).toBe("grid");
      expect(saved.spec.elements.card).toEqual(REPLACEMENT.elements.card);
      expect(saved.spec.elements.root).toEqual(BASE.elements.root);
      expect(saved.spec.elements.footer).toEqual(BASE.elements.footer);
      expect(saved.spec.elements.label).toBeUndefined();
      expect(mockValidateSpec).toHaveBeenCalledWith(saved.spec);
      expect(result.current.activeSpecId).toBe("new-id");
    });

    it("saves the node refinement as a diff on the active entry", async () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "parent", spec: BASE })],
        isLoading: false,
      };
      const { result } = setup();
      act(() => result.current.selectHistory("parent"));
      act(() => result.current.refineNode("card", "grid"));
      await complete(REPLACEMENT);

      const saved = mockSaveSpec.mock.calls[0]?.[0] as { refinement: unknown };
      expect(saved.refinement).toEqual({
        parentId: "parent",
        path: "card",
        before: {
          root: "card",
          elements: { card: BASE.elements.card, label: BASE.elements.label },
        },
        after: REPLACEMENT,
      });
    });

    it("saves a null parentId when the refined spec is not a saved entry", async () => {
      const { result } = setup();
      act(() => result.current.refineNode("card", "grid"));
      await complete(REPLACEMENT);

      const saved = mockSaveSpec.mock.calls[0]?.[0] as {
        refinement: { parentId: unknown; path: string };
      };
      expect(saved.refinement.parentId).toBeNull();
      expect(saved.refinement.path).toBe("card");
    });

    describe("undo / redo", () => {
      async function refined() {
        const view = setup();
        mockSaveSpec.mockImplementationOnce(async (data: { spec: unknown }) => {
          specsApiState = {
            specs: [makeStoredSpec({ id: "new-id", spec: data.spec })],
            isLoading: false,
          };
          return { id: "new-id" };
        });
        act(() => view.result.current.refineNode("card", "grid"));
        await complete(REPLACEMENT);
        mockSend.mockClear();
        mockSaveSpec.mockClear();
        return view;
      }

      it("undo restores the pre-refine spec and redo the refined one, with no model call or new entry", async () => {
        const { result } = await refined();
        const refinedSpec = result.current.displaySpec;
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(false);

        act(() => result.current.undo());
        expect(result.current.displaySpec).toEqual(BASE);
        expect(result.current.canRedo).toBe(true);

        act(() => result.current.redo());
        expect(result.current.displaySpec).toEqual(refinedSpec);

        expect(mockSend).not.toHaveBeenCalled();
        expect(mockSaveSpec).not.toHaveBeenCalled();
      });

      it("ignores undo while the refinement is still being saved", async () => {
        const view = setup();
        let finishSave: (stored: { id: string }) => void = () => {};
        mockSaveSpec.mockImplementationOnce(
          () => new Promise<{ id: string }>((resolve) => (finishSave = resolve))
        );
        act(() => view.result.current.refineNode("card", "grid"));
        await complete(REPLACEMENT);

        act(() => view.result.current.undo());
        expect(view.result.current.canRedo).toBe(false);
        expect(view.result.current.canUndo).toBe(true);

        await act(async () => {
          finishSave({ id: "new-id" });
          await Promise.resolve();
        });
        act(() => view.result.current.undo());
        expect(view.result.current.canRedo).toBe(true);
      });

      it("a new refinement after an undo clears redo", async () => {
        const { result } = await refined();
        act(() => result.current.undo());
        expect(result.current.canRedo).toBe(true);

        act(() => result.current.refineNode("footer", "louder"));
        await complete({
          root: "footer",
          elements: { footer: { type: "Text", props: { text: "BYE" }, children: [] } },
        });
        expect(result.current.canRedo).toBe(false);
      });

      it("exposes the last change for the inspector and clears history on a whole-spec submit", async () => {
        const { result } = await refined();
        expect(result.current.lastChange?.path).toBe("card");
        act(() => result.current.undo());
        expect(result.current.lastChange?.after).toEqual(expect.objectContaining({ root: "card" }));

        act(() => result.current.submit("something else"));
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
        expect(result.current.lastChange).toBeNull();
      });

      it("undo and redo are no-ops with nothing to do", () => {
        const { result } = setup();
        act(() => result.current.undo());
        act(() => result.current.redo());
        expect(result.current.displaySpec).toBe(BASE);
      });
    });

    it("rejects a spliced spec the catalog does not accept and keeps the original on screen", async () => {
      mockValidateSpec.mockReturnValue({ ok: false, message: "unknown type Nope" });
      const { result } = setup();
      act(() => result.current.refineNode("card", "grid"));
      await complete(REPLACEMENT);

      expect(mockSaveSpec).not.toHaveBeenCalled();
      expect(result.current.displayError?.message).toContain("unknown type Nope");
      expect(result.current.displaySpec).toBe(BASE);
    });

    it("rejects a subtree whose root key is not the selected key", async () => {
      const { result } = setup();
      act(() => result.current.refineNode("card", "grid"));
      await complete({ root: "other", elements: { other: REPLACEMENT.elements.card! } });

      expect(mockSaveSpec).not.toHaveBeenCalled();
      expect(result.current.displayError).not.toBeNull();
      expect(result.current.displaySpec).toBe(BASE);
    });

    it("keeps the original spec on screen when the stream itself fails", () => {
      const { result, rerender } = setup();
      act(() => result.current.refineNode("card", "grid"));
      genStreamState = { ...genStreamState, spec: null, error: new Error("boom") };
      rerender();
      expect(result.current.displaySpec).toBe(BASE);
      expect(result.current.displayError?.message).toBe("boom");
    });

    it("retries a failed node refine as a node refine, not a whole-spec generate", () => {
      const { result, rerender } = setup();
      act(() => result.current.refineNode("card", "grid"));
      genStreamState = { ...genStreamState, spec: null, error: new Error("boom") };
      rerender();
      mockSend.mockClear();
      act(() => result.current.retry());
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0]?.[2]).toEqual({ target: { key: "card", type: "Stack" } });
    });

    it("a following whole-spec submit leaves node-refine state behind", async () => {
      const { result } = setup();
      act(() => result.current.refineNode("card", "grid"));
      await complete(REPLACEMENT);
      mockSaveSpec.mockClear();
      act(() => result.current.submit("something new"));
      await complete(BASE);
      expect(mockSaveSpec).toHaveBeenCalledWith(
        expect.objectContaining({ spec: BASE, kind: "generate" })
      );
    });

    it("does nothing for an unknown key", () => {
      const { result } = setup();
      act(() => result.current.refineNode("missing", "grid"));
      expect(mockSend).not.toHaveBeenCalled();
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

  describe("replay and entry kind", () => {
    it("replays a legacy-prefixed failed entry with the untagged prompt", () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", prompt: "Failed: draw a form" })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.replay("s1"));
      expect(mockSend).toHaveBeenCalledWith("draw a form");
    });

    it("replays a failed entry with the stored untagged prompt", () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", prompt: "draw a form", kind: "failed" })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.replay("s1"));
      expect(mockSend).toHaveBeenCalledWith("draw a form");
    });

    it("does not replay a refine entry (its parent spec is not stored)", () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", prompt: "make it blue", kind: "refine" })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.replay("s1"));
      expect(mockSend).not.toHaveBeenCalled();
    });

    describe("diff-backed refine entries", () => {
      const PARENT: Spec = {
        root: "root",
        elements: {
          root: { type: "Stack", props: {}, children: ["card"] },
          card: { type: "Stack", props: {}, children: [] },
        },
      };
      const AFTER: Spec = {
        root: "card",
        elements: { card: { type: "Grid", props: { columns: 3 }, children: [] } },
      };
      const REFINED: Spec = {
        root: "root",
        elements: { root: PARENT.elements.root!, card: AFTER.elements.card! },
      };
      const refinement = {
        parentId: "parent",
        path: "card",
        before: { root: "card", elements: { card: PARENT.elements.card! } },
        after: AFTER,
      };

      it("rebuilds the refined spec from the parent without a model call", () => {
        specsApiState = {
          specs: [
            makeStoredSpec({ id: "parent", spec: PARENT }),
            makeStoredSpec({ id: "child", kind: "refine", spec: REFINED, refinement }),
          ],
          isLoading: false,
        };
        const onNotice = vi.fn();
        const { result } = renderHook(() => usePlaygroundSession({ onNotice }));
        act(() => result.current.replay("child"));

        expect(mockSend).not.toHaveBeenCalled();
        expect(result.current.displaySpec).toEqual(REFINED);
        expect(onNotice).not.toHaveBeenCalled();
      });

      it("falls back to the entry's own spec and says so when the parent is gone", () => {
        specsApiState = {
          specs: [makeStoredSpec({ id: "child", kind: "refine", spec: REFINED, refinement })],
          isLoading: false,
        };
        const onNotice = vi.fn();
        const { result } = renderHook(() => usePlaygroundSession({ onNotice }));
        act(() => result.current.replay("child"));

        expect(mockSend).not.toHaveBeenCalled();
        expect(result.current.displaySpec).toEqual(REFINED);
        expect(onNotice).toHaveBeenCalledTimes(1);
      });
    });

    it("does not replay a legacy Refined:-prefixed entry", () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", prompt: "Refined: make it blue" })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.replay("s1"));
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("saves a refinement with kind refine and the untagged prompt", async () => {
      const currentSpec = { type: "Card", children: [] } as unknown as Spec;
      genStreamState = { ...genStreamState, spec: currentSpec };
      const { result } = renderHook(() => usePlaygroundSession());
      act(() => result.current.refine());
      act(() => result.current.submit("make it blue"));
      await act(async () => {
        capturedOnComplete?.(currentSpec, ["{}"]);
        await Promise.resolve();
      });
      expect(mockSaveSpec).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "make it blue", kind: "refine" })
      );
    });
  });

  describe("viewing a failed history entry", () => {
    it("sets displayError so JsonInspector shows a failure, not the generic empty state", () => {
      specsApiState = {
        specs: [makeStoredSpec({ id: "s1", prompt: "draw a form", kind: "failed", rawLines: [] })],
        isLoading: false,
      };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("s1"));

      expect(result.current.activeSpecId).toBe("s1");
      expect(result.current.displayRawLines).toEqual([]);
      expect(result.current.displayError).not.toBeNull();
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

    describe("catalog validation of full generations", () => {
      const completedSpec = { type: "Box", children: [] } as unknown as Spec;

      it("surfaces the validation message and does not select a saved entry", async () => {
        mockValidateSpec.mockReturnValue({ ok: false, message: "unknown type Nope" });
        genStreamState = { ...genStreamState, spec: completedSpec };
        const { result } = renderHook(() => usePlaygroundSession());
        act(() => result.current.submit("draw a form"));

        await act(async () => {
          capturedOnComplete?.(completedSpec, ["{line}"]);
          await Promise.resolve();
        });

        expect(mockValidateSpec).toHaveBeenCalledWith(completedSpec);
        expect(result.current.displayError?.message).toContain("unknown type Nope");
        // The rendered portion stays on screen next to the error affordance.
        expect(result.current.displaySpec).toBe(completedSpec);
        expect(result.current.activeSpecId).toBe(null);
        // Recorded as a failed attempt (not a success), like other generation failures.
        expect(mockSaveSpec).toHaveBeenCalledTimes(1);
        expect(mockSaveSpec.mock.calls[0]?.[0]).toMatchObject({
          prompt: "draw a form",
          kind: "failed",
        });
      });

      it("feeds the catalog-validation errors into Retry with error context", async () => {
        mockValidateSpec.mockReturnValue({ ok: false, message: "unknown type Nope" });
        const { result } = renderHook(() => usePlaygroundSession());
        act(() => result.current.submit("draw a form"));
        await act(async () => {
          capturedOnComplete?.(completedSpec, ["{line}"]);
          await Promise.resolve();
        });

        act(() => result.current.retry());

        expect(mockSend).toHaveBeenLastCalledWith(
          createErrorRecoveryPrompt(
            "draw a form",
            "The generated UI is not valid Rialto: unknown type Nope"
          )
        );
      });

      it("saves a valid generation exactly as before", async () => {
        const { result } = renderHook(() => usePlaygroundSession());
        act(() => result.current.submit("draw a form"));
        await act(async () => {
          capturedOnComplete?.(completedSpec, ["{line}"]);
          await Promise.resolve();
        });

        expect(result.current.displayError).toBeNull();
        expect(mockSaveSpec).toHaveBeenCalledWith({
          prompt: "draw a form",
          kind: "generate",
          spec: completedSpec,
          rawLines: ["{line}"],
        });
      });
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
        prompt: "draw a form",
        kind: "recover",
        spec: completedSpec,
        rawLines: ["{line}"],
      });
    });

    it("does not accumulate 'Recovered:' tags across repeated retries and keeps the model prompt clean", () => {
      const err = new Error("Invalid nested layout");
      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a form"));
      act(() => result.current.retry());
      act(() => result.current.retry());

      const expected = createErrorRecoveryPrompt("draw a form", "Invalid nested layout");
      expect(mockSend).toHaveBeenNthCalledWith(2, expected);
      expect(mockSend).toHaveBeenNthCalledWith(3, expected);
    });

    it("keeps refinement spec context when retrying a failed refine attempt with error context", () => {
      const currentSpec = { type: "Card", children: [] } as unknown as Spec;
      const err = new Error("Unknown component type");
      genStreamState = { ...genStreamState, spec: currentSpec, error: null, isStreaming: false };
      const { result, rerender } = renderHook(() => usePlaygroundSession());

      act(() => result.current.refine());
      act(() => result.current.submit("make it blue"));

      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      rerender();

      act(() => result.current.retry());

      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        createErrorRecoveryPrompt(
          createRefinementPrompt(currentSpec, "make it blue"),
          "Unknown component type"
        )
      );
    });

    it("resends the plain prompt without error context when the failure was a transport error", () => {
      const err = new Error("Request failed: Unauthorized");
      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a form"));
      act(() => result.current.retry());

      expect(mockSend).toHaveBeenNthCalledWith(2, "draw a form");
    });

    it("saves kind generate (not recover) after a transport-error retry", async () => {
      const err = new Error("Request failed: Unauthorized");
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
        kind: "generate",
        prompt: "draw a form",
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

    it("clears the underlying error/spec via useGenStream's clear(), so the empty state reappears", () => {
      const err = new Error("boom");
      genStreamState = { ...genStreamState, error: err, isStreaming: false };
      const { result } = renderHook(() => usePlaygroundSession());
      expect(result.current.displayError).toBe(err);

      act(() => result.current.reset());

      expect(mockClear).toHaveBeenCalledTimes(1);
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
      const entrySpec: Spec = {
        root: "card",
        elements: { card: { type: "Card", props: {}, children: [] } },
      };
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

    it("keeps a selected failed entry's error stable across rerenders", () => {
      // PromptBar re-seeds its textarea whenever the error identity changes, so
      // a fresh Error per render would wipe what the user is typing.
      specsApiState = { specs: [makeStoredSpec({ id: "f1", kind: "failed" })], isLoading: false };
      const { result, rerender } = renderHook(() => usePlaygroundSession());

      act(() => result.current.selectHistory("f1"));
      const first = result.current.displayError;
      rerender();

      expect(first?.message).toBe("This generation failed");
      expect(result.current.displayError).toBe(first);
    });

    it("does not offer the last typed prompt for a selected failed history entry", () => {
      specsApiState = { specs: [makeStoredSpec({ id: "f1", kind: "failed" })], isLoading: false };
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("unrelated live prompt"));
      act(() => result.current.selectHistory("f1"));

      expect(result.current.displayError).not.toBeNull();
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

    it("consumes the prompt param from the URL so reloads do not regenerate", async () => {
      window.history.pushState({}, "", "/?prompt=hello&keep=1");

      renderHook(() => usePlaygroundSession());
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(window.location.search).toBe("?keep=1");
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
        kind: "generate",
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
        prompt: "draw a broken form",
        kind: "failed",
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

    it("does not record a Failed: history row for a transport error", async () => {
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a form"));

      await act(async () => {
        capturedOnError?.(new Error("Request failed: Unauthorized"));
        await Promise.resolve();
      });

      expect(mockSaveSpec).not.toHaveBeenCalled();
    });

    it("catches a saveSpec rejection instead of leaving an unhandled promise rejection", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      mockSaveSpec.mockRejectedValueOnce(new Error("network down"));
      const { result } = renderHook(() => usePlaygroundSession());

      act(() => result.current.submit("draw a broken form"));

      await act(async () => {
        capturedOnError?.(new Error("Invalid nested layout"));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
