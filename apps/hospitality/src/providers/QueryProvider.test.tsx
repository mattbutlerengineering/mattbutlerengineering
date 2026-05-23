import "@testing-library/jest-dom";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "./QueryProvider.js";

function TestConsumer() {
  const client = useQueryClient();
  return <div data-testid="has-client">{client ? "yes" : "no"}</div>;
}

describe("QueryProvider", () => {
  it("provides a QueryClient to children", () => {
    render(
      <QueryProvider>
        <TestConsumer />
      </QueryProvider>
    );

    expect(screen.getByTestId("has-client")).toHaveTextContent("yes");
  });

  it("renders children", () => {
    render(
      <QueryProvider>
        <div data-testid="child">Hello</div>
      </QueryProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
