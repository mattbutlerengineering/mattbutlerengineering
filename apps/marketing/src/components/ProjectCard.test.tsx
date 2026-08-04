/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "./ProjectCard.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  Tag: ({ children }: any) => <span data-testid="tag">{children}</span>,
}));

const BASE_PROJECT = {
  title: "Test Project",
  description: "A test project description.",
  stack: ["React", "TypeScript", "Vite"],
};

describe("ProjectCard", () => {
  it("renders the project title", () => {
    render(<ProjectCard project={BASE_PROJECT} />);
    expect(screen.getByText("Test Project")).toBeInTheDocument();
  });

  it("renders the project description", () => {
    render(<ProjectCard project={BASE_PROJECT} />);
    expect(screen.getByText("A test project description.")).toBeInTheDocument();
  });

  it("renders the stack inline as one quiet line", () => {
    render(<ProjectCard project={BASE_PROJECT} />);
    expect(screen.getByText("React · TypeScript · Vite")).toBeInTheDocument();
  });

  it("renders no chip wall — the stack is text, not tags", () => {
    render(<ProjectCard project={BASE_PROJECT} />);
    expect(screen.queryAllByTestId("tag")).toHaveLength(0);
  });

  it("renders a single-entry stack without a trailing separator", () => {
    render(<ProjectCard project={{ ...BASE_PROJECT, stack: ["Vite"] }} />);
    expect(screen.getByText("Vite")).toBeInTheDocument();
  });

  it("does NOT render a link when href is absent", () => {
    render(<ProjectCard project={BASE_PROJECT} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("View live")).not.toBeInTheDocument();
  });

  it("renders a 'View live' link when href is provided", () => {
    render(<ProjectCard project={{ ...BASE_PROJECT, href: "/rialto/" }} />);
    // The link aria-label is "<title> (opens in new tab)" — that overrides the accessible name
    const link = screen.getByRole("link", {
      name: "Test Project (opens in new tab)",
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/rialto/");
    // The visible text inside the link is still "View live"
    expect(link).toHaveTextContent("View live");
  });

  it("opens the link in a new tab with noopener noreferrer", () => {
    render(<ProjectCard project={{ ...BASE_PROJECT, href: "/rialto/" }} />);
    const link = screen.getByRole("link", {
      name: "Test Project (opens in new tab)",
    });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("link aria-label includes the project title", () => {
    render(<ProjectCard project={{ ...BASE_PROJECT, href: "/rialto/" }} />);
    const link = screen.getByRole("link", {
      name: "Test Project (opens in new tab)",
    });
    expect(link).toBeInTheDocument();
  });
});
