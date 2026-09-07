import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi, describe, it, expect } from "vitest";

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ accessToken: "test-token", isAuthenticated: true }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  ChatPanel: ({ standalone }: { standalone?: boolean }) => (
    <div data-testid="chat-panel" data-standalone={standalone}>
      Chat Panel
    </div>
  ),
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

  it("renders a page heading", () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Chat" })).toBeInTheDocument();
  });
});
