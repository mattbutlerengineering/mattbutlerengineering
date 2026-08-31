import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignOutPage } from "./SignOutPage.js";
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

describe("SignOutPage", () => {
  it("renders the handshake negotiating between the browser and identity", () => {
    render(<SignOutPage />);
    const handshake = screen.getByRole("img", { name: "Ending your session with Identity" });
    expect(handshake).toHaveAttribute("data-state", "negotiating");
    expect(handshake).toHaveAttribute("data-lane", "0");
    expect(handshake.textContent).toBe("Browser Identity");
  });

  it("announces the sign-out politely, as a sentence distinct from the image label", () => {
    render(<SignOutPage />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Signing you out");
    expect(status.textContent).not.toBe("Ending your session with Identity");
    expect(screen.getByTestId("sign-out-page")).toBeInTheDocument();
  });
});
