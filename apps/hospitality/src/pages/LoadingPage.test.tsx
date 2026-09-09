import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingPage } from "./LoadingPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  // Faithful to the real WatchLoader contract: role="img" with a required aria-label.
  WatchLoader: ({ "aria-label": ariaLabel }: { "aria-label": string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

describe("LoadingPage", () => {
  it("renders the watch-movement loader with an accessible name", () => {
    render(<LoadingPage />);
    expect(screen.getByRole("img", { name: "Loading" })).toBeInTheDocument();
  });

  it("renders a short caption", () => {
    render(<LoadingPage />);
    expect(screen.getByText("Winding things up")).toBeInTheDocument();
  });
});
