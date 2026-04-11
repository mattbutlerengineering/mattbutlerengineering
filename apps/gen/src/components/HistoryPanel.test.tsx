import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HistoryPanel } from "./HistoryPanel.js";
import type { StoredSpec } from "../types.js";

vi.mock("./HistoryPanel.module.css", () => ({
  default: {
    panel: "panel",
    filterBar: "filterBar",
    filterTab: "filterTab",
    filterTabActive: "filterTabActive",
    searchBar: "searchBar",
    searchInput: "searchInput",
    searchClear: "searchClear",
    entryCount: "entryCount",
    empty: "empty",
    list: "list",
    listItem: "listItem",
    listItemFocused: "listItemFocused",
    item: "item",
    itemActive: "itemActive",
    itemPrompt: "itemPrompt",
    itemMeta: "itemMeta",
    itemTime: "itemTime",
    metaDot: "metaDot",
    refinedTag: "refinedTag",
    metaStar: "metaStar",
    deleteConfirm: "deleteConfirm",
    deleteConfirmLabel: "deleteConfirmLabel",
    deleteConfirmYes: "deleteConfirmYes",
    deleteConfirmNo: "deleteConfirmNo",
    itemActions: "itemActions",
    itemActionsHasFavorite: "itemActionsHasFavorite",
    starButton: "starButton",
    starButtonActive: "starButtonActive",
    replayButton: "replayButton",
    deleteButton: "deleteButton",
  },
}));

const createMockEntry = (overrides: Partial<StoredSpec> = {}): StoredSpec => ({
  id: "spec-1",
  prompt: "Generate a test spec",
  isFavorite: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("HistoryPanel", () => {
  const defaultProps = {
    entries: [] as StoredSpec[],
    activeId: null as string | null,
    filter: "all" as const,
    isLoading: false,
    onSelect: vi.fn(),
    onReplay: vi.fn(),
    onToggleFavorite: vi.fn(),
    onDelete: vi.fn(),
    onFilterChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show loading message when loading and empty", () => {
    render(<HistoryPanel {...defaultProps} isLoading={true} entries={[]} />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("should show 'No history yet' when empty and not loading", () => {
    render(<HistoryPanel {...defaultProps} />);
    expect(screen.getByText("No history yet")).toBeDefined();
  });

  it("should show 'No favorites yet' when filter is favorites and empty", () => {
    render(<HistoryPanel {...defaultProps} filter="favorites" />);
    expect(screen.getByText("No favorites yet")).toBeDefined();
  });

  it("should show search input", () => {
    const entries = [createMockEntry()];
    render(<HistoryPanel {...defaultProps} entries={entries} />);
    expect(screen.getByPlaceholderText("Search prompts...")).toBeDefined();
  });

  it("should show entry count", () => {
    const entries = [createMockEntry({ id: "1" }), createMockEntry({ id: "2" })];
    render(<HistoryPanel {...defaultProps} entries={entries} />);
    expect(screen.getByText("2 specs")).toBeDefined();
  });

  it("should show entry count with filter", () => {
    const entries = [
      createMockEntry({ id: "1", isFavorite: true }),
      createMockEntry({ id: "2", isFavorite: false }),
    ];
    render(<HistoryPanel {...defaultProps} entries={entries} filter="favorites" />);
    expect(screen.getByText("1 of 2 specs")).toBeDefined();
  });

  it("should render entries with prompt text", () => {
    const entries = [createMockEntry({ prompt: "My test prompt" })];
    render(<HistoryPanel {...defaultProps} entries={entries} />);
    expect(screen.getByText(/my test prompt/i)).toBeDefined();
  });

  it("should call onSelect when entry is clicked", () => {
    const onSelect = vi.fn();
    const entries = [createMockEntry({ id: "spec-1" })];
    render(<HistoryPanel {...defaultProps} entries={entries} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(/generate a test spec/i));
    expect(onSelect).toHaveBeenCalledWith("spec-1");
  });

  it("should call onToggleFavorite when star is clicked", () => {
    const onToggleFavorite = vi.fn();
    const entries = [createMockEntry({ id: "spec-1", isFavorite: false })];
    render(
      <HistoryPanel
        {...defaultProps}
        entries={entries}
        onToggleFavorite={onToggleFavorite}
      />
    );
    fireEvent.click(screen.getByLabelText("Favorite"));
    expect(onToggleFavorite).toHaveBeenCalledWith("spec-1");
  });

  it("should call onReplay when replay button is clicked", () => {
    const onReplay = vi.fn();
    const entries = [createMockEntry({ id: "spec-1" })];
    render(<HistoryPanel {...defaultProps} entries={entries} onReplay={onReplay} />);
    fireEvent.click(screen.getByRole("button", { name: /replay/i }));
    expect(onReplay).toHaveBeenCalledWith("spec-1");
  });

  it("should show delete confirmation when delete is clicked", () => {
    const onDelete = vi.fn();
    const entries = [createMockEntry({ id: "spec-1" })];
    render(<HistoryPanel {...defaultProps} entries={entries} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.getByText("Delete?")).toBeDefined();
  });

  it("should call onDelete when delete is confirmed", async () => {
    const onDelete = vi.fn();
    const entries = [createMockEntry({ id: "spec-1" })];
    render(<HistoryPanel {...defaultProps} entries={entries} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
    expect(onDelete).toHaveBeenCalledWith("spec-1");
  });

  it("should cancel delete when cancel is clicked", () => {
    const onDelete = vi.fn();
    const entries = [createMockEntry({ id: "spec-1" })];
    render(<HistoryPanel {...defaultProps} entries={entries} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel delete/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("should filter entries by search term", () => {
    const entries = [
      createMockEntry({ id: "1", prompt: "First prompt" }),
      createMockEntry({ id: "2", prompt: "Second prompt" }),
    ];
    render(<HistoryPanel {...defaultProps} entries={entries} />);
    
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "first" } });
    
    expect(screen.getByText(/first prompt/i)).toBeDefined();
    expect(screen.queryByText(/second prompt/i)).toBeNull();
  });

  it("should show 'No matching prompts' when search has no results", () => {
    const entries = [createMockEntry({ prompt: "First prompt" })];
    render(<HistoryPanel {...defaultProps} entries={entries} />);
    
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });
    
    expect(screen.getByText("No matching prompts")).toBeDefined();
  });

  it("should call onFilterChange when filter tab is clicked", () => {
    const onFilterChange = vi.fn();
    render(<HistoryPanel {...defaultProps} onFilterChange={onFilterChange} />);
    
    fireEvent.click(screen.getByText("Favorites"));
    expect(onFilterChange).toHaveBeenCalledWith("favorites");
  });

  it("should display favorite star for favorited entries", () => {
    const entries = [createMockEntry({ id: "spec-1", isFavorite: true })];
    render(<HistoryPanel {...defaultProps} entries={entries} />);
    const starButton = screen.getByRole("button", { name: /unfavorite/i });
    expect(starButton).toBeDefined();
  });

  it("should show 'Refined' tag for refined prompts", () => {
    const entries = [createMockEntry({ prompt: "Refined: Generate a spec" })];
    render(<HistoryPanel {...defaultProps} entries={entries} />);
    expect(screen.getByText("Refined")).toBeDefined();
  });
});