import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { OperatingHours } from "@mbe/types";
import type * as RialtoModule from "@mattbutlerengineering/rialto";
import { LaunchStep } from "./LaunchStep";
import type { BasicInfoData } from "./BasicInfoStep.js";
import type { LocationTimeData } from "./LocationTimeStep.js";
import type { SettingsData } from "./SettingsStep.js";
import { EMPTY_FLOOR_PLAN_DRAFT, type FloorPlanDraft } from "./floor-plan-draft.js";
import { templateById, tablesForTemplate } from "./floor-plan-templates.js";
import { INITIAL_LAUNCH_PROGRESS, type LaunchProgress } from "./launch-sequence.js";

// Button/Card/Text/Stack keep the pre-existing shallow mocks so the tests
// written against them stay unaffected; StatusLED/Progress/Alert (pulled in
// via LaunchStagePanel/ErrorRetryBanner) come through real, matching
// LaunchStagePanel.test.tsx's own convention of exercising them for real.
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => {
  const actual = await importOriginal<typeof RialtoModule>();
  return {
    ...actual,
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
  };
});

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

const RESTAURANT_TEMPLATE = templateById("restaurant");
const RESTAURANT_DRAFT: FloorPlanDraft = {
  templateId: "restaurant",
  planName: RESTAURANT_TEMPLATE.planName,
  tables: tablesForTemplate(RESTAURANT_TEMPLATE),
  pristine: true,
};

const BLANK_TEMPLATE = templateById("blank");
const BLANK_DRAFT: FloorPlanDraft = {
  templateId: "blank",
  planName: BLANK_TEMPLATE.planName,
  tables: tablesForTemplate(BLANK_TEMPLATE),
  pristine: true,
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

    expect(screen.getByText("Your venue is live — add tables next")).toBeTruthy();
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

    expect(screen.getByText("Your venue is live — add tables next")).toBeTruthy();
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

    expect(screen.queryByText("Your venue is live — add tables next")).toBeNull();
    expect(onCelebrationDone).not.toHaveBeenCalled();
  });

  it("celebration copy reads 'live with N tables' when the launched draft has tables", async () => {
    vi.useFakeTimers();
    renderLaunchStep({ floorPlan: RESTAURANT_DRAFT });

    fireEvent.click(screen.getByText("Launch Venue"));
    await flushMicrotasks();

    expect(screen.getByText("Your venue is live with 14 tables")).toBeTruthy();
  });

  it("renders no fifth card when templateId is null (pre-#4761 default)", () => {
    renderLaunchStep();

    expect(screen.queryByText("Floor Plan")).toBeNull();
  });

  it("renders the Floor Plan review card for a 14-table Restaurant draft", () => {
    renderLaunchStep({ floorPlan: RESTAURANT_DRAFT });

    expect(screen.getByText("Floor Plan")).toBeTruthy();
    expect(screen.getByText("Layout")).toBeTruthy();
    expect(screen.getByText("Restaurant")).toBeTruthy();
    expect(screen.getByText("Main Dining Room")).toBeTruthy();
    expect(screen.getByText("14 tables · 48 seats")).toBeTruthy();
  });

  it("renders the empty-tables copy for a Blank draft", () => {
    renderLaunchStep({ floorPlan: BLANK_DRAFT });

    expect(
      screen.getByText("No tables — your Timeline stays empty until you add some")
    ).toBeTruthy();
  });

  it("collapses the review and mounts LaunchStagePanel once the sequence has started, leaving Launch mounted-and-disabled", () => {
    const launch: LaunchProgress = { ...INITIAL_LAUNCH_PROGRESS, inFlightStage: "venue" };
    renderLaunchStep({ floorPlan: EMPTY_FLOOR_PLAN_DRAFT, launch });

    expect(screen.getByText('Launching "The Grand Cafe"')).toBeTruthy();
    expect(screen.getByLabelText("Launch progress")).toBeTruthy();
    expect(screen.queryByText("Basic Information")).toBeNull();

    const launchButton = screen.getByText("Launch Venue") as HTMLButtonElement;
    expect(launchButton.disabled).toBe(true);
  });

  it("removes the Launch button and shows ErrorRetryBanner after a failure, wiring Retry to onRetry", () => {
    const launch: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      venueId: "venue-1",
      failedStage: "tables",
      errorMessage: "Stopped at table 7 of 14",
    };
    const onRetry = vi.fn();
    renderLaunchStep({ launch, onRetry });

    expect(screen.queryByRole("button", { name: "Launch Venue" })).toBeNull();
    expect(screen.getByText("Stopped at table 7 of 14")).toBeTruthy();

    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("resume lead reads 'Your venue is saved. Retry picks up at Tables.' for a tables-stage failure", () => {
    const launch: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      venueId: "venue-1",
      failedStage: "tables",
      errorMessage: "Stopped at table 7 of 14",
    };
    renderLaunchStep({ launch, onRetry: vi.fn() });

    expect(screen.getByText("Your venue is saved. Retry picks up at Tables.")).toBeTruthy();
  });

  it("resume lead reads exactly 'Retry picks up at Venue.' for a venue-stage failure — no saved-venue sentence", () => {
    const launch: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      failedStage: "venue",
      errorMessage: "Couldn't create the venue",
    };
    renderLaunchStep({ launch, onRetry: vi.fn() });

    expect(screen.getByText("Retry picks up at Venue.")).toBeTruthy();
    expect(screen.queryByText(/Your venue is saved/)).toBeNull();
  });

  it("does not render ErrorRetryBanner when onRetry is not provided, even with a failedStage", () => {
    const launch: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      failedStage: "venue",
      errorMessage: "Couldn't create the venue",
    };
    renderLaunchStep({ launch });

    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.queryByText(/Retry picks up at/)).toBeNull();
  });
});
