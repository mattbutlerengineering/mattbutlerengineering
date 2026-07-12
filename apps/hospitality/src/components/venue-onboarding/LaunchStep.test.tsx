import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { OperatingHours } from "@mbe/types";
import { LaunchStep } from "./LaunchStep";
import type { BasicInfoData } from "./BasicInfoStep.js";
import type { LocationTimeData } from "./LocationTimeStep.js";
import type { SettingsData } from "./SettingsStep.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const basicInfo: BasicInfoData = {
  name: "The Grand Cafe",
  slug: "the-grand-cafe",
  venueGroupId: "",
};
const locationTime: LocationTimeData = { ianaTimezone: "America/New_York", currencyCode: "USD" };
const operatingHours: OperatingHours = {
  monday: { open: "09:00", close: "22:00" },
};
const settings: SettingsData = {
  defaultReservationDuration: "",
  maxPartySize: "",
  advanceBookingDays: "",
};

function mockMatchMedia(prefersReducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersReducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderLaunchStep(overrides: Partial<ComponentProps<typeof LaunchStep>> = {}) {
  const onLaunch = vi.fn().mockResolvedValue(undefined);
  const onCelebrationDone = vi.fn();
  const props: ComponentProps<typeof LaunchStep> = {
    basicInfo,
    locationTime,
    operatingHours,
    settings,
    isSubmitting: false,
    submitError: null,
    onLaunch,
    onCelebrationDone,
    ...overrides,
  };
  render(<LaunchStep {...props} />);
  return { onLaunch, onCelebrationDone };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("LaunchStep", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the review summary of entered data", () => {
    renderLaunchStep();

    expect(screen.getByText("The Grand Cafe")).toBeTruthy();
    expect(screen.getByText("the-grand-cafe")).toBeTruthy();
    expect(screen.getByText("America/New_York")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getByText("Launch Venue")).toBeTruthy();
  });

  it("calls onLaunch when the Launch button is clicked", async () => {
    const { onLaunch } = renderLaunchStep();

    fireEvent.click(screen.getByText("Launch Venue"));
    await flushMicrotasks();

    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it("shows the celebration state after a successful launch, then calls onCelebrationDone", async () => {
    vi.useFakeTimers();
    const { onCelebrationDone } = renderLaunchStep();

    fireEvent.click(screen.getByText("Launch Venue"));
    await flushMicrotasks();

    expect(screen.getByText("You're ready to take reservations")).toBeTruthy();
    expect(onCelebrationDone).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(onCelebrationDone).toHaveBeenCalledOnce();
  });

  it("skips the long celebration delay under prefers-reduced-motion but still shows the success state", async () => {
    mockMatchMedia(true);
    vi.useFakeTimers();
    const { onCelebrationDone } = renderLaunchStep();

    fireEvent.click(screen.getByText("Launch Venue"));
    await flushMicrotasks();

    expect(screen.getByText("You're ready to take reservations")).toBeTruthy();
    expect(onCelebrationDone).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onCelebrationDone).toHaveBeenCalledOnce();
  });

  it("does not celebrate when onLaunch rejects", async () => {
    const onLaunch = vi.fn().mockRejectedValue(new Error("Slug already taken"));
    const { onCelebrationDone } = renderLaunchStep({ onLaunch });

    fireEvent.click(screen.getByText("Launch Venue"));
    await flushMicrotasks();

    expect(screen.queryByText("You're ready to take reservations")).toBeNull();
    expect(onCelebrationDone).not.toHaveBeenCalled();
  });

  it("shows the submit error banner when present", () => {
    renderLaunchStep({ submitError: "Slug already taken" });

    expect(screen.getByText("Slug already taken")).toBeTruthy();
  });

  it("disables the Launch button while submitting", () => {
    renderLaunchStep({ isSubmitting: true });

    expect(screen.getByText("Creating...")).toBeTruthy();
    expect((screen.getByText("Creating...") as HTMLButtonElement).disabled).toBe(true);
  });
});
