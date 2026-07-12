import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepIndicator } from "./StepIndicator";
import { ONBOARDING_STEPS } from "./onboarding-steps";

describe("StepIndicator", () => {
  it("marks the current step with aria-current and labels it with the shared step name", () => {
    render(<StepIndicator currentStep={2} totalSteps={5} highestStepReached={2} />);

    const current = screen.getByLabelText(`Step 2: ${ONBOARDING_STEPS[1].label}`);
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("shows a checkmark on completed steps", () => {
    render(<StepIndicator currentStep={3} totalSteps={5} highestStepReached={3} />);

    // Step 1 is completed → its dot renders a checkmark rather than the number.
    const completed = screen.getByLabelText(new RegExp(`Step 1: ${ONBOARDING_STEPS[0].label}`));
    expect(completed).toHaveTextContent("✓");
  });

  it("navigates when a reached, non-current step is clicked", () => {
    const onStepClick = vi.fn();
    render(
      <StepIndicator
        currentStep={3}
        totalSteps={5}
        highestStepReached={3}
        onStepClick={onStepClick}
      />
    );

    const reached = screen.getByLabelText(new RegExp(`Step 1: ${ONBOARDING_STEPS[0].label}`));
    fireEvent.click(reached);
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it("does not make future (unreached) steps clickable", () => {
    const onStepClick = vi.fn();
    render(
      <StepIndicator
        currentStep={1}
        totalSteps={5}
        highestStepReached={1}
        onStepClick={onStepClick}
      />
    );

    const future = screen.getByLabelText(new RegExp(`Step 5: ${ONBOARDING_STEPS[4].label}`));
    fireEvent.click(future);
    expect(onStepClick).not.toHaveBeenCalled();
  });
});
