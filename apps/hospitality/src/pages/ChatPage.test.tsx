import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi, describe, it, expect } from "vitest";

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ accessToken: "test-token", isAuthenticated: true }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../constants/copilotContext.js", () => ({
  HOSPITALITY_DOMAIN_CONTEXT: { schemas: [] },
  useChatRequestContext: () => ({ venueId: "venue-1", timeZone: "America/Los_Angeles" }),
  useChatSuggestions: () => ["How does tonight look?"],
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  ChatPanel: ({
    standalone,
    registry,
    requestContext,
    suggestions,
  }: {
    standalone?: boolean;
    registry?: object;
    requestContext?: Record<string, unknown>;
    suggestions?: readonly string[];
  }) => (
    <div
      data-testid="chat-panel"
      data-standalone={standalone}
      data-has-registry={String(Boolean(registry))}
      data-request-context={JSON.stringify(requestContext)}
      data-suggestions={JSON.stringify(suggestions)}
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
  it("offers starter suggestions", () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId("chat-panel")).toHaveAttribute(
      "data-suggestions",
      JSON.stringify(["How does tonight look?"])
    );
  });

  it("sends the selected venue and its time zone with every message", () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId("chat-panel")).toHaveAttribute(
      "data-request-context",
      JSON.stringify({ venueId: "venue-1", timeZone: "America/Los_Angeles" })
    );
  });

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
