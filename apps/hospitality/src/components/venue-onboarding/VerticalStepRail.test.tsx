import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { VerticalStepRail } from "./VerticalStepRail";
import { ONBOARDING_STEPS } from "./onboarding-steps";

describe("VerticalStepRail", () => {
  it("renders all 6 steps with a label and a one-line description", () => {
    render(<VerticalStepRail currentStep={1} highestStepReached={1} />);

    for (const step of ONBOARDING_STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
      expect(screen.getByText(step.description)).toBeInTheDocument();
    }
  });

  it("exposes an accessible progress navigation landmark", () => {
    render(<VerticalStepRail currentStep={2} highestStepReached={2} />);

    expect(screen.getByRole("navigation", { name: /progress/i })).toBeInTheDocument();
  });

  it("marks the current step with aria-current", () => {
    render(<VerticalStepRail currentStep={3} highestStepReached={4} />);

    const current = screen.getByText("Hours").closest("[aria-current]");
    expect(current).not.toBeNull();
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("shows a checkmark on completed steps and a number on the current/future steps", () => {
    render(<VerticalStepRail currentStep={3} highestStepReached={4} />);

    // Steps 1 and 2 are completed → checkmark; step 3 (current) shows its number.
    const welcome = screen.getByText("Welcome").closest("li");
    const location = screen.getByText("Location").closest("li");
    const hours = screen.getByText("Hours").closest("li");
    expect(within(welcome as HTMLElement).getByText("✓")).toBeInTheDocument();
    expect(within(location as HTMLElement).getByText("✓")).toBeInTheDocument();
    expect(within(hours as HTMLElement).getByText("3")).toBeInTheDocument();
  });

  it("navigates when a reached step is clicked", () => {
    const onStepClick = vi.fn();
    render(<VerticalStepRail currentStep={4} highestStepReached={4} onStepClick={onStepClick} />);

    // Step 2 (Location) has been reached and is not the current step → clickable.
    const locationButton = screen.getByRole("button", { name: /location/i });
    locationButton.click();
    expect(onStepClick).toHaveBeenCalledWith(2);
  });

  it("does not make future (unreached) steps clickable", () => {
    const onStepClick = vi.fn();
    render(<VerticalStepRail currentStep={1} highestStepReached={1} onStepClick={onStepClick} />);

    // Launch (step 5) is unreached → not rendered as a button.
    expect(screen.queryByRole("button", { name: /launch/i })).toBeNull();
    expect(screen.getByText("Launch")).toBeInTheDocument();
  });
});
