/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockNavigate = vi.fn();
const mockValidateOperatingHours = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

const mockApiClient = {
  venues: {
    list: vi.fn(),
    update: vi.fn(),
    getBySlug: vi.fn(),
  },
};

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => mockApiClient),
}));

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: vi.fn(),
}));

vi.mock("../components/venue-onboarding/OperatingHoursStep.js", () => ({
  OperatingHoursStep: ({ data, errors, onChange }: any) => (
    <div data-testid="operating-hours-step">
      <span data-testid="hours-data">{JSON.stringify(data)}</span>
      {errors && <span data-testid="hours-errors">{JSON.stringify(errors)}</span>}
      <button
        data-testid="change-hours"
        onClick={() => onChange({ monday: { open: "09:00", close: "17:00" } })}
      >
        Change
      </button>
    </div>
  ),
  validateOperatingHours: (...args: any[]) => mockValidateOperatingHours(...args),
}));

vi.mock("../components/PageHeader.js", () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock("./SetupHoursPage.module.css", () => ({ default: {} }));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

import { SetupHoursPage } from "./SetupHoursPage.js";
import { ApiClientError } from "@mbe/api-client";
import { ERROR_COPY } from "../lib/describe-api-error.js";

/** A 500 the way `@mbe/api-client` raises it: `raw` is "<METHOD> <path> failed: 500 …". */
function serverError(method: string, path: string): ApiClientError {
  return new ApiClientError(
    {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "Internal Server Error",
    },
    method,
    path
  );
}
import { useVenue } from "../contexts/VenueContext.js";

const defaultVenue = {
  id: "venue-1",
  name: "Test Venue",
  operatingHours: { monday: { open: "10:00", close: "22:00" } },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <SetupHoursPage />
    </Wrapper>
  );
}

describe("SetupHoursPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: defaultVenue,
      selectedVenueId: "venue-1",
    } as any);

    mockValidateOperatingHours.mockReturnValue(null);
    mockApiClient.venues.update.mockResolvedValue({});
  });

  it("renders PageHeader with Operating Hours title", () => {
    renderPage();
    expect(screen.getByText("Operating Hours")).toBeDefined();
  });

  it("renders OperatingHoursStep with venue hours", () => {
    renderPage();
    expect(screen.getByTestId("operating-hours-step")).toBeDefined();
    expect(screen.getByTestId("hours-data").textContent).toContain("monday");
  });

  it("cancel button navigates to /setup", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Cancel"));
    expect(mockNavigate).toHaveBeenCalledWith("/setup");
  });

  it("save with validation errors sets hoursErrors", async () => {
    const validationErrors = { monday: "Invalid hours" };
    mockValidateOperatingHours.mockReturnValue(validationErrors);

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Save Hours"));

    expect(mockValidateOperatingHours).toHaveBeenCalled();
    expect(mockApiClient.venues.update).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("hours-errors")).toBeDefined();
    });
  });

  it("save success calls venues.update and navigates to /setup", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Save Hours"));

    await waitFor(() => {
      expect(mockApiClient.venues.update).toHaveBeenCalledWith("venue-1", {
        operatingHours: defaultVenue.operatingHours,
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith("/setup");
  });

  it("save failure shows the house serverError sentence, never the raw message", async () => {
    mockApiClient.venues.update.mockRejectedValue(serverError("PATCH", "/api/v1/venues/venue-1"));

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Save Hours"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(screen.getByText(ERROR_COPY.serverError.detail)).toBeDefined();
    expect(screen.queryByText(/failed: 500/)).toBeNull();
  });

  it("save failure with non-Error shows fallback message", async () => {
    mockApiClient.venues.update.mockRejectedValue("something broke");

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Save Hours"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(screen.getByText(ERROR_COPY.unknown.detail)).toBeDefined();
  });

  it("shows Saving... text while saving", async () => {
    let resolveUpdate: (v: any) => void;
    mockApiClient.venues.update.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Save Hours"));

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeDefined();
    });

    resolveUpdate!({});

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/setup");
    });
  });

  it("handleSave returns early when no selectedVenueId", async () => {
    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: null,
      selectedVenueId: null,
    } as any);

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Save Hours"));

    expect(mockValidateOperatingHours).not.toHaveBeenCalled();
    expect(mockApiClient.venues.update).not.toHaveBeenCalled();
  });

  it("onChange clears validation errors", async () => {
    const validationErrors = { monday: "Invalid hours" };
    mockValidateOperatingHours.mockReturnValue(validationErrors);

    const user = userEvent.setup();
    renderPage();

    // Trigger validation errors
    await user.click(screen.getByText("Save Hours"));
    await waitFor(() => {
      expect(screen.getByTestId("hours-errors")).toBeDefined();
    });

    // Change hours — should clear errors
    await user.click(screen.getByTestId("change-hours"));
    await waitFor(() => {
      expect(screen.queryByTestId("hours-errors")).toBeNull();
    });
  });
});
