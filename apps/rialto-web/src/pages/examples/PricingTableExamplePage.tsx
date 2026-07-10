import { useState, type ReactNode } from "react";
import { Badge, Button, SegmentedControl, Stack, Text } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./PricingTableExamplePage.module.css";

/* ── Domain ──────────────────────────────────── */

export type BillingPeriod = "monthly" | "annual";

export interface PlanFeature {
  label: string;
  /** Whether this tier includes the capability. Drives the accessible indicator. */
  included: boolean;
}

export interface PricingPlan {
  id: string;
  name: string;
  tagline: string;
  /** Per-month price when billed monthly, in whole USD. */
  monthlyPrice: number;
  /** Per-month price when billed annually (discounted), in whole USD. */
  annualPrice: number;
  recommended: boolean;
  cta: string;
  features: PlanFeature[];
}

/* ── Fixture data (no service calls) ─────────── */

/**
 * Three property-management tiers. Annual per-month prices undercut the monthly
 * rate by a flat 20%, so the toggle demonstrably changes every displayed price.
 * Feature order is shared across tiers so the columns read as a comparison grid.
 */
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For a single property getting online.",
    monthlyPrice: 15,
    annualPrice: 12,
    recommended: false,
    cta: "Start free trial",
    features: [
      { label: "1 property", included: true },
      { label: "Up to 25 rooms", included: true },
      { label: "Email support", included: true },
      { label: "Channel-manager sync", included: false },
      { label: "Revenue analytics", included: false },
      { label: "Dedicated success manager", included: false },
    ],
  },
  {
    id: "team",
    name: "Team",
    tagline: "For growing groups that need automation.",
    monthlyPrice: 40,
    annualPrice: 32,
    recommended: true,
    cta: "Choose Team",
    features: [
      { label: "Up to 5 properties", included: true },
      { label: "Unlimited rooms", included: true },
      { label: "Priority support", included: true },
      { label: "Channel-manager sync", included: true },
      { label: "Revenue analytics", included: true },
      { label: "Dedicated success manager", included: false },
    ],
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For portfolios with enterprise needs.",
    monthlyPrice: 100,
    annualPrice: 80,
    recommended: false,
    cta: "Contact sales",
    features: [
      { label: "Unlimited properties", included: true },
      { label: "Unlimited rooms", included: true },
      { label: "24/7 phone support", included: true },
      { label: "Channel-manager sync", included: true },
      { label: "Revenue analytics", included: true },
      { label: "Dedicated success manager", included: true },
    ],
  },
];

/* ── Pure helpers (exported for direct testing) ─────────── */

