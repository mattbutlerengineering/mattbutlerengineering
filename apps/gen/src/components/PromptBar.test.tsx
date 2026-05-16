/* eslint-disable mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptBar } from "./PromptBar.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  ),
}));

vi.mock("./PromptBar.module.css", () => ({
  default: {
    bar: "bar",
    inputRow: "inputRow",
    inputWrapper: "inputWrapper",
    input: "input",
    charCount: "charCount",
    charCountWarn: "charCountWarn",
    hints: "hints",
  },
}));

describe("PromptBar", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    isStreaming: false,
    disabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the textarea prompt input", () => {
    render(<PromptBar {...defaultProps} />);
    expect(screen.getByRole("textbox", { name: /prompt input/i })).toBeDefined();
  });

  it("renders the Generate button when not streaming", () => {
    render(<PromptBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /generate/i })).toBeDefined();
  });

  it("renders Stop button when isStreaming is true", () => {
    render(<PromptBar {...defaultProps} isStreaming={true} />);
    expect(screen.getByRole("button", { name: /stop/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
  });

  it("calls onStop when Stop button is clicked", () => {
    const onStop = vi.fn();
    render(<PromptBar {...defaultProps} isStreaming={true} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit with trimmed prompt text when Generate is clicked", () => {
    const onSubmit = vi.fn();
    render(<PromptBar {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });
    fireEvent.change(textarea, { target: { value: "  Build a dashboard  " } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(onSubmit).toHaveBeenCalledWith("Build a dashboard");
  });

  it("does not call onSubmit when input is empty", () => {
    const onSubmit = vi.fn();
    render(<PromptBar {...defaultProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears input after submit", () => {
    const onSubmit = vi.fn();
    render(<PromptBar {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });
    fireEvent.change(textarea, { target: { value: "Build a form" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("disables the textarea when disabled prop is true", () => {
    render(<PromptBar {...defaultProps} disabled={true} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });
    expect((textarea as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("shows character count", () => {
    render(<PromptBar {...defaultProps} />);
    expect(screen.getByText("0 / 2000")).toBeDefined();
  });

  it("updates character count as user types", () => {
    render(<PromptBar {...defaultProps} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });
    fireEvent.change(textarea, { target: { value: "Hello" } });
    expect(screen.getByText("5 / 2000")).toBeDefined();
  });

  it("submits on Enter key press", () => {
    const onSubmit = vi.fn();
    render(<PromptBar {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });
    fireEvent.change(textarea, { target: { value: "Build a chart" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("Build a chart");
  });

  it("does not submit on Shift+Enter", () => {
    const onSubmit = vi.fn();
    render(<PromptBar {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });
    fireEvent.change(textarea, { target: { value: "Build a chart" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit on Enter when isStreaming is true", () => {
    const onSubmit = vi.fn();
    render(<PromptBar {...defaultProps} onSubmit={onSubmit} isStreaming={true} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });
    fireEvent.change(textarea, { target: { value: "Build something" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows Refine button label in refine mode", () => {
    render(<PromptBar {...defaultProps} mode="refine" />);
    expect(screen.getByRole("button", { name: /refine/i })).toBeDefined();
  });

  it("shows placeholder for refine mode", () => {
    render(<PromptBar {...defaultProps} mode="refine" />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });
    expect((textarea as HTMLTextAreaElement).placeholder).toBe("Refine this UI...");
  });

  it("shows New button in refine mode when onExitRefinement is provided", () => {
    const onExitRefinement = vi.fn();
    render(<PromptBar {...defaultProps} mode="refine" onExitRefinement={onExitRefinement} />);
    expect(screen.getByRole("button", { name: /new/i })).toBeDefined();
  });

  it("calls onExitRefinement when New button is clicked", () => {
    const onExitRefinement = vi.fn();
    render(<PromptBar {...defaultProps} mode="refine" onExitRefinement={onExitRefinement} />);
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    expect(onExitRefinement).toHaveBeenCalledTimes(1);
  });

  it("recalls previous prompt with ArrowUp when input is empty", () => {
    const onSubmit = vi.fn();
    render(<PromptBar {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });

    // Submit a prompt to build history
    fireEvent.change(textarea, { target: { value: "First prompt" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // Input is now cleared; press ArrowUp to recall
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect((textarea as HTMLTextAreaElement).value).toBe("First prompt");
  });

  it("navigates history down to clear with ArrowDown", () => {
    const onSubmit = vi.fn();
    render(<PromptBar {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox", { name: /prompt input/i });

    // Build history
    fireEvent.change(textarea, { target: { value: "First prompt" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // Navigate up then back down
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });
});
