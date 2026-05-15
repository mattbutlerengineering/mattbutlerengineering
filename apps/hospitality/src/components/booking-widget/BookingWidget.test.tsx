import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookingWidget } from "./BookingWidget.js";
import { createApiClient } from "@mbe/api-client";
import React from "react";

process.env.TZ = "UTC";

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Steps: ({ currentStep, steps }: any) => (
    <div data-testid="steps" data-current={currentStep}>
      {steps?.[currentStep]?.label}
    </div>
  ),
  Text: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div>{children}</div>,
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  EmptyState: ({ heading }: any) => <div>{heading}</div>,
  Input: (props: any) => {
    const id = props.id || props.label?.replace(/\s+/g, "-").toLowerCase() || "input";
    return (
      <div>
        <label htmlFor={id}>{props.label}</label>
        <input
          id={id}
          {...props}
          onChange={(e) => props.onChange?.({ target: { value: e.target.value } } as any)}
        />
      </div>
    );
  },
  Label: ({ children }: any) => <label>{children}</label>,
  TextArea: (props: any) => {
    const id = props.id || props.label?.replace(/\s+/g, "-").toLowerCase() || "textarea";
    return (
      <div>
        <label htmlFor={id}>{props.label}</label>
        <textarea id={id} {...props} onChange={(e) => props.onChange?.(e.target.value)} />
      </div>
    );
  },
  Icon: () => <div />,
}));

describe("BookingWidget", () => {
  const mockApi = {
    availability: {
      getTimeSlots: vi.fn(),
    },
    holds: {
      create: vi.fn(),
      confirm: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
  });

  const renderWidget = () => render(<BookingWidget venueId="v1" />);

  it("completes the full booking flow", async () => {
    // Step 1: Date & Party
    renderWidget();
    expect(screen.getByText("Date & Party")).toBeDefined();

    // Simulate date selection
    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });

    mockApi.availability.getTimeSlots.mockResolvedValue([
      { time: "2026-05-20T18:00:00", available: true },
      { time: "2026-05-20T19:00:00", available: true },
    ]);

    const nextBtn = screen.getByText("Find Available Times");
    fireEvent.click(nextBtn);

    // Step 2: Time
    await waitFor(() => expect(screen.getByText("Time")).toBeDefined());
    expect(screen.getByText(/6:00 PM/i)).toBeDefined();
    expect(screen.getByText(/7:00 PM/i)).toBeDefined();

    mockApi.holds.create.mockResolvedValue({
      hold: {
        id: "hold-1",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    });

    fireEvent.click(screen.getByText(/6:00 PM/i));

    // Step 3: Details
    await waitFor(() => expect(screen.getByText("Details")).toBeDefined());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "John Doe" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "john@example.com" } });

    mockApi.holds.confirm.mockResolvedValue({
      id: "res-123",
      status: "CONFIRMED",
      date: "2026-05-20",
      startTime: "18:00",
      partySize: 2,
    });

    fireEvent.click(screen.getByText("Complete Reservation"));

    // Step 4: Confirmation
    await waitFor(() => expect(screen.getByText("Reservation Confirmed!")).toBeDefined());
    expect(screen.getByText("RES-123")).toBeDefined();
  });

  it("handles availability errors", async () => {
    renderWidget();
    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });

    mockApi.availability.getTimeSlots.mockRejectedValue(new Error("API Down"));

    fireEvent.click(screen.getByText("Find Available Times"));

    await waitFor(() => expect(screen.getByText("API Down")).toBeDefined());
  });
});
