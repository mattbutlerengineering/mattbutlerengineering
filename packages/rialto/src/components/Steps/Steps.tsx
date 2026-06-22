import { forwardRef } from "react";
import { cn } from "../../utils/class-composer";
import styles from "./Steps.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Describes a single step in a multi-step flow.
 *
 * @example
 * const step: StepItem = {
 *   label: "Shipping",
 *   description: "Enter your address",
 * };
 */
export interface StepItem {
  label: string;
  description?: string;
}

/**
 * Multi-step progress indicator for wizards, checkout flows, or onboarding sequences.
 * Steps before `currentStep` display a check mark; the active step is highlighted with the accent color.
 *
 * @example
 * <Steps
 *   steps={[
 *     { label: "Cart" },
 *     { label: "Shipping" },
 *     { label: "Payment" },
 *   ]}
 *   currentStep={1}
 *   onStepClick={(i) => setStep(i)}
 * />
 */
export interface StepsProps {
  steps: StepItem[];
  /** Zero-indexed current step */
  currentStep: number;
  orientation?: "horizontal" | "vertical";
  /** Compact node size, hides descriptions */
  compact?: boolean;
  /** Callback when a step is clicked — enables clickable navigation */
  onStepClick?: (index: number) => void;
  className?: string;
}

/* ── Component ──────────────────────────────── */
export const Steps = forwardRef<HTMLDivElement, StepsProps>(
  (
    {
      steps,
      currentStep,
      orientation = "horizontal",
      compact = false,
      onStepClick,
      className = "",
    },
    ref
  ) => {
    const containerClass = cn(
      orientation === "horizontal" ? styles.horizontal : styles.vertical,
      compact && styles.compact,
      className
    );

    return (
      <div ref={ref} className={containerClass} role="list" aria-label="Progress steps">
        {steps.map((step, i) => {
          const state = i < currentStep ? "completed" : i === currentStep ? "current" : "upcoming";

          const stepClass = cn(
            styles.step,
            state === "completed" && styles.completed,
            state === "current" && styles.current,
            onStepClick && styles.clickable
          );

          const inner = (
            <>
              <div className={styles.node}>
                {state === "completed" ? (
                  <svg className={styles.checkIcon} viewBox="0 0 14 14">
                    <polyline points="3 7.5 6 10.5 11 4" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <div className={styles.content}>
                <span className={styles.stepLabel}>{step.label}</span>
                {step.description && (
                  <span className={styles.stepDescription}>{step.description}</span>
                )}
              </div>
            </>
          );

          return (
            <div
              key={i}
              className={stepClass}
              role="listitem"
              aria-current={state === "current" ? "step" : undefined}
            >
              {onStepClick ? (
                <button className={styles.stepButton} onClick={() => onStepClick(i)} type="button">
                  {inner}
                </button>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>
    );
  }
);
Steps.displayName = "Steps";
