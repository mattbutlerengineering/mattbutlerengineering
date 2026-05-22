/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../hooks/useVenueReadiness.js", () => ({
  useVenueReadiness: vi.fn(),
}));

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: vi.fn(),
}));

vi.mock("../components/PageHeader.js", () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock("./SetupPage.module.css", () => ({
  default: {
    root: "root",
    progressBar: "progressBar",
    progressFill: "progressFill",
    progressLabel: "progressLabel",
    stepList: "stepList",
    step: "step",
    stepCompleted: "stepCompleted",
    stepCurrent: "stepCurrent",
    stepLocked: "stepLocked",
    stepIcon: "stepIcon",
    stepContent: "stepContent",
    stepTitle: "stepTitle",
    stepDescription: "stepDescription",
    ctaButton: "ctaButton",
    reviewButton: "reviewButton",
  },
}));

import { SetupPage } from "./SetupPage.js";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import { useVenue } from "../contexts/VenueContext.js";

describe("SetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: { id: "v1", name: "Bella Italia" },
    } as any);

    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "setup",
      progress: 33,
      completedSteps: ["onboarding"],
      nextStep: "operating-hours",
    });
  });

  it("renders welcome message with venue name", () => {
    render(<SetupPage />);
    expect(screen.getByText("Welcome to Bella Italia")).toBeDefined();
  });

  it("falls back to 'your venue' when no selectedVenue name", () => {
    vi.mocked(useVenue).mockReturnValue({
      selectedVenue: null,
    } as any);

    render(<SetupPage />);
    expect(screen.getByText("Welcome to your venue")).toBeDefined();
  });

  it("renders progress bar with correct percentage", () => {
    render(<SetupPage />);
    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("33");
    expect(progressBar.getAttribute("aria-valuemin")).toBe("0");
    expect(progressBar.getAttribute("aria-valuemax")).toBe("100");
    expect(screen.getByText("33% complete")).toBeDefined();
  });

  it("renders all 3 step items", () => {
    render(<SetupPage />);
    const stepList = screen.getByRole("list", { name: "Setup steps" });
    const steps = stepList.querySelectorAll("li");
    expect(steps.length).toBe(3);
  });

  it("completed step shows Review button that navigates to step path", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);

    const reviewButton = screen.getByText("Review");
    expect(reviewButton).toBeDefined();

    await user.click(reviewButton);
    expect(mockNavigate).toHaveBeenCalledWith("/onboarding");
  });

  it("completed step has correct aria label", () => {
    render(<SetupPage />);
    const completedStep = screen.getByLabelText("Venue Basics — Completed");
    expect(completedStep).toBeDefined();
  });

  it("current step shows CTA button with correct label that navigates", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);

    const ctaButton = screen.getByRole("button", { name: "Set Operating Hours" });
    expect(ctaButton).toBeDefined();

    await user.click(ctaButton);
    expect(mockNavigate).toHaveBeenCalledWith("/setup/hours");
  });

  it("current step has correct aria label", () => {
    render(<SetupPage />);
    const currentStep = screen.getByLabelText("Set Operating Hours — Current step");
    expect(currentStep).toBeDefined();
  });

  it("locked step shows Not yet available label and no button", () => {
    render(<SetupPage />);
    const lockedStep = screen.getByLabelText("Create Floor Plan — Not yet available");
    expect(lockedStep).toBeDefined();

    // Locked step should not have a button
    const buttons = lockedStep.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("auto-redirects to /timeline when status is operational", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      progress: 100,
      completedSteps: ["onboarding", "operating-hours", "floor-plan"],
      nextStep: null,
    });

    render(<SetupPage />);
    expect(mockNavigate).toHaveBeenCalledWith("/timeline", { replace: true });
  });

  it("does not redirect when status is setup", () => {
    render(<SetupPage />);
    expect(mockNavigate).not.toHaveBeenCalledWith("/timeline", expect.anything());
  });

  it("renders step descriptions", () => {
    render(<SetupPage />);
    expect(screen.getByText("Set up your venue name, timezone, and currency.")).toBeDefined();
    expect(screen.getByText("Configure which days and hours your venue is open.")).toBeDefined();
    expect(
      screen.getByText("Add a floor plan with at least one table to enable reservations.")
    ).toBeDefined();
  });

  it("renders multiple completed steps with Review buttons", async () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "setup",
      progress: 67,
      completedSteps: ["onboarding", "operating-hours"],
      nextStep: "floor-plan",
    });

    const user = userEvent.setup();
    render(<SetupPage />);

    const reviewButtons = screen.getAllByText("Review");
    expect(reviewButtons.length).toBe(2);

    // Click second Review button (operating-hours)
    await user.click(reviewButtons[1]);
    expect(mockNavigate).toHaveBeenCalledWith("/setup/hours");
  });
});
