/**
 * Unit tests for the Steps component.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("keeps clickable steps in the tab order (display:contents is not focusable)", () => {
    // Chromium will not focus an element whose box was removed with
    // display:contents, even when it is a real <button> with no tabindex.
    // jsdom still tabs to that button, so the stylesheet is the regression lock.
    const css = readFileSync(resolve(import.meta.dirname, "./Steps.module.css"), "utf8");
    const block = css.match(/\.stepButton\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(block).not.toMatch(/display:\s*contents/);
    expect(block).toMatch(/display:\s*flex/);
  });

  it("tabs through every clickable step and back from the control after them", async () => {
    render(
      <>
        <Steps steps={steps} currentStep={1} onStepClick={vi.fn()} />
        <button type="button">After</button>
      </>
    );
    const stepButtons = screen.getAllByRole("button").slice(0, steps.length);
    expect(stepButtons).toHaveLength(steps.length);
    const first = stepButtons[0];
    const last = stepButtons.at(-1);
    if (!first || !last) throw new Error("expected a step button");

    await user.tab();
    expect(first).toHaveFocus();
    for (const button of stepButtons.slice(1)) {
      await user.tab();
      expect(button).toHaveFocus();
    }
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("exposes aria-current=step on the current step button", () => {
    render(<Steps steps={steps} currentStep={1} onStepClick={vi.fn()} />);
    const [cart, shipping, payment, review] = screen.getAllByRole("button");
    if (!cart || !shipping || !payment || !review) throw new Error("expected step buttons");
    expect(shipping).toHaveAttribute("aria-current", "step");
    expect(cart).not.toHaveAttribute("aria-current");
    expect(payment).not.toHaveAttribute("aria-current");
    expect(review).not.toHaveAttribute("aria-current");
  });

  it("does not emit 'undefined' in container or step className", () => {
    const { container } = render(<Steps steps={steps} currentStep={1} />);
    const allClasses = Array.from(container.querySelectorAll("[class]"))
      .map((el) => el.className)
      .join(" ");
    expect(allClasses).not.toMatch(/undefined/);
  });
});
