import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  RialtoProvider: ({ children }: any) => <div data-testid="rialto-provider">{children}</div>,
  GlobalNav: () => <nav data-testid="global-nav" />,
  Footer: () => <footer data-testid="footer" />,
  Text: ({ children }: any) => <Text>{children}</Text>,
}));

describe("App", () => {
  it("renders the root app with routing", () => {
    render(
      <MemoryRouter>
        <App theme="light" onThemeToggle={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("global-nav")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });
});
