/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WaitlistJoinView } from "./WaitlistJoinView.js";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, disabled, ...props }: any) => (
    <button disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Input: ({ label, value, onChange, placeholder, type, error, hint }: any) => (
    <div>
      <label>{label}</label>
      <input
        type={type ?? "text"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-testid={`input-${label?.toLowerCase().replace(/\s/g, "-")}`}
        aria-invalid={Boolean(error)}
      />
      {hint && (
        <span data-testid={error ? "input-error" : "input-hint"}>{hint}</span>
      )}
    </div>
  ),
  Alert: ({ children, variant }: any) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
    </div>
  ),
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Heading: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
}));

const DEFAULT_PROPS = {
  requestedDate: "2026-05-20",
  partySize: 2,
  estimatedWaitMinutes: 30,
  venueSlug: "test-venue",
  venueId: "venue-1",
  apiBaseUrl: "https://api.example.com",
  onJoined: vi.fn(),
  onBack: vi.fn(),
};

describe("WaitlistJoinView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows no-availability message with estimated wait time", () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    expect(screen.getAllByText(/No tables available/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/~30 min/i)).toBeDefined();
  });

  it("shows the requested date in the no-availability message without a fabricated time", () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    // Renders the date (May 20) — not a hardcoded clock time like "7:00 PM".
    expect(screen.getByText(/May 20/)).toBeDefined();
    expect(screen.queryByText(/7:00/)).toBeNull();
    expect(screen.queryByText(/\d:\d\d\s?[AP]M/i)).toBeNull();
  });

  it("renders phone number input", () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("input-phone")).toBeDefined();
  });

  it("renders name input", () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("input-name")).toBeDefined();
  });

  it("renders Join Waitlist button", () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Join Waitlist/i)).toBeDefined();
  });

  it("Join Waitlist button is disabled when phone is empty", () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    const btn = screen.getByText(/Join Waitlist/i) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Join Waitlist button is disabled when name is empty but phone is provided", () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    const phoneInput = screen.getByTestId("input-phone");
    fireEvent.change(phoneInput, { target: { value: "+15551234567" } });
    const btn = screen.getByText(/Join Waitlist/i) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Join Waitlist button is enabled when both name and phone are provided", () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByTestId("input-phone"), { target: { value: "+15551234567" } });
    const btn = screen.getByText(/Join Waitlist/i) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("shows validation error when phone is invalid on submit", async () => {
    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByTestId("input-phone"), { target: { value: "bad-phone" } });
    const btn = screen.getByText(/Join Waitlist/i);
    fireEvent.click(btn);
    expect(screen.getByTestId("input-error")).toBeDefined();
  });

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn();
    render(<WaitlistJoinView {...DEFAULT_PROPS} onBack={onBack} />);
    fireEvent.click(screen.getByText(/Back/i));
    expect(onBack).toHaveBeenCalled();
  });

  it("calls onJoined with position and estimatedWaitMinutes after successful join", async () => {
    const onJoined = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: "wl-1",
          position: 3,
          estimatedWaitMinutes: 45,
          status: "waiting",
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<WaitlistJoinView {...DEFAULT_PROPS} onJoined={onJoined} />);
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByTestId("input-phone"), { target: { value: "+15551234567" } });
    fireEvent.click(screen.getByText(/Join Waitlist/i));

    await waitFor(() => {
      expect(onJoined).toHaveBeenCalledWith({ position: 3, estimatedWaitMinutes: 45 });
    });
    vi.unstubAllGlobals();
  });

  it("shows error alert on API failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Server error" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByTestId("input-phone"), { target: { value: "+15551234567" } });
    fireEvent.click(screen.getByText(/Join Waitlist/i));

    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeDefined();
    });
    vi.unstubAllGlobals();
  });

  it("shows loading state while submitting", async () => {
    let resolveFetch!: (value: unknown) => void;
    const pendingFetch = new Promise((r) => {
      resolveFetch = r;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingFetch));

    render(<WaitlistJoinView {...DEFAULT_PROPS} />);
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByTestId("input-phone"), { target: { value: "+15551234567" } });
    fireEvent.click(screen.getByText(/Join Waitlist/i));

    await waitFor(() => {
      expect(screen.getByText(/Joining.../i)).toBeDefined();
    });

    resolveFetch({
      ok: true,
      json: async () => ({ data: { id: "wl-1", position: 1, estimatedWaitMinutes: 15 } }),
    });
    vi.unstubAllGlobals();
  });
});
