import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Spec } from "@json-render/react";
import { PreviewPane } from "./PreviewPane.js";

vi.mock("@json-render/react", () => ({
  JSONUIProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="json-ui-provider">{children}</div>
  ),
  Renderer: ({
    spec,
    registry,
  }: {
    spec: {
      root: string;
      elements: Record<string, { type: string; children?: string[] }>;
    } | null;
    registry: Record<string, (props: { element: unknown; children?: unknown }) => unknown>;
  }) => {
    // Renders the tree through the registry so wrappers around entries are exercised.
    const renderKey = (key: string): React.ReactNode => {
      const element = spec!.elements[key]!;
      const Component = registry[element.type] as React.ComponentType<{
        element: unknown;
        children?: React.ReactNode;
      }>;
      const kids = element.children?.map((child) => <span key={child}>{renderKey(child)}</span>);
      // Copy like json-render does when props hold expressions: identity must not be relied on.
      return Component ? <Component element={{ ...element }}>{kids}</Component> : kids;
    };
    return <div data-testid="renderer">{spec ? renderKey(spec.root) : null}</div>;
  },
}));

vi.mock("@mbe/rialto-catalog", () => ({
  materializeCatalogProps: (_name: string, props: unknown) => props,
  registry: {
    Box: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Text: () => <p>text node</p>,
    Button: () => <button type="button">button node</button>,
  },
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-pressed"?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-pressed={rest["aria-pressed"]}>
      {children}
    </button>
  ),
  Divider: () => <hr />,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SegmentedControl: ({
    segments,
    onChange,
  }: {
    segments: Array<{ id: string; label: string }>;
    value: string;
    onChange?: (id: string) => void;
  }) => (
    <div data-testid="segmented-control">
      {segments?.map((s) => (
        <button key={s.id} onClick={() => onChange?.(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("./PreviewPane.module.css", () => ({
  default: {
    pane: "pane",
    actionBar: "actionBar",
    actionBarEnd: "actionBarEnd",
    viewportBar: "viewportBar",
    errorState: "errorState",
    loadingState: "loadingState",
    pulse: "pulse",
    welcomeState: "welcomeState",
    welcomeContent: "welcomeContent",
    welcomeHeading: "welcomeHeading",
    welcomeSubtitle: "welcomeSubtitle",
    suggestionsGrid: "suggestionsGrid",
    suggestionCard: "suggestionCard",
    suggestionIcon: "suggestionIcon",
    suggestionTitle: "suggestionTitle",
    suggestionDescription: "suggestionDescription",
    rendererWrapper: "rendererWrapper",
    viewportFrame: "viewportFrame",
    specStats: "specStats",
    fullscreenToggle: "fullscreenToggle",
    selectable: "selectable",
  },
}));

const defaultProps = {
  spec: null,
  isStreaming: false,
  error: null,
  onRetry: vi.fn(),
  activeSpecId: null,
  onShare: vi.fn(),
  onRefine: vi.fn(),
  isRefinementMode: false,
};

const FLAT_SPEC: Spec = {
  root: "box",
  elements: {
    box: { type: "Box", props: {}, children: ["text", "button"] },
    text: { type: "Text", props: {}, children: [] },
    button: { type: "Button", props: {}, children: [] },
  },
};

describe("PreviewPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("fullscreen Escape exits fullscreen and claims the keypress before other Esc listeners", () => {
    const onToggleFullscreen = vi.fn();
    render(<PreviewPane {...defaultProps} isFullscreen onToggleFullscreen={onToggleFullscreen} />);
    // Registered later, so bubbles after PreviewPane's listener (like the global shortcuts hook).
    let seenPrevented = false;
    const later = (e: KeyboardEvent) => {
      seenPrevented = e.defaultPrevented;
    };
    document.addEventListener("keydown", later);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
    document.removeEventListener("keydown", later);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    expect(seenPrevented).toBe(true);
  });

  it("renders viewport controls when spec is provided", () => {
    const spec = FLAT_SPEC;
    render(<PreviewPane {...defaultProps} spec={spec} />);
    expect(screen.getByTestId("segmented-control")).toBeDefined();
    expect(screen.getByText("Desktop")).toBeDefined();
    expect(screen.getByText("Tablet")).toBeDefined();
    expect(screen.getByText("Mobile")).toBeDefined();
  });

  it("renders empty state when spec is null and not streaming", () => {
    render(<PreviewPane {...defaultProps} />);
    expect(screen.getByText("What would you like to build?")).toBeDefined();
    expect(
      screen.getByText("Describe a UI component or layout and watch it come to life")
    ).toBeDefined();
  });

  it("says so when a spec renders no visible leaves", () => {
    const spec: Spec = {
      root: "column",
      elements: {
        column: { type: "Stack", props: { direction: "column" }, children: ["grid"] },
        grid: { type: "Stack", props: { direction: "row" }, children: [] },
      },
    };
    render(<PreviewPane {...defaultProps} spec={spec} />);
    expect(screen.getByRole("status").textContent).toMatch(/nothing visible/i);
    expect(screen.queryByTestId("renderer")).toBeNull();
  });

  it("renders suggestion cards in empty state", () => {
    render(<PreviewPane {...defaultProps} />);
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Form")).toBeDefined();
    expect(screen.getByText("E-commerce")).toBeDefined();
  });

  it("calls onSuggestionClick when a suggestion card is clicked", () => {
    const onSuggestionClick = vi.fn();
    render(<PreviewPane {...defaultProps} onSuggestionClick={onSuggestionClick} />);
    fireEvent.click(screen.getByText("Dashboard"));
    expect(onSuggestionClick).toHaveBeenCalledWith(
      "Analytics dashboard with KPI stats and a BarChart of monthly revenue (Jan through Jun), not a paragraph of numbers"
    );
  });

  it("shows loading pulse when streaming with no spec", () => {
    render(<PreviewPane {...defaultProps} isStreaming={true} spec={null} />);
    const pulse = screen.getByRole("status");
    expect(pulse).toBeDefined();
    expect(pulse.getAttribute("aria-label")).toBe("Generating…");
  });

  it("shows error alert when error is provided", () => {
    const error = new Error("Something went wrong");
    render(<PreviewPane {...defaultProps} error={error} />);
    expect(screen.getByTestId("alert")).toBeDefined();
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("keeps rendering the spec next to the error alert", () => {
    render(<PreviewPane {...defaultProps} spec={FLAT_SPEC} error={new Error("Not valid")} />);
    expect(screen.getByText("Not valid")).toBeDefined();
    expect(screen.getByText("Retry with error context")).toBeDefined();
    expect(document.querySelector(".rendererWrapper")).not.toBeNull();
  });

  it("calls onRetry when the retry-with-error-context button is clicked", () => {
    const onRetry = vi.fn();
    const error = new Error("Failed");
    render(<PreviewPane {...defaultProps} error={error} onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry with error context"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders spec stats when spec is provided and activeSpecId is set", () => {
    const spec = FLAT_SPEC;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" />);
    expect(screen.getByText(/3 elements/)).toBeDefined();
  });

  it("shows Share and Refine buttons when activeSpecId is set and not streaming", () => {
    const spec = FLAT_SPEC;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" />);
    expect(screen.getByText("Share")).toBeDefined();
    expect(screen.getByText("Refine")).toBeDefined();
  });

  it("shows Refining text when isRefinementMode is true", () => {
    const spec = FLAT_SPEC;
    render(
      <PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" isRefinementMode={true} />
    );
    expect(screen.getByText("Refining...")).toBeDefined();
  });

  it("calls onRefine when Refine button is clicked", () => {
    const onRefine = vi.fn();
    const spec = FLAT_SPEC;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" onRefine={onRefine} />);
    fireEvent.click(screen.getByText("Refine"));
    expect(onRefine).toHaveBeenCalledTimes(1);
  });

  it("calls clipboard API when Copy JSON button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const spec = FLAT_SPEC;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" />);
    fireEvent.click(screen.getByText("Copy JSON"));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(spec, null, 2));
  });

  it("shows viewport segmented control when streaming", () => {
    render(<PreviewPane {...defaultProps} isStreaming={true} spec={null} />);
    expect(screen.getByTestId("segmented-control")).toBeDefined();
  });

  it("does not show action bar when activeSpecId is null", () => {
    const spec = FLAT_SPEC;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId={null} />);
    expect(screen.queryByText("Share")).toBeNull();
    expect(screen.queryByText("Refine")).toBeNull();
  });

  it("shows Expand button when onToggleFullscreen is provided and spec is present", () => {
    const spec = FLAT_SPEC;
    const onToggleFullscreen = vi.fn();
    render(
      <PreviewPane
        {...defaultProps}
        spec={spec}
        activeSpecId={null}
        onToggleFullscreen={onToggleFullscreen}
      />
    );
    expect(screen.getByText("Expand")).toBeDefined();
  });

  it("calls onToggleFullscreen when Expand button is clicked", () => {
    const spec = FLAT_SPEC;
    const onToggleFullscreen = vi.fn();
    render(
      <PreviewPane
        {...defaultProps}
        spec={spec}
        activeSpecId={null}
        onToggleFullscreen={onToggleFullscreen}
      />
    );
    fireEvent.click(screen.getByText("Expand"));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("renders Renderer when spec is provided", () => {
    const spec = FLAT_SPEC;
    render(<PreviewPane {...defaultProps} spec={spec} />);
    expect(screen.getByTestId("renderer")).toBeDefined();
  });

  it("renders JSONUIProvider wrapper", () => {
    render(<PreviewPane {...defaultProps} />);
    expect(screen.getByTestId("json-ui-provider")).toBeDefined();
  });

  it("shows Collapse button text when isFullscreen is true", () => {
    const spec = FLAT_SPEC;
    const onToggleFullscreen = vi.fn();
    render(
      <PreviewPane
        {...defaultProps}
        spec={spec}
        activeSpecId={null}
        isFullscreen={true}
        onToggleFullscreen={onToggleFullscreen}
      />
    );
    expect(screen.getByText("Collapse")).toBeDefined();
  });

  describe("select mode", () => {
    function renderSelectable(extra: Partial<React.ComponentProps<typeof PreviewPane>> = {}) {
      const onSelectNode = vi.fn();
      const utils = render(
        <PreviewPane {...defaultProps} spec={FLAT_SPEC} onSelectNode={onSelectNode} {...extra} />
      );
      return { onSelectNode, ...utils };
    }

    it("renders no data-gen-node attributes until select mode is on", () => {
      const { container } = renderSelectable();
      expect(container.querySelectorAll("[data-gen-node]")).toHaveLength(0);
      expect(screen.queryByRole("group", { name: "Select component" })).toBeNull();
    });

    it("tags every rendered element with its spec key in select mode", () => {
      const { container } = renderSelectable();
      fireEvent.click(screen.getByRole("button", { name: "Select component" }));
      const keys = Array.from(container.querySelectorAll("[data-gen-node]")).map(
        (node) => (node as HTMLElement).dataset.genNode
      );
      expect(keys.sort()).toEqual(["box", "button", "text"]);
    });

    it("tags leaves that share a type even when json-render copies the element", () => {
      const spec: Spec = {
        root: "box",
        elements: {
          box: { type: "Box", props: {}, children: ["a", "b"] },
          a: { type: "Text", props: { text: { $state: "/x" } } },
          b: { type: "Text", props: { text: { $state: "/y" } } },
        },
      };
      const { container } = renderSelectable({ spec });
      fireEvent.click(screen.getByRole("button", { name: "Select component" }));
      const keys = Array.from(container.querySelectorAll("[data-gen-node]")).map(
        (node) => (node as HTMLElement).dataset.genNode
      );
      expect(keys.sort()).toEqual(["a", "b", "box"]);
    });

    it("selects the innermost node on click without triggering the component", () => {
      const { onSelectNode } = renderSelectable();
      fireEvent.click(screen.getByRole("button", { name: "Select component" }));
      fireEvent.click(screen.getByText("button node"));
      expect(onSelectNode).toHaveBeenCalledWith("button");
    });

    it("moves with arrows, selects with Enter and clears with Escape", () => {
      const { onSelectNode, rerender } = renderSelectable();
      fireEvent.click(screen.getByRole("button", { name: "Select component" }));
      const overlay = screen.getByRole("group", { name: "Select component" });
      fireEvent.keyDown(overlay, { key: "ArrowDown" });
      fireEvent.keyDown(overlay, { key: "ArrowDown" });
      fireEvent.keyDown(overlay, { key: "Enter" });
      expect(onSelectNode).toHaveBeenLastCalledWith("text");
      rerender(
        <PreviewPane
          {...defaultProps}
          spec={FLAT_SPEC}
          onSelectNode={onSelectNode}
          selectedKey="text"
        />
      );
      fireEvent.keyDown(screen.getByRole("group", { name: "Select component" }), {
        key: "Escape",
      });
      expect(onSelectNode).toHaveBeenLastCalledWith(null);
    });

    it("marks the selected node", () => {
      const { container } = renderSelectable({ selectedKey: "button" });
      fireEvent.click(screen.getByRole("button", { name: "Select component" }));
      const selected = container.querySelectorAll("[data-selected='true']");
      expect(selected).toHaveLength(1);
      expect((selected[0] as HTMLElement).dataset.genNode).toBe("button");
    });

    it("is disabled while streaming", () => {
      const { container } = renderSelectable({ isStreaming: true });
      const toggle = screen.getByRole("button", { name: "Select component" }) as HTMLButtonElement;
      expect(toggle.disabled).toBe(true);
      expect(container.querySelectorAll("[data-gen-node]")).toHaveLength(0);
    });
  });
});
