import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage.js";
import type { ReactNode } from "react";

type MockProps = { children?: ReactNode };

// Mock internal components to test page layout structure
vi.mock("../components/HeroSection.js", () => ({
  HeroSection: () => <div data-testid="hero-section" />,
}));
vi.mock("../components/ProofStrip.js", () => ({
  ProofStrip: () => <div data-testid="proof-strip" />,
}));
vi.mock("../components/ProjectsSection.js", () => ({
  ProjectsSection: () => <div data-testid="projects-section" />,
}));
vi.mock("../components/ContactSection.js", () => ({
  ContactSection: () => <div data-testid="contact-section" />,
}));
vi.mock("../components/Navbar.js", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));
vi.mock("@mattbutlerengineering/rialto", () => ({
  Footer: ({ children }: MockProps) => <footer>{children}</footer>,
  Heading: ({ children }: MockProps) => <h2>{children}</h2>,
  Text: ({ children }: MockProps) => <p>{children}</p>,
  Button: ({ children }: MockProps) => <button>{children}</button>,
  Card: ({ children }: MockProps) => <div>{children}</div>,
  Stack: ({ children }: MockProps) => <div>{children}</div>,
}));

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

/** True when `first` precedes `second` in document order. */
function precedes(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("HomePage", () => {
  it("renders the evidence-first section set", () => {
    renderHomePage();
    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
    expect(screen.getByTestId("proof-strip")).toBeInTheDocument();
    expect(screen.getByTestId("projects-section")).toBeInTheDocument();
    expect(screen.getByTestId("contact-section")).toBeInTheDocument();
  });

  it("leads with the hero, then proof, then the work", () => {
    renderHomePage();
    expect(precedes(screen.getByTestId("hero-section"), screen.getByTestId("proof-strip"))).toBe(
      true
    );
    expect(
      precedes(screen.getByTestId("proof-strip"), screen.getByTestId("projects-section"))
    ).toBe(true);
  });

  it("closes with the weekly reads card above the minimal contact row", () => {
    renderHomePage();
    const weekly = screen.getByRole("link", { name: /browse the stack/i });
    expect(precedes(screen.getByTestId("projects-section"), weekly)).toBe(true);
    expect(precedes(weekly, screen.getByTestId("contact-section"))).toBe(true);
  });
});
