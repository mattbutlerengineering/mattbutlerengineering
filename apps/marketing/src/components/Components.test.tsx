/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ContactSection } from "../components/ContactSection.js";
import { HeroSection } from "../components/HeroSection.js";
import { Navbar } from "../components/Navbar.js";
import { ProjectCard } from "../components/ProjectCard.js";
import { ProjectsSection } from "../components/ProjectsSection.js";
import { ProofStrip } from "../components/ProofStrip.js";
import { NotFoundPage } from "../pages/NotFoundPage.js";

vi.mock("framer-motion", () => {
  return {
    motion: new Proxy(
      {},
      {
        get: () => {
          const MotionComponent = ({ children }: any) => <div>{children}</div>;
          return MotionComponent;
        },
      }
    ),
    useReducedMotion: () => false,
  };
});

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Text: ({ children }: any) => <p>{children}</p>,
  Button: ({ children }: any) => <button>{children}</button>,
  Card: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Icon: () => <div />,
  Odometer: ({ value }: { value: number }) => <span>{value}</span>,
  useScrollReveal: () => ({
    ref: vi.fn(),
    controls: { start: vi.fn(), subscribe: vi.fn(), stop: vi.fn(), mount: vi.fn() },
  }),
  useReducedMotion: () => false,
  useToast: () => ({ toast: vi.fn() }),
  Hero: ({ title, eyebrow }: any) => (
    <div data-testid="hero">
      {title}
      {eyebrow}
    </div>
  ),
  SilkFlow: () => <div data-testid="silk-flow" />,
  Stack: ({ children }: any) => <div>{children}</div>,
  AppBar: ({ logo, actions }: any) => (
    <header data-testid="appbar">
      {logo}
      {actions}
    </header>
  ),
  ThemeToggle: () => <div data-testid="theme-toggle" />,
  Divider: () => <hr data-testid="divider" />,
  Tag: ({ children }: any) => <span>{children}</span>,
  boop: { scale: 1.1 },
  staggerReveal: { container: {}, item: {} },
}));

describe("Components and Pages", () => {
  it("renders ContactSection", () => {
    render(<ContactSection />);
    expect(screen.getByText("Elsewhere")).toBeInTheDocument();
  });

  it("renders HeroSection", () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>
    );
    expect(screen.getByTestId("hero")).toBeInTheDocument();
  });

  it("renders ProofStrip", () => {
    render(<ProofStrip />);
    expect(screen.getByText("By the numbers")).toBeInTheDocument();
  });

  it("renders Navbar", () => {
    render(
      <MemoryRouter>
        <Navbar theme="light" onThemeToggle={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText("Matt Butler")).toBeInTheDocument();
  });

  it("renders ProjectCard", () => {
    render(
      <ProjectCard
        project={{
          title: "Test Project",
          description: "Desc",
          stack: ["React"],
        }}
      />
    );
    expect(screen.getByText("Test Project")).toBeInTheDocument();
  });

  it("renders ProjectsSection", () => {
    render(<ProjectsSection />);
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("renders NotFoundPage", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
