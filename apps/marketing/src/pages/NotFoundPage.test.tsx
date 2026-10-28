/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { NotFoundPage } from "./NotFoundPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children, level }: any) => {
    const Tag = `h${level}` as any;
    return <Tag>{children}</Tag>;
  },
  Text: ({ children }: any) => <p>{children}</p>,
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
    expect(screen.getByText(/Wrong door\. That page never made the list\./i)).toBeInTheDocument();
  });

  it("renders Back to home as a single link to /, with no nested button", () => {
    renderNotFoundPage();
    const homeLinks = screen.getAllByRole("link", { name: "Back to home" });
    expect(homeLinks).toHaveLength(1);
    expect(homeLinks[0]).toHaveAttribute("href", "/");
    expect(homeLinks[0]?.querySelector("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back to home" })).not.toBeInTheDocument();
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
