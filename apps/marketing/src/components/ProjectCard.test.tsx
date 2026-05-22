/* eslint-disable @typescript-eslint/no-explicit-any, mbe-local/prefer-rialto-components */
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
  tags: ["React", "TypeScript"],
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

  it("renders all tags", () => {
    render(<ProjectCard project={BASE_PROJECT} />);
    const tags = screen.getAllByTestId("tag");
    expect(tags).toHaveLength(2);
    expect(tags[0]).toHaveTextContent("React");
    expect(tags[1]).toHaveTextContent("TypeScript");
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

  it("renders a single tag when only one is provided", () => {
    render(<ProjectCard project={{ ...BASE_PROJECT, tags: ["Vite"] }} />);
    const tags = screen.getAllByTestId("tag");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toHaveTextContent("Vite");
  });
});
