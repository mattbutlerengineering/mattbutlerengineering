import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingPage } from "./LoadingPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  // Faithful to the real Handshake contract: role="img" with a required
  // aria-label, the named stations rendered as its text.
  Handshake: ({
    "aria-label": ariaLabel,
    stations,
    state,
  }: {
    "aria-label": string;
    stations: readonly string[];
    state?: string;
  }) => (
    <div role="img" aria-label={ariaLabel} data-state={state}>
      {stations.join(" ")}
    </div>
  ),
}));

describe("LoadingPage", () => {
  it("renders the hospitality Handshake loader with an accessible name", () => {
    render(<LoadingPage />);
    const loader = screen.getByRole("img", { name: "Loading" });
    expect(loader).toHaveAttribute("data-state", "negotiating");
    expect(loader.textContent).toBe("Browser Hospitality");
  });

  it("renders a short caption in a polite status region", () => {
    render(<LoadingPage />);
    const caption = screen.getByText("Setting the table");
    expect(caption.closest('[role="status"]')).toHaveAttribute("aria-live", "polite");
  });
});
