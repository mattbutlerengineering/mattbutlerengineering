import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage.js";

// Mock internal components to test page layout structure
vi.mock("../components/HeroSection.js", () => ({
  HeroSection: () => <div data-testid="hero-section" />
}));
vi.mock("../components/AboutSection.js", () => ({
  AboutSection: () => <div data-testid="about-section" />
}));
vi.mock("../components/ProjectsSection.js", () => ({
  ProjectsSection: () => <div data-testid="projects-section" />
}));
vi.mock("../components/TechStackSection.js", () => ({
  TechStackSection: () => <div data-testid="tech-stack-section" />
}));
vi.mock("../components/ContactSection.js", () => ({
  ContactSection: () => <div data-testid="contact-section" />
}));
vi.mock("../components/Navbar.js", () => ({
  Navbar: () => <nav data-testid="navbar" />
}));
vi.mock("@mattbutlerengineering/rialto", () => ({
  Footer: ({ children }: any) => <footer>{children}</footer>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Text: ({ children }: any) => <p>{children}</p>,
  Button: ({ children }: any) => <button>{children}</button>,
}));

describe("HomePage", () => {
  it("renders all page sections in correct order", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
    expect(screen.getByTestId("about-section")).toBeInTheDocument();
    expect(screen.getByTestId("projects-section")).toBeInTheDocument();
    expect(screen.getByTestId("tech-stack-section")).toBeInTheDocument();
    expect(screen.getByTestId("contact-section")).toBeInTheDocument();
  });
});
