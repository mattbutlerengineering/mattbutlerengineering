import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ONBOARDING_STEPS } from "./onboarding-steps";
import styles from "./venue-onboarding.module.css";

interface VerticalStepRailProps {
  /** 1-based index of the step currently shown in the form. */
  currentStep: number;
  /** Highest step the user has reached — steps up to this value are navigable. */
  highestStepReached?: number;
  /** Navigate to a reached step. Steps are only clickable when provided. */
  onStepClick?: (step: number) => void;
}

const CHECKMARK = "✓";

/**
 * Vertical, always-visible progress rail for the onboarding wizard's left brand
 * panel. Each step shows a number (or a checkmark once completed), a label, and
 * a one-line description. The current step is highlighted, completed steps are
 * checked, and future steps are muted. Reached steps preserve the clickable
 * navigation and keyboard support of the horizontal `StepIndicator`.
 *
 * On narrow viewports the rail is hidden by CSS in favour of the condensed
 * horizontal `StepIndicator` rendered above the form.
 */
export function VerticalStepRail({
  currentStep,
  highestStepReached = currentStep,
  onStepClick,
}: VerticalStepRailProps) {
  const { t } = useTranslation();
  return (
    <nav className={styles.rail} aria-label={t("onboarding.progress.rail")}>
      <ol className={styles.railList}>
        {ONBOARDING_STEPS.map((step, i) => {
          const stepNumber = i + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = stepNumber < currentStep;
          const isReachable = stepNumber <= highestStepReached && !isActive;
          const isClickable = isReachable && Boolean(onStepClick);

          const stateClass = isActive
            ? styles.railStepActive
            : isCompleted
              ? styles.railStepCompleted
              : isReachable
                ? styles.railStepReachable
                : styles.railStepPending;

          const marker = (
            <span className={styles.railMarker} aria-hidden="true">
              {isCompleted ? CHECKMARK : stepNumber}
            </span>
          );
          const body = (
            <span className={styles.railBody}>
              <span className={styles.railLabel}>{t(`onboarding.steps.${step.id}.label`)}</span>
              <span className={styles.railDescription}>
                {t(`onboarding.steps.${step.id}.description`)}
              </span>
            </span>
          );

          const handleClick = () => onStepClick?.(stepNumber);
          const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onStepClick?.(stepNumber);
            }
          };

          return (
            <li
              key={stepNumber}
              className={`${styles.railStep} ${stateClass}`}
              aria-current={isActive ? "step" : undefined}
            >
              {isClickable ? (
                <button
                  type="button"
                  className={styles.railTrigger}
                  onClick={handleClick}
                  onKeyDown={handleKeyDown}
                >
                  {marker}
                  {body}
                </button>
              ) : (
                <div className={styles.railTrigger}>
                  {marker}
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
