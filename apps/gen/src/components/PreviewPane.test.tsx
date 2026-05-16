/* eslint-disable mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Spec } from "@json-render/react";
import { PreviewPane } from "./PreviewPane.js";

vi.mock("@json-render/react", () => ({
  JSONUIProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="json-ui-provider">{children}</div>
  ),
  Renderer: ({ spec }: { spec: unknown }) => (
    <div data-testid="renderer">{JSON.stringify(spec)}</div>
  ),
}));

vi.mock("@mbe/rialto-catalog", () => ({
  registry: {},
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert">{children}</div>
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
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

describe("PreviewPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders viewport controls when spec is provided", () => {
    const spec = { type: "Box", children: [] } as unknown as Spec;
    render(<PreviewPane {...defaultProps} spec={spec} />);
    expect(screen.getByTestId("segmented-control")).toBeDefined();
    expect(screen.getByText("Desktop")).toBeDefined();
    expect(screen.getByText("Tablet")).toBeDefined();
    expect(screen.getByText("Mobile")).toBeDefined();
  });

  it("renders empty state when spec is null and not streaming", () => {
    render(<PreviewPane {...defaultProps} />);
    expect(screen.getByText("What would you like to build?")).toBeDefined();
    expect(screen.getByText("Describe a UI component or layout and watch it come to life")).toBeDefined();
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
    expect(onSuggestionClick).toHaveBeenCalledWith("Analytics dashboard with charts and KPIs");
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

  it("calls onRetry when Try again button is clicked", () => {
    const onRetry = vi.fn();
    const error = new Error("Failed");
    render(<PreviewPane {...defaultProps} error={error} onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders spec stats when spec is provided and activeSpecId is set", () => {
    const spec = {
      type: "Box",
      children: [{ type: "Text" }, { type: "Button" }],
    } as unknown as Spec;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" />);
    expect(screen.getByText(/3 elements/)).toBeDefined();
  });

  it("shows Share and Refine buttons when activeSpecId is set and not streaming", () => {
    const spec = { type: "Box" } as unknown as Spec;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" />);
    expect(screen.getByText("Share")).toBeDefined();
    expect(screen.getByText("Refine")).toBeDefined();
  });

  it("shows Refining text when isRefinementMode is true", () => {
    const spec = { type: "Box" } as unknown as Spec;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" isRefinementMode={true} />);
    expect(screen.getByText("Refining...")).toBeDefined();
  });

  it("calls onRefine when Refine button is clicked", () => {
    const onRefine = vi.fn();
    const spec = { type: "Box" } as unknown as Spec;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" onRefine={onRefine} />);
    fireEvent.click(screen.getByText("Refine"));
    expect(onRefine).toHaveBeenCalledTimes(1);
  });

  it("calls clipboard API when Copy JSON button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const spec = { type: "Box" } as unknown as Spec;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId="spec-1" />);
    fireEvent.click(screen.getByText("Copy JSON"));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(spec, null, 2));
  });

  it("shows viewport segmented control when streaming", () => {
    render(<PreviewPane {...defaultProps} isStreaming={true} spec={null} />);
    expect(screen.getByTestId("segmented-control")).toBeDefined();
  });

  it("does not show action bar when activeSpecId is null", () => {
    const spec = { type: "Box" } as unknown as Spec;
    render(<PreviewPane {...defaultProps} spec={spec} activeSpecId={null} />);
    expect(screen.queryByText("Share")).toBeNull();
    expect(screen.queryByText("Refine")).toBeNull();
  });

  it("shows Expand button when onToggleFullscreen is provided and spec is present", () => {
    const spec = { type: "Box" } as unknown as Spec;
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
    const spec = { type: "Box" } as unknown as Spec;
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
    const spec = { type: "Box" } as unknown as Spec;
    render(<PreviewPane {...defaultProps} spec={spec} />);
    expect(screen.getByTestId("renderer")).toBeDefined();
  });

  it("renders JSONUIProvider wrapper", () => {
    render(<PreviewPane {...defaultProps} />);
    expect(screen.getByTestId("json-ui-provider")).toBeDefined();
  });

  it("shows Collapse button text when isFullscreen is true", () => {
    const spec = { type: "Box" } as unknown as Spec;
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
});
