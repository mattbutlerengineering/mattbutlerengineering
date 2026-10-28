import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAuth } from "@mbe/auth/react";
import React from "react";
import type * as HostBrand from "../lib/host-brand.js";

// Serve the page as eat-sheet.com (#7709). The {{brand}}-filled document
// title is covered by i18n/brand-interpolation.test.ts — the shared runtime is
// initialised by test setup before this mock applies.
vi.mock("../lib/host-brand.js", async (importOriginal) => {
  const actual = await importOriginal<typeof HostBrand>();
  return {
    ...actual,
    currentHostConfig: () => actual.hostConfig("eat-sheet.com"),
  };
});

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children, as: Tag = "span" }: { children: React.ReactNode; as?: "h1" | "span" }) => (
    <Tag>{children}</Tag>
  ),
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  Handshake: () => <div />,
  DepartureBoard: () => <div />,
}));

const { LoginGate } = await import("./LoginGate.js");

describe("LoginGate on eat-sheet.com", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      signIn: vi.fn(),
      activeNavigator: undefined,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it("names the product eat-sheet in the heading", () => {
    render(<LoginGate />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("eat-sheet");
  });
});
