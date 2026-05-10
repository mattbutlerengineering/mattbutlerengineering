import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AboutSection } from "../components/AboutSection.js";
import { ContactSection } from "../components/ContactSection.js";
import { HeroSection } from "../components/HeroSection.js";
import { Navbar } from "../components/Navbar.js";
import { ProjectCard } from "../components/ProjectCard.js";
import { ProjectsSection } from "../components/ProjectsSection.js";
import { TechStackSection } from "../components/TechStackSection.js";
import { NotFoundPage } from "../pages/NotFoundPage.js";

vi.mock("framer-motion", () => {
  return {
    motion: new Proxy({}, {
      get: () => {
        const MotionComponent = ({ children }: any) => <div>{children}</div>;
        return MotionComponent;
      }
    }),
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
  useScrollReveal: () => ({ 
    ref: vi.fn(), 
    controls: { start: vi.fn(), subscribe: vi.fn(), stop: vi.fn(), mount: vi.fn() } 
  }),
  useReducedMotion: () => false,
  useToast: () => ({ toast: vi.fn() }),
  Hero: ({ title, eyebrow }: any) => <div data-testid="hero">{title}{eyebrow}</div>,
  Stack: ({ children }: any) => <div>{children}</div>,
  AppBar: ({ logo, actions }: any) => <header data-testid="appbar">{logo}{actions}</header>,
  ThemeToggle: () => <div data-testid="theme-toggle" />,
  Divider: () => <hr data-testid="divider" />,
  Tag: ({ children }: any) => <span>{children}</span>,
  boop: { scale: 1.1 },
  staggerReveal: { container: {}, item: {} },
}));

describe("Components and Pages", () => {
  it("renders AboutSection", () => {
    render(<AboutSection />);
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("renders ContactSection", () => {
    render(<ContactSection />);
    expect(screen.getByText("Contact")).toBeInTheDocument();
  });

  it("renders HeroSection", () => {
    render(<HeroSection />);
    expect(screen.getByTestId("hero")).toBeInTheDocument();
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
          id: "1",
          title: "Test Project",
          description: "Desc",
          tags: ["React"],
          githubUrl: "https://github.com",
          features: [],
        }} 
      />
    );
    expect(screen.getByText("Test Project")).toBeInTheDocument();
  });

  it("renders ProjectsSection", () => {
    render(<ProjectsSection />);
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("renders TechStackSection", () => {
    render(<TechStackSection />);
    expect(screen.getByText("Tech Stack")).toBeInTheDocument();
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
