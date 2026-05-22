import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JsonInspector } from "./JsonInspector.js";

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
});
