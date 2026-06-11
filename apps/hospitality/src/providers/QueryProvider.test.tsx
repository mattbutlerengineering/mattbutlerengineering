import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "./QueryProvider.js";

function TestConsumer() {
  const client = useQueryClient();
  const defaults = client.getDefaultOptions().queries;
  return (
    <div data-testid="has-client">
      <span data-testid="retry">{String(defaults?.retry)}</span>
    </div>
  );
}

describe("QueryProvider", () => {
  it("provides a QueryClient to children", () => {
    render(
      <QueryProvider>
        <TestConsumer />
      </QueryProvider>
    );

    expect(screen.getByTestId("has-client")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <QueryProvider>
        <div data-testid="child">Hello</div>
      </QueryProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("configures 3 retries for queries", () => {
    render(
      <QueryProvider>
        <TestConsumer />
      </QueryProvider>
    );

    expect(screen.getByTestId("retry")).toHaveTextContent("3");
  });
});
