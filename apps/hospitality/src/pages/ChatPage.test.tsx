import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi, describe, it, expect } from "vitest";

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ accessToken: "test-token", isAuthenticated: true }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  ChatPanel: ({ standalone, registry }: { standalone?: boolean; registry?: object }) => (
    <div
      data-testid="chat-panel"
      data-standalone={standalone}
      data-has-registry={String(Boolean(registry))}
    >
      Chat Panel
    </div>
  ),
}));

vi.mock("@mbe/rialto-catalog", () => ({
  registry: { Card: () => null },
}));

vi.mock("../components/PageHeader.js", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { ChatPage } from "./ChatPage";

describe("ChatPage", () => {
  it("renders ChatPanel in standalone mode", () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    const panel = screen.getByTestId("chat-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-standalone", "true");
  });

  it("passes the catalog registry so generated elements render as real components", () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-has-registry", "true");
  });

  it("renders a page heading", () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Chat" })).toBeInTheDocument();
  });
});
