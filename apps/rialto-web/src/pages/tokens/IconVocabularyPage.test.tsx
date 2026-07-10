import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IconVocabularyPage } from "./IconVocabularyPage.js";
import { ICON_CATEGORY_GUIDANCE } from "./token-catalog.js";

// Icons are a design-system vocabulary, not CSS custom properties, so the page
// reads the live set from rialto rather than the live cascade. The mock supplies
// a representative subset keyed by the real category names so the local guidance
// map resolves; rialto owns the exhaustive list (tested in its own suite).
// `vi.hoisted` shares the fixture with the hoisted `vi.mock` factory below.
const fixture = vi.hoisted(() => {
  const FakeIcon = ({
    "aria-hidden": ariaHidden,
  }: {
    "aria-hidden"?: boolean | "true" | "false";
  }) => <svg data-testid="lucide-icon" aria-hidden={ariaHidden} />;
  const vocabulary = [
    { concept: "home", label: "Home", icon: FakeIcon, category: "navigation" },
    { concept: "search", label: "Search", icon: FakeIcon, category: "navigation" },
    { concept: "save", label: "Save", icon: FakeIcon, category: "actions" },
    { concept: "success", label: "Success", icon: FakeIcon, category: "status" },
  ];
  return { vocabulary };
});

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, as: As = "span" }: { children?: React.ReactNode; as?: React.ElementType }) => (
    <As>{children}</As>
  ),
  Divider: () => <hr />,
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  iconVocabulary: fixture.vocabulary,
  iconCategories: ["navigation", "actions", "status"],
  getIconsByCategory: (category: string) =>
    fixture.vocabulary.filter((entry) => entry.category === category),
}));

describe("IconVocabularyPage", () => {
  it("renders the page title", () => {
    render(<IconVocabularyPage />);
    expect(screen.getByRole("heading", { name: "Icon Vocabulary" })).toBeInTheDocument();
  });

  it("renders a section heading per icon category using the guidance label", () => {
    render(<IconVocabularyPage />);
    expect(
      screen.getByRole("heading", { name: ICON_CATEGORY_GUIDANCE.navigation!.label })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: ICON_CATEGORY_GUIDANCE.actions!.label })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: ICON_CATEGORY_GUIDANCE.status!.label })
    ).toBeInTheDocument();
  });

  it("shows the semantic usage guidance for each category", () => {
    render(<IconVocabularyPage />);
    expect(screen.getByText(ICON_CATEGORY_GUIDANCE.status!.description)).toBeInTheDocument();
  });

  it("renders one entry per icon in the vocabulary", () => {
    render(<IconVocabularyPage />);
    expect(screen.getAllByTestId("icon-entry")).toHaveLength(fixture.vocabulary.length);
    expect(screen.getAllByTestId("lucide-icon")).toHaveLength(fixture.vocabulary.length);
  });

  it("labels each icon with its concept name and human label", () => {
    render(<IconVocabularyPage />);
    expect(screen.getByText("save")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });
});
