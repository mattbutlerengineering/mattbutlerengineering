import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CallbackPage } from "./CallbackPage.js";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Handshake: ({
    "aria-label": ariaLabel,
    stations,
    state,
    lane,
  }: {
    "aria-label": string;
    stations: readonly string[];
    state?: string;
    lane?: number;
  }) => (
    <div role="img" aria-label={ariaLabel} data-state={state} data-lane={lane}>
      {stations.join(" ")}
    </div>
  ),
}));

describe("CallbackPage", () => {
  it("renders the handshake in flight between the browser, identity, and API", () => {
    render(<CallbackPage />);
    const handshake = screen.getByRole("img", { name: "Verifying your sign-in" });
    expect(handshake).toHaveAttribute("data-state", "negotiating");
    expect(handshake).toHaveAttribute("data-lane", "1");
    expect(handshake.textContent).toBe("Browser Identity API");
  });

  it("announces the verification step politely without repeating the image label", () => {
    render(<CallbackPage />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Exchanging your code for a session");
    expect(screen.getByTestId("callback-page")).toBeInTheDocument();
  });
});
