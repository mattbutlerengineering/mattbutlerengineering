import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ContactSection } from "./ContactSection.js";

type MockProps = { children?: ReactNode };
type HeadingMockProps = MockProps & { level?: number };

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      // Motion elements must keep their DOM tag and attributes — the anchors
      // under test are `motion.a`, and their href/rel/target are the contract.
      get: (_target, tag: string) => {
        const MotionComponent = ({ children, ...rest }: MockProps) => {
          const Tag = tag as "a" | "div";
          return <Tag {...rest}>{children}</Tag>;
        };
        return MotionComponent;
      },
    }
  ),
  useReducedMotion: () => false,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children, level = 2 }: HeadingMockProps) => {
    const Tag = `h${level}` as "h1" | "h2" | "h3";
    return <Tag>{children}</Tag>;
  },
  Text: ({ children }: MockProps) => <p>{children}</p>,
  Stack: ({ children }: MockProps) => <div>{children}</div>,
  useScrollReveal: () => ({
    ref: vi.fn(),
    controls: { start: vi.fn(), set: vi.fn(), subscribe: vi.fn(), stop: vi.fn(), mount: vi.fn() },
  }),
  staggerReveal: { container: {}, item: {} },
  boop: { scale: 1.05, transition: {} },
}));

describe("ContactSection", () => {
  it("renders a plain 'Elsewhere' heading instead of a sales pitch", () => {
    render(<ContactSection />);
    expect(screen.getByRole("heading", { level: 2, name: "Elsewhere" })).toBeInTheDocument();
    expect(screen.queryByText(/let's build something together/i)).not.toBeInTheDocument();
  });

  it("offers exactly the three ways to reach out", () => {
    render(<ContactSection />);
    const labels = screen.getAllByRole("link").map((link) => link.textContent);
    expect(labels).toEqual(["GitHub", "LinkedIn", "Email"]);
  });

  it("opens off-site profiles safely in a new tab", () => {
    render(<ContactSection />);
    for (const label of ["GitHub", "LinkedIn"]) {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("links email as a mailto rather than a clipboard widget", () => {
    render(<ContactSection />);
    expect(screen.getByRole("link", { name: /email/i }).getAttribute("href")).toMatch(/^mailto:/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
