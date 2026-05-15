/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef, @eslint-react/no-array-index-key */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingPage } from "./LoadingPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe("LoadingPage", () => {
  it("renders loading text", () => {
    render(<LoadingPage />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });
});
