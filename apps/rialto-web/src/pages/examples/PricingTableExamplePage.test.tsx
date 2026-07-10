import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ElementType, ReactNode } from "react";
import {
  PricingTableExamplePage,
  PRICING_PLANS,
  formatPrice,
  perMonthPrice,
  annualBilledTotal,
  discountPercent,
  maxDiscountPercent,
} from "./PricingTableExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The stubs preserve the semantics the assertions
// depend on: Text honors the `as` element and forwards `id` (headings stay
// headings and remain referenceable via aria-labelledby), Button exposes its
// variant and stays a real <button> (keyboard-operable CTAs), Badge renders its
// label, and SegmentedControl emits the WAI-ARIA radiogroup/radio contract with
// real <button> radios so the billing toggle is exercised by keyboard + click.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({
    as,
    id,
    className,
    children,
  }: {
    as?: ElementType;
    id?: string;
    className?: string;
    children?: ReactNode;
  }) => {
    const Tag = as ?? "p";
    return (
      <Tag id={id} className={className}>
        {children}
      </Tag>
    );
  };
  const Button = ({
    children,
    variant = "secondary",
    onClick,
  }: {
    children?: ReactNode;
    variant?: string;
    onClick?: () => void;
  }) => (
    <button type="button" data-variant={variant} onClick={onClick}>
      {children}
    </button>
  );
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Badge = ({ children, variant = "neutral" }: { children?: ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  );
  interface MockSegment {
    id: string;
    label: string;
    disabled?: boolean;
  }
  const SegmentedControl = ({
    segments,
    value,
    onChange,
    "aria-label": ariaLabel,
  }: {
    segments: MockSegment[];
    value: string;
    onChange: (id: string) => void;
    "aria-label"?: string;
  }) => (
    <div role="radiogroup" aria-label={ariaLabel}>
      {segments.map((segment) => (
        <button
          key={segment.id}
          type="button"
          role="radio"
          aria-checked={segment.id === value}
          onClick={() => onChange(segment.id)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
  return { Text, Button, Stack, Divider, Badge, SegmentedControl };
});

const totalIncluded = PRICING_PLANS.reduce(
  (sum, plan) => sum + plan.features.filter((f) => f.included).length,
  0
);
const totalExcluded = PRICING_PLANS.reduce(
  (sum, plan) => sum + plan.features.filter((f) => !f.included).length,
  0
);

describe("PricingTableExamplePage — fixture + pure helpers", () => {
  it("exposes exactly three plans with unique ids", () => {
    expect(PRICING_PLANS).toHaveLength(3);
    const ids = PRICING_PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("marks exactly one plan as recommended", () => {
    expect(PRICING_PLANS.filter((p) => p.recommended)).toHaveLength(1);
  });

  it("annual per-month price is strictly cheaper than monthly for every plan", () => {
    for (const plan of PRICING_PLANS) {
      expect(plan.annualPrice, `${plan.id} annual should undercut monthly`).toBeLessThan(
        plan.monthlyPrice
      );
    }
  });

  it("formatPrice renders whole-dollar USD with a thousands separator", () => {
    expect(formatPrice(15)).toBe("$15");
    expect(formatPrice(1200)).toBe("$1,200");
  });

  it("perMonthPrice returns the monthly or annual rate by period", () => {
    const plan = PRICING_PLANS[0]!;
    expect(perMonthPrice(plan, "monthly")).toBe(plan.monthlyPrice);
    expect(perMonthPrice(plan, "annual")).toBe(plan.annualPrice);
  });

  it("annualBilledTotal is twelve times the annual per-month rate", () => {
    const plan = PRICING_PLANS[0]!;
    expect(annualBilledTotal(plan)).toBe(plan.annualPrice * 12);
  });

  it("discountPercent is a positive whole-number percentage", () => {
    for (const plan of PRICING_PLANS) {
      const pct = discountPercent(plan);
      expect(pct).toBeGreaterThan(0);
      expect(Number.isInteger(pct)).toBe(true);
    }
  });

  it("maxDiscountPercent is the largest per-plan discount", () => {
    const expected = Math.max(...PRICING_PLANS.map((p) => discountPercent(p)));
    expect(maxDiscountPercent(PRICING_PLANS)).toBe(expected);
  });
});

describe("PricingTableExamplePage — rendering", () => {
  it("renders the showcase header with page name and description", () => {
    render(<PricingTableExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Pricing Table" })).toBeInTheDocument();
  });

  it("renders a heading for each plan", () => {
    render(<PricingTableExamplePage />);
    for (const plan of PRICING_PLANS) {
      expect(screen.getByRole("heading", { name: plan.name })).toBeInTheDocument();
    }
  });

  it("renders a keyboard-operable CTA button per plan", () => {
    render(<PricingTableExamplePage />);
    for (const plan of PRICING_PLANS) {
      const cta = screen.getByRole("button", { name: plan.cta });
      expect(cta.tagName).toBe("BUTTON");
    }
  });

  it("defaults to monthly pricing", () => {
    render(<PricingTableExamplePage />);
    for (const plan of PRICING_PLANS) {
      expect(screen.getByText(formatPrice(plan.monthlyPrice))).toBeInTheDocument();
    }
  });
});

describe("PricingTableExamplePage — recommended distinction (not colour alone)", () => {
  it("surfaces a non-colour text label on the recommended plan", () => {
    render(<PricingTableExamplePage />);
    const recommended = PRICING_PLANS.find((p) => p.recommended)!;
    const card = screen.getByRole("article", { name: recommended.name });
    expect(within(card).getByText(/most popular/i)).toBeInTheDocument();
  });

  it("marks the recommended plan structurally via a data attribute", () => {
    render(<PricingTableExamplePage />);
    for (const plan of PRICING_PLANS) {
      const card = screen.getByRole("article", { name: plan.name });
      expect(card.getAttribute("data-recommended")).toBe(String(plan.recommended));
    }
  });
});

describe("PricingTableExamplePage — accessible feature indicators (not colour alone)", () => {
  it("labels every included feature with text, not colour", () => {
    render(<PricingTableExamplePage />);
    expect(screen.getAllByText("Included")).toHaveLength(totalIncluded);
  });

  it("labels every excluded feature with text, not colour", () => {
    render(<PricingTableExamplePage />);
    expect(screen.getAllByText("Not included")).toHaveLength(totalExcluded);
  });

  it("renders each plan's feature labels", () => {
    render(<PricingTableExamplePage />);
    const recommended = PRICING_PLANS.find((p) => p.recommended)!;
    const card = screen.getByRole("article", { name: recommended.name });
    for (const feature of recommended.features) {
      expect(within(card).getByText(feature.label)).toBeInTheDocument();
    }
  });
});

describe("PricingTableExamplePage — billing toggle", () => {
  it("exposes a radiogroup with monthly and annual options", () => {
    render(<PricingTableExamplePage />);
    expect(screen.getByRole("radiogroup", { name: /billing/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /monthly/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /annual/i })).toBeInTheDocument();
  });

  it("advertises the annual discount", () => {
    render(<PricingTableExamplePage />);
    const pct = maxDiscountPercent(PRICING_PLANS);
    expect(screen.getByText(new RegExp(`save[^0-9]*${pct}%`, "i"))).toBeInTheDocument();
  });

  it("swaps every displayed price to the annual rate when annual is chosen (click)", async () => {
    const user = userEvent.setup();
    render(<PricingTableExamplePage />);

    // Monthly rates visible up front; annual rates absent.
    for (const plan of PRICING_PLANS) {
      expect(screen.getByText(formatPrice(plan.monthlyPrice))).toBeInTheDocument();
    }

    await user.click(screen.getByRole("radio", { name: /annual/i }));

    for (const plan of PRICING_PLANS) {
      expect(screen.getByText(formatPrice(plan.annualPrice))).toBeInTheDocument();
    }
    // The distinct monthly-only rates are gone (annual undercuts them all).
    for (const plan of PRICING_PLANS) {
      expect(screen.queryByText(formatPrice(plan.monthlyPrice))).not.toBeInTheDocument();
    }
    // Annual mode surfaces the per-plan savings.
    expect(screen.getAllByText(/billed annually/i).length).toBe(PRICING_PLANS.length);
  });

  it("is operable by keyboard alone", async () => {
    const user = userEvent.setup();
    render(<PricingTableExamplePage />);

    const annual = screen.getByRole("radio", { name: /annual/i });
    annual.focus();
    expect(annual).toHaveFocus();
    await user.keyboard("{Enter}");

    const scale = PRICING_PLANS.find((p) => p.id === "scale")!;
    expect(screen.getByText(formatPrice(scale.annualPrice))).toBeInTheDocument();
  });
});
