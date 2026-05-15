/* eslint-disable react/jsx-no-undef, @typescript-eslint/no-explicit-any, @eslint-react/no-array-index-key */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { AuthConfigError } from "./AuthConfigError.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("../App.module.css", () => ({
  default: { loginContainer: "loginContainer" },
}));

describe("AuthConfigError", () => {
  it("renders configuration error heading", () => {
    render(<AuthConfigError missing={["VITE_AUTH_AUTHORITY"]} />);
    expect(screen.getByText("Configuration Error")).toBeDefined();
  });

  it("renders description text", () => {
    render(<AuthConfigError missing={[]} />);
    expect(screen.getByText(/missing required authentication configuration/)).toBeDefined();
  });

  it("shows missing vars in dev mode", () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = true;

    render(<AuthConfigError missing={["VITE_AUTH_AUTHORITY", "VITE_AUTH_CLIENT_ID"]} />);
    expect(screen.getByText(/VITE_AUTH_AUTHORITY, VITE_AUTH_CLIENT_ID/)).toBeDefined();

    import.meta.env.DEV = originalDev;
  });

  it("renders Return to Home button", async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign: assignMock },
      writable: true,
    });

    render(<AuthConfigError missing={[]} />);
    await userEvent.click(screen.getByText("Return to Home"));
    expect(assignMock).toHaveBeenCalledWith("/");
  });
});
