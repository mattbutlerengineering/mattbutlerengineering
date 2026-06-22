/**
 * Unit tests for the Steps component.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Steps } from "./Steps";

const user = userEvent.setup();

const steps = [
  { label: "Cart" },
  { label: "Shipping", description: "Enter your address" },
  { label: "Payment" },
  { label: "Review" },
];

describe("Steps", () => {
  it("renders all step labels", () => {
    render(<Steps steps={steps} currentStep={0} />);
    expect(screen.getByText("Cart")).toBeInTheDocument();
    expect(screen.getByText("Shipping")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("renders step numbers for upcoming steps", () => {
    render(<Steps steps={steps} currentStep={0} />);
    // Steps 2, 3, 4 (index 1, 2, 3) are upcoming — rendered as numbers 2, 3, 4
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("marks current step with aria-current=step", () => {
    render(<Steps steps={steps} currentStep={1} />);
    // Step at index 1 (Shipping) should be current
    const shippingItem = screen.getByText("Shipping").closest("[role='listitem']");
    expect(shippingItem).toHaveAttribute("aria-current", "step");
  });

  it("does not have aria-current on non-current steps", () => {
    render(<Steps steps={steps} currentStep={1} />);
    const cartItem = screen.getByText("Cart").closest("[role='listitem']");
    expect(cartItem).not.toHaveAttribute("aria-current");
    const paymentItem = screen.getByText("Payment").closest("[role='listitem']");
    expect(paymentItem).not.toHaveAttribute("aria-current");
  });

  it("renders check icon for completed steps", () => {
    render(<Steps steps={steps} currentStep={2} />);
    // Steps 0 (Cart) and 1 (Shipping) are completed — should have SVG check icons
    // Completed steps don't render their number text
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    // Step 3 (Payment) is current, shows as number 3
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("has role=list on container", () => {
    render(<Steps steps={steps} currentStep={0} />);
    expect(screen.getByRole("list", { name: /progress steps/i })).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<Steps steps={steps} currentStep={1} />);
    expect(screen.getByText("Enter your address")).toBeInTheDocument();
  });

  it("calls onStepClick with index when step is clicked", async () => {
    const onStepClick = vi.fn();
    render(<Steps steps={steps} currentStep={0} onStepClick={onStepClick} />);
    await user.click(screen.getByText("Shipping"));
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it("calls onStepClick for current and completed steps", async () => {
    const onStepClick = vi.fn();
    render(<Steps steps={steps} currentStep={2} onStepClick={onStepClick} />);
    // Click on completed step (Cart = index 0)
    await user.click(screen.getByText("Cart"));
    expect(onStepClick).toHaveBeenCalledWith(0);
    // Click on current step (Payment = index 2)
    await user.click(screen.getByText("Payment"));
    expect(onStepClick).toHaveBeenCalledWith(2);
  });

  it("renders step buttons when onStepClick is provided", () => {
    render(<Steps steps={steps} currentStep={0} onStepClick={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(steps.length);
  });

  it("does not render buttons when onStepClick is not provided", () => {
    render(<Steps steps={steps} currentStep={0} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("supports vertical orientation", () => {
    render(<Steps steps={steps} currentStep={0} orientation="vertical" />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("supports compact prop", () => {
    render(<Steps steps={steps} currentStep={0} compact />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    // Labels still rendered
    expect(screen.getByText("Cart")).toBeInTheDocument();
  });

  it("works with single step", () => {
    render(<Steps steps={[{ label: "Only Step" }]} currentStep={0} />);
    expect(screen.getByText("Only Step")).toBeInTheDocument();
    const item = screen.getByText("Only Step").closest("[role='listitem']");
    expect(item).toHaveAttribute("aria-current", "step");
  });

  it("handles currentStep = last index", () => {
    render(<Steps steps={steps} currentStep={3} />);
    const reviewItem = screen.getByText("Review").closest("[role='listitem']");
    expect(reviewItem).toHaveAttribute("aria-current", "step");
  });

  it("does not emit 'undefined' in container or step className", () => {
    const { container } = render(<Steps steps={steps} currentStep={1} />);
    const allClasses = Array.from(container.querySelectorAll("[class]"))
      .map((el) => el.className)
      .join(" ");
    expect(allClasses).not.toMatch(/undefined/);
  });
});
