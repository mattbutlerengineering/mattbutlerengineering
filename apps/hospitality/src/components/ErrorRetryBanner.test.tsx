import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorRetryBanner } from "./ErrorRetryBanner.js";

// Mock Rialto components to avoid rendering internals
vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({
    children,
    variant,
    title,
    dismissible,
    onDismiss,
    actions,
  }: {
    children: ReactNode;
    variant?: string;
    title?: string;
    dismissible?: boolean;
    onDismiss?: () => void;
    actions?: ReactNode;
  }) => (
    <div data-testid="alert" data-variant={variant}>
      {title && <p data-testid="alert-title">{title}</p>}
      <div data-testid="alert-content">{children}</div>
      {actions && <div data-testid="alert-actions">{actions}</div>}
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
    children: ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
  }) => (
    <button data-testid="retry-button" data-variant={variant} data-size={size} onClick={onClick}>
      {children}
    </button>
  ),
  Collapsible: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
    <div data-testid="collapsible">
      <button data-testid="collapsible-trigger">{trigger}</button>
      <div data-testid="collapsible-content">{children}</div>
    </div>
  ),
  Text: ({ children, variant }: { children: ReactNode; variant?: string }) => (
    <span data-testid="text" data-variant={variant}>
      {children}
    </span>
  ),
}));

describe("ErrorRetryBanner", () => {
  it("should render the error message", () => {
    render(<ErrorRetryBanner error="Something went wrong" onRetry={() => {}} />);

    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("should render with error variant", () => {
    render(<ErrorRetryBanner error="Network error" onRetry={() => {}} />);

    const alert = screen.getByTestId("alert");
    expect(alert.getAttribute("data-variant")).toBe("error");
  });

  it("should call onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();

    render(<ErrorRetryBanner error="Failed to load" onRetry={onRetry} />);

    fireEvent.click(screen.getByTestId("retry-button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("should render retry button with secondary variant and md size", () => {
    render(<ErrorRetryBanner error="Error" onRetry={() => {}} />);

    const retryButton = screen.getByTestId("retry-button");
    expect(retryButton.getAttribute("data-variant")).toBe("secondary");
    expect(retryButton.getAttribute("data-size")).toBe("md");
  });

  it("should show dismiss button when onDismiss is provided", () => {
    const onDismiss = vi.fn();

    render(<ErrorRetryBanner error="Error" onRetry={() => {}} onDismiss={onDismiss} />);

    const dismissButton = screen.getByTestId("dismiss-button");
    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should not show dismiss button when onDismiss is not provided", () => {
    render(<ErrorRetryBanner error="Error" onRetry={() => {}} />);

    expect(screen.queryByTestId("dismiss-button")).toBeNull();
  });

  it("renders the surface title above the detail sentence", () => {
    render(
      <ErrorRetryBanner
        title="Walk-in not seated."
        error="The reservations service hit a snag — nothing was changed. Try again in a moment."
      />
    );

    expect(screen.getByTestId("alert-title")).toHaveTextContent("Walk-in not seated.");
    expect(screen.getByTestId("alert-content")).toHaveTextContent(
      "The reservations service hit a snag — nothing was changed. Try again in a moment."
    );
  });

  it("renders no title element when title is omitted (string callers unchanged)", () => {
    render(<ErrorRetryBanner error="Error" onRetry={() => {}} />);

    expect(screen.queryByTestId("alert-title")).toBeNull();
  });

  it("omits Retry entirely when onRetry is not provided", () => {
    render(
      <ErrorRetryBanner title="Changes not saved." error="Something in the form didn't pass." />
    );

    expect(screen.queryByTestId("retry-button")).toBeNull();
    expect(screen.queryByTestId("alert-actions")).toBeNull();
  });

  it("puts details behind a 'Show details' collapsible as caption text", () => {
    render(
      <ErrorRetryBanner
        title="Walk-in not seated."
        error="That didn't go through. Try again — if it keeps happening, tell your manager."
        details="POST /api/v1/reservations/walk-in failed: 500 Internal Server Error"
      />
    );

    expect(screen.getByTestId("collapsible-trigger")).toHaveTextContent("Show details");
    const caption = screen.getByTestId("text");
    expect(caption.getAttribute("data-variant")).toBe("caption");
    expect(caption).toHaveTextContent(
      "POST /api/v1/reservations/walk-in failed: 500 Internal Server Error"
    );
  });

  it.each([undefined, "", "   "])("renders no collapsible when details is %j", (details) => {
    render(<ErrorRetryBanner error="Error" details={details} />);

    expect(screen.queryByTestId("collapsible")).toBeNull();
    expect(screen.queryByText("Show details")).toBeNull();
  });
});
