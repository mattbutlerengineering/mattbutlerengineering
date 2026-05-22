/* eslint-disable @typescript-eslint/no-explicit-any, mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotFoundPage } from "./NotFoundPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children, level }: any) => {
    const Tag = `h${level}` as any;
    return <Tag>{children}</Tag>;
  },
  Text: ({ children }: any) => <p>{children}</p>,
  Button: ({ children }: any) => <button>{children}</button>,
  Stack: ({ children }: any) => <div>{children}</div>,
}));

function renderNotFoundPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>
  );
}

describe("NotFoundPage", () => {
  const originalTitle = document.title;

  beforeEach(() => {
    document.title = originalTitle;
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it("renders the 404 heading", () => {
    renderNotFoundPage();
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
  });

  it("renders the explanatory message", () => {
    renderNotFoundPage();
    expect(screen.getByText(/This page doesn.*t exist/i)).toBeInTheDocument();
  });

  it("renders a Back to home link pointing to /", () => {
    renderNotFoundPage();
    const backLink = screen.getByText("Back to home");
    // The Link wraps the Button — check ancestor href
    const anchor = backLink.closest("a");
    expect(anchor).toHaveAttribute("href", "/");
  });

  it("renders suggested links for Design System and Hospitality", () => {
    renderNotFoundPage();
    expect(screen.getByText("Design System")).toBeInTheDocument();
    expect(screen.getByText("Hospitality")).toBeInTheDocument();
  });

  it("does NOT render the Home link in the suggested links (it is filtered out)", () => {
    renderNotFoundPage();
    // "Back to home" button covers the home shortcut; the suggested link row excludes "/"
    const links = screen.queryAllByRole("link");
    const suggestedHomeLinks = links.filter(
      (el) => el.textContent === "Home" && el.getAttribute("href") === "/"
    );
    expect(suggestedHomeLinks).toHaveLength(0);
  });

  it("sets document title on mount", () => {
    renderNotFoundPage();
    expect(document.title).toBe("Page not found — Matt Butler Engineering");
  });

  it("restores document title on unmount", () => {
    document.title = "Other Page";
    const { unmount } = renderNotFoundPage();
    expect(document.title).toBe("Page not found — Matt Butler Engineering");
    unmount();
    expect(document.title).toBe("Matt Butler Engineering");
  });

  it("renders the Design System suggested link with correct href", () => {
    renderNotFoundPage();
    const dsLink = screen.getByText("Design System").closest("a");
    expect(dsLink).toHaveAttribute("href", "/rialto/");
  });

  it("renders the Hospitality suggested link with correct href", () => {
    renderNotFoundPage();
    const hospLink = screen.getByText("Hospitality").closest("a");
    expect(hospLink).toHaveAttribute("href", "/hospitality/");
  });
});
