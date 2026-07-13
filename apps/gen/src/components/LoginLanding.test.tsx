import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { LoginLanding } from "./LoginLanding.js";

const signIn = vi.fn();

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ signIn }),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  // Faithful to the real Hero: renders `title` inside an <h1>.
  Hero: ({
    eyebrow,
    title,
    subtitle,
    actions,
  }: {
    eyebrow?: string;
    title: ReactNode;
    subtitle?: string;
    actions?: ReactNode;
  }) => (
    <section aria-label="hero">
      {eyebrow ? <div data-testid="eyebrow">{eyebrow}</div> : null}
      <h1>{title}</h1>
      {subtitle ? <div data-testid="subtitle">{subtitle}</div> : null}
      {actions ? <div data-testid="actions">{actions}</div> : null}
    </section>
  ),
  Heading: ({ level = 2, children }: { level?: number; children?: ReactNode }) => {
    const Tag = `h${level}` as "h2";
    return <Tag>{children}</Tag>;
  },
  Text: ({ children, as: As = "span" }: { children?: ReactNode; as?: "span" | "p" }) => (
    <As>{children}</As>
  ),
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
  Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AuthMascot: ({ state }: { state: string }) => (
    <div data-testid="auth-mascot" data-state={state} />
  ),
  RialtoProvider: ({
    children,
    vibe,
    theme,
  }: {
    children?: ReactNode;
    vibe?: string;
    theme?: string;
  }) => (
    <div data-testid="rialto-provider" data-vibe={vibe} data-theme={theme}>
      {children}
    </div>
  ),
  useUIEnvironment: () => ({ theme: "light", vibe: "default", device: {} }),
}));

describe("LoginLanding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a single h1 Hero heading with the Gen value proposition", () => {
    render(<LoginLanding />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent?.toLowerCase()).toContain("gen");
  });

  it("explains what Gen does (generative UI from a prompt/spec)", () => {
    render(<LoginLanding />);
    // Distinctive value-proposition copy describing the generation flow.
    expect(screen.getByText(/plain language/i)).toBeDefined();
    expect(screen.getByText(/validated component spec/i)).toBeDefined();
    // "prompt" is a core concept (Hero accent + pipeline stage), so expect several.
    expect(screen.getAllByText(/prompt/i).length).toBeGreaterThan(0);
  });

  it("renders a product preview of the generation flow (spec -> JSX -> preview)", () => {
    render(<LoginLanding />);
    const preview = screen.getByTestId("gen-preview");
    expect(preview).toBeDefined();
    // The pipeline is described as real content, not just decoration.
    expect(within(preview).getByText(/prompt/i)).toBeDefined();
    expect(within(preview).getByText(/jsx/i)).toBeDefined();
    expect(within(preview).getByText(/preview/i)).toBeDefined();
  });

  it("renders a dual CTA: a primary 'Try it' path plus 'Sign In', both invoking auth", () => {
    render(<LoginLanding />);
    const tryIt = screen.getByRole("button", { name: /try/i });
    const signInBtn = screen.getByRole("button", { name: /sign in/i });
    expect(tryIt.getAttribute("data-variant")).toBe("primary");
    expect(signInBtn).toBeDefined();

    fireEvent.click(tryIt);
    fireEvent.click(signInBtn);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("retains the AuthMascot brand element", () => {
    render(<LoginLanding />);
    expect(screen.getByTestId("auth-mascot")).toBeDefined();
  });

  it("scopes the transacting vibe to the auth surface", () => {
    render(<LoginLanding />);
    const provider = screen.getByTestId("rialto-provider");
    expect(provider.getAttribute("data-vibe")).toBe("transacting");
    // Inherits the ambient theme instead of resetting it.
    expect(provider.getAttribute("data-theme")).toBe("light");
  });

  it("keeps a correct heading hierarchy (no heading above h1, section headings at h2)", () => {
    render(<LoginLanding />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(1);
  });
});
