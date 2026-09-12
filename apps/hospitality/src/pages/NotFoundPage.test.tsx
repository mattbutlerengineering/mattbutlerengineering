import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { NotFoundPage } from "./NotFoundPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children, level }: { children: React.ReactNode; level: number }) => {
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return <Tag>{children}</Tag>;
  },
  Text: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

function renderNotFoundPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>
  );
}

describe("NotFoundPage", () => {
  it("renders the 404 heading", () => {
    renderNotFoundPage();
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
  });

  it("renders a message in the hospitality voice", () => {
    renderNotFoundPage();
    expect(screen.getByText(/This table's not on tonight's floor plan\./i)).toBeInTheDocument();
  });

  it("renders a link back to tonight's service pointing at /timeline", () => {
    renderNotFoundPage();
    const backLink = screen.getByText("Back to tonight's service");
    const anchor = backLink.closest("a");
    expect(anchor).toHaveAttribute("href", "/timeline");
  });
});
