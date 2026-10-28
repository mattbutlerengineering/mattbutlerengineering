import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JsonInspector } from "./JsonInspector.js";

const mockDownloadJson = vi.fn();
vi.mock("../utils/downloadJson.js", () => ({
  downloadJson: (...args: unknown[]) => mockDownloadJson(...args),
}));

const mockCopy = vi.fn().mockResolvedValue(undefined);
vi.mock("../hooks/useCopyToClipboard.js", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: mockCopy }),
}));

vi.mock("./JsonInspector.module.css", () => ({
  default: {
    inspector: "inspector",
    toolbar: "toolbar",
    label: "label",
    searchGroup: "searchGroup",
    searchInput: "searchInput",
    matchCount: "matchCount",
    scrollArea: "scrollArea",
    empty: "empty",
    block: "block",
    collapseToggle: "collapseToggle",
    arrow: "arrow",
    collapsedRow: "collapsedRow",
    lineNumber: "lineNumber",
    pre: "pre",
    collapsedCode: "collapsedCode",
    ellipsis: "ellipsis",
    expandedBlock: "expandedBlock",
    lineRow: "lineRow",
    jsonKey: "jsonKey",
    jsonString: "jsonString",
    jsonBoolean: "jsonBoolean",
    jsonNull: "jsonNull",
    jsonNumber: "jsonNumber",
    searchMatch: "searchMatch",
  },
}));

describe("JsonInspector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should show 'No data yet' when rawLines is empty", () => {
    render(<JsonInspector rawLines={[]} isStreaming={false} />);
    expect(screen.getByText("No data yet")).toBeDefined();
  });

  it("shows a distinct loading state while streaming with no lines yet (#7463)", () => {
    render(<JsonInspector rawLines={[]} isStreaming={true} />);
    expect(screen.getByText("Generating…")).toBeDefined();
    expect(screen.queryByText("No data yet")).toBeNull();
  });

  it("shows a deliberate error state when generation failed with no lines (#7463)", () => {
    render(
      <JsonInspector rawLines={[]} isStreaming={false} error={new Error("Generation failed")} />
    );
    expect(screen.getByText("Couldn't generate JSON")).toBeDefined();
    expect(screen.queryByText("No data yet")).toBeNull();
  });

  it("should render JSON lines", () => {
    const rawLines = ['{"name": "test", "value": 123}'];
    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);
    expect(screen.getByText("JSON")).toBeDefined();
  });

  it("should show search input", () => {
    const rawLines = ['{"key": "value"}'];
    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);
    expect(screen.getByPlaceholderText("Search...")).toBeDefined();
  });

  it("should highlight matching search text", () => {
    const rawLines = ['{"name": "test"}'];
    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);
    const searchInput = screen.getByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "test" } });
    vi.advanceTimersByTime(300);
    expect(screen.getByText("test")).toBeDefined();
  });

  it("should have copy button", () => {
    const rawLines = ['{"key": "value"}'];
    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);
    expect(screen.getByText("Copy")).toBeDefined();
  });

  it("downloads the parsed lines as one JSON array for a multi-line spec", () => {
    const rawLines = ['{"op":"add","path":"/a"}', '{"op":"add","path":"/b"}'];
    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);
    fireEvent.click(screen.getByText("Download"));
    expect(mockDownloadJson).toHaveBeenCalledWith([
      { op: "add", path: "/a" },
      { op: "add", path: "/b" },
    ]);
  });

  it("copies the same single valid JSON document that Download exports", () => {
    const rawLines = ['{"op":"add","path":"/a"}', '{"op":"add","path":"/b"}'];
    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);
    fireEvent.click(screen.getByText("Copy"));
    const copied = mockCopy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(copied)).toEqual([
      { op: "add", path: "/a" },
      { op: "add", path: "/b" },
    ]);
  });

  it("keeps a non-JSON line as a string instead of throwing", () => {
    render(<JsonInspector rawLines={['{"a":1}', "not json"]} isStreaming={false} />);
    fireEvent.click(screen.getByText("Download"));
    expect(mockDownloadJson).toHaveBeenCalledWith([{ a: 1 }, "not json"]);
  });

  it("should have download button", () => {
    const rawLines = ['{"key": "value"}'];
    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);
    expect(screen.getByText("Download")).toBeDefined();
  });

  it("should have JSON label", () => {
    const rawLines = ['{"key": "value"}'];
    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);
    expect(screen.getByText("JSON")).toBeDefined();
  });

  it("should not re-highlight an unrelated block's lines when a different block's collapse is toggled", () => {
    const rawLines = ['{"markerZQX9": "unrelatedValue123"}', '{"toggleTarget": true}'];
    // Pretty-printed via JSON.stringify(..., null, 2): the second line of block 0.
    const unrelatedLine = '  "markerZQX9": "unrelatedValue123"';
    const execSpy = vi.spyOn(RegExp.prototype, "exec");

    render(<JsonInspector rawLines={rawLines} isStreaming={false} />);

    const countExecCallsForUnrelatedLine = () =>
      execSpy.mock.calls.filter((args) => args[0] === unrelatedLine).length;

    const baseline = countExecCallsForUnrelatedLine();
    expect(baseline).toBeGreaterThan(0);

    // Toggle the SECOND block's collapse state — the first (unrelated) block's
    // props/content are unchanged, so its lines should not be re-highlighted.
    const toggleButtons = screen.getAllByLabelText("Collapse block");
    const secondBlockToggle = toggleButtons[1];
    if (!secondBlockToggle) throw new Error("expected two collapse toggle buttons");
    fireEvent.click(secondBlockToggle);

    expect(countExecCallsForUnrelatedLine()).toBe(baseline);

    execSpy.mockRestore();
  });
});
