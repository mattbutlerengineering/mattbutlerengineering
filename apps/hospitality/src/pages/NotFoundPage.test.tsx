import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { NotFoundPage } from "./NotFoundPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children, as }: { children: React.ReactNode; as?: string }) => {
    return as === "h1" ? <h1>{children}</h1> : <p>{children}</p>;
  },
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

  describe("guest variant (#9990)", () => {
    it("says the page was not found and links home, with no staff wording", () => {
      render(
        <MemoryRouter>
          <NotFoundPage guest />
        </MemoryRouter>
      );
      expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
        "href",
        "/"
      );
      expect(screen.queryByText(/tonight's service/i)).toBeNull();
    });

    it("titles the tab as a missing page", () => {
      render(
        <MemoryRouter>
          <NotFoundPage guest />
        </MemoryRouter>
      );
      expect(document.title).toBe("Page not found - Matt Butler Engineering");
    });
  });
});
