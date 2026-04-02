import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorRetryBanner } from "./ErrorRetryBanner.js";

// Mock Rialto components to avoid rendering internals
vi.mock("@mbe/rialto", () => ({
  Alert: ({
    children,
    variant,
    dismissible,
    onDismiss,
    actions,
  }: {
    children: React.ReactNode;
    variant?: string;
    dismissible?: boolean;
    onDismiss?: () => void;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="alert" data-variant={variant}>
      <div data-testid="alert-content">{children}</div>
      <div data-testid="alert-actions">{actions}</div>
      {dismissible && (
        <button data-testid="dismiss-button" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  ),
  Button: ({
    children,
    onClick,
    variant,
    size,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
  }) => (
    <button
      data-testid="retry-button"
      data-variant={variant}
      data-size={size}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

describe("ErrorRetryBanner", () => {
  it("should render the error message", () => {
    render(
      <ErrorRetryBanner error="Something went wrong" onRetry={() => {}} />
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("should render with error variant", () => {
    render(
      <ErrorRetryBanner error="Network error" onRetry={() => {}} />
    );

    const alert = screen.getByTestId("alert");
    expect(alert.getAttribute("data-variant")).toBe("error");
  });

  it("should call onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();

    render(
      <ErrorRetryBanner error="Failed to load" onRetry={onRetry} />
    );

    fireEvent.click(screen.getByTestId("retry-button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("should render retry button with secondary variant and sm size", () => {
    render(
      <ErrorRetryBanner error="Error" onRetry={() => {}} />
    );

    const retryButton = screen.getByTestId("retry-button");
    expect(retryButton.getAttribute("data-variant")).toBe("secondary");
    expect(retryButton.getAttribute("data-size")).toBe("sm");
  });

  it("should show dismiss button when onDismiss is provided", () => {
    const onDismiss = vi.fn();

    render(
      <ErrorRetryBanner
        error="Error"
        onRetry={() => {}}
        onDismiss={onDismiss}
      />
    );

    const dismissButton = screen.getByTestId("dismiss-button");
    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should not show dismiss button when onDismiss is not provided", () => {
    render(
      <ErrorRetryBanner error="Error" onRetry={() => {}} />
    );

    expect(screen.queryByTestId("dismiss-button")).toBeNull();
  });
});
