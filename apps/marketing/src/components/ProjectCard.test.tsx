/// <reference types="node" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/* ── Tactile affordance ───────────────────────────────────────── */
// Rialto's `Card` already declares a hover lift, but `tilt` makes Framer write
// an inline `transform` on that same element — and an inline style beats any
// stylesheet rule, so the lift never lands on a project card. The lift
// therefore belongs to a wrapper Framer does not drive; the shadows stay on the
// Card (`box-shadow` is not part of the inline transform). jsdom applies no
// stylesheet, so these are read off the CSS module the browser actually loads.

// Resolved from `process.cwd()` (vitest runs from apps/marketing) — Vite
// statically rewrites `new URL(literal, import.meta.url)` into an asset-URL
// transform, which does not survive as a readable file path.
const CARD_CSS = readFileSync(
  resolve(process.cwd(), "src/components/ProjectCard.module.css"),
  "utf-8"
);

/** Declarations of the first rule whose selector list contains `selector`. */
function ruleBody(css: string, selector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selectors = "", body = ""] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(",").some((entry) => entry.trim() === selector)) return body;
  }
  return "";
}

describe("ProjectCard tactile affordance", () => {
  it("lifts the card off the page on hover", () => {
    expect(ruleBody(CARD_CSS, ".tactile:hover")).toMatch(/transform:\s*translateY\(-[1-9]/);
  });

  it("gives keyboard focus the same lift a pointer gets, via focus-visible", () => {
    expect(ruleBody(CARD_CSS, ".tactile:has(:focus-visible)")).toMatch(
      /transform:\s*translateY\(-[1-9]/
    );
    expect(ruleBody(CARD_CSS, ".tactile:has(:focus-visible) .card")).toMatch(
      /var\(--rialto-shadow-/
    );
  });

  it("presses back down with the Rialto pressed shadow", () => {
    expect(ruleBody(CARD_CSS, ".tactile:active")).toMatch(/transform:\s*translateY\(/);
    expect(ruleBody(CARD_CSS, ".tactile:active .card")).toContain("var(--rialto-shadow-pressed)");
  });

  it("drops the movement, keeping the shadows, under prefers-reduced-motion", () => {
    const reducedMotion = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\n\}/.exec(
      CARD_CSS
    )?.[1];
    expect(reducedMotion).toMatch(/transform:\s*none/);
  });
});