/** Whole-dollar USD, e.g. `formatPrice(1200)` → `"$1,200"`. */
export function formatPrice(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

/** The per-month price shown for a plan under the selected billing period. */
export function perMonthPrice(plan: PricingPlan, period: BillingPeriod): number {
  return period === "annual" ? plan.annualPrice : plan.monthlyPrice;
}

/** What an annual subscription bills up front — twelve months at the annual rate. */
export function annualBilledTotal(plan: PricingPlan): number {
  return plan.annualPrice * 12;
}

/** Whole-percent discount of the annual rate versus the monthly rate. */
export function discountPercent(plan: PricingPlan): number {
  if (plan.monthlyPrice <= 0) return 0;
  return Math.round((1 - plan.annualPrice / plan.monthlyPrice) * 100);
}

/** The best annual saving across all plans — what the toggle advertises. */
export function maxDiscountPercent(plans: PricingPlan[]): number {
  return plans.reduce((max, plan) => Math.max(max, discountPercent(plan)), 0);
}

/* ── Billing toggle segments ─────────────────── */

const BILLING_SEGMENTS: { id: BillingPeriod; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Annual" },
];

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `const [period, setPeriod] = useState<BillingPeriod>("monthly");

<SegmentedControl
  aria-label="Billing period"
  segments={[{ id: "monthly", label: "Monthly" }, { id: "annual", label: "Annual" }]}
  value={period}
  onChange={(id) => setPeriod(id === "annual" ? "annual" : "monthly")}
/>

{plans.map((plan) => (
  <article data-recommended={plan.recommended} aria-labelledby={\`\${plan.id}-name\`}>
    {plan.recommended && <Badge variant="accent">Most popular</Badge>}
    <Text as="h3" id={\`\${plan.id}-name\`}>{plan.name}</Text>
    <Text as="span" variant="display">{formatPrice(perMonthPrice(plan, period))}</Text>
    <ul>
      {plan.features.map((f) => (
        <li data-included={f.included}>
          <span aria-hidden="true">{f.included ? "\u2713" : "\u2013"}</span>
          <span className={srOnly}>{f.included ? "Included" : "Not included"}</span>
          {f.label}
        </li>
      ))}
    </ul>
    <Button variant={plan.recommended ? "primary" : "secondary"}>{plan.cta}</Button>
  </article>
))}`;

const COMPOSITION_NOTES: ReactNode = (
  <Stack gap="sm">
    <CompositionNote>
      The billing toggle is a <code>SegmentedControl</code> (a WAI-ARIA radiogroup), so it is fully
      keyboard-operable and every displayed price recomputes from the same fixture when the period
      changes. The annual saving is stated as text next to the toggle, not left to the viewer to
      infer from the numbers.
    </CompositionNote>
    <CompositionNote>
      The recommended plan is called out three ways — a “Most popular” badge, a heavier accent
      border, and a <code>data-recommended</code> hook — so the distinction survives greyscale,
      high-contrast modes, and screen readers rather than relying on colour alone.
    </CompositionNote>
    <CompositionNote>
      Each feature pairs a shape-bearing glyph (check vs. dash) with visually-hidden “Included” /
      “Not included” text, so inclusion is never signalled by colour only. Every colour, space, and
      radius comes from Rialto tokens, so the table inherits light and dark themes untouched.
    </CompositionNote>
  </Stack>
);

/* ── Feature row ─────────────────────────────── */

// The glyph is decorative (aria-hidden); its shape (check vs. dash) plus the
// visually-hidden "Included" / "Not included" text carry the meaning, so
// inclusion is never signalled by colour alone.
function FeatureItem({ feature }: { feature: PlanFeature }) {
  return (
    <li className={styles.feature} data-included={feature.included}>
      <Text className={styles.indicator} aria-hidden="true">
        <svg
          className={styles.glyph}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={feature.included ? "m3 8.5 3.2 3.2L13 5" : "M4 8h8"} />
        </svg>
      </Text>
      <Text as="span" variant="detail" className={styles.srOnly}>
        {feature.included ? "Included" : "Not included"}
      </Text>
      <Text
        as="span"
        variant="body"
        color={feature.included ? "primary" : "tertiary"}
        className={feature.included ? styles.featureLabel : styles.featureLabelExcluded}
      >
        {feature.label}
      </Text>
    </li>
  );
}

/* ── Plan card ───────────────────────────────── */

function PlanCard({ plan, period }: { plan: PricingPlan; period: BillingPeriod }) {
  const nameId = `${plan.id}-name`;
  return (
    <article
      className={plan.recommended ? styles.planRecommended : styles.plan}
      data-recommended={plan.recommended}
      aria-labelledby={nameId}
    >
      <div className={styles.planHead}>
        {plan.recommended && (
          <div className={styles.ribbon}>
            <Badge variant="accent">Most popular</Badge>
          </div>
        )}
        <Text variant="label" as="h3" id={nameId} className={styles.planName}>
          {plan.name}
        </Text>
        <Text variant="caption" color="secondary" className={styles.planTagline}>
          {plan.tagline}
        </Text>
      </div>

      <div className={styles.priceBlock}>
        <div className={styles.priceRow}>
          <Text as="span" variant="display" className={styles.amount}>
            {formatPrice(perMonthPrice(plan, period))}
          </Text>
          <Text as="span" variant="caption" color="tertiary" className={styles.per}>
            /mo
          </Text>
        </div>
        <Text as="span" variant="caption" color="secondary" className={styles.billingNote}>
          {period === "annual"
            ? `${formatPrice(annualBilledTotal(plan))} billed annually`
            : "Billed monthly"}
        </Text>
      </div>

      <ul className={styles.features}>
        {plan.features.map((feature) => (
          <FeatureItem key={feature.label} feature={feature} />
        ))}
      </ul>

      <div className={styles.cta}>
        <Button variant={plan.recommended ? "primary" : "secondary"} className={styles.ctaButton}>
          {plan.cta}
        </Button>
      </div>
    </article>
  );
}

/* ── Page component ──────────────────────────── */

export function PricingTableExamplePage() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const savings = maxDiscountPercent(PRICING_PLANS);

  return (
    <ExamplePageLayout
      name="Pricing Table"
      description="Three-tier pricing with a monthly/annual billing toggle, a highlighted recommended plan, and an accessible feature comparison"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <Stack gap="lg">
        <div className={styles.billing}>
          <Text as="span" variant="label" color="secondary" className={styles.billingLabel}>
            Billing
          </Text>
          <SegmentedControl
            aria-label="Billing period"
            segments={BILLING_SEGMENTS}
            value={period}
            onChange={(id) => setPeriod(id === "annual" ? "annual" : "monthly")}
          />
          <Badge variant="success">Save {savings}%</Badge>
        </div>

        <div className={styles.tiers}>
          {PRICING_PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} period={period} />
          ))}
        </div>
      </Stack>
    </ExamplePageLayout>
  );
}

PricingTableExamplePage.displayName = "PricingTableExamplePage";
